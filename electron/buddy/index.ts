import type { Display } from 'electron'
import { IDLE_BUDDY, buddyPrompt, mapPoint, parseReply, quickCommand, steerLike, walkthrough, type BuddyConfig, type BuddyOffer, type BuddyPoint, type BuddyView, type Shot } from '@shared/buddy'
import { approvalWord, interruptKind, parseActions } from '@shared/jarvis'
import { egress } from '../privacy'

export type BuddyDeps = {
  config: () => BuddyConfig
  /** The character's name: the buddy is them. */
  name: () => string
  /** One answer from the AI in Settings › AI, with a screenshot (JPEG, base64) when given. */
  model: (o: { system: string; prompt: string; image?: string }) => Promise<string>
  brief: () => string
  /** A few lines from the brain that may help with this question ('' when none). */
  notes: (question: string) => Promise<string>
  /** Keep the question and answer in the brain's inbox. */
  save: (heard: string, reply: string) => void
  /** The display you're working on (the one with the pointer). */
  display: () => Display
  capture: (d: Display, privateWords: string[]) => Promise<{ jpeg: string; shot: Shot; blanked: number } | null>
  /** Where the pointer's arrow starts: the island. */
  from: () => { x: number; y: number }
  pointer: {
    show: (p: BuddyPoint, from: { x: number; y: number }, step?: { n: number; of: number }) => void
    hide: () => void
    hiddenFor: <T>(f: () => Promise<T>) => Promise<T>
  }
  /** Say one sentence; resolves when it has been said. */
  speak: (sentence: string) => Promise<void>
  stopSpeaking: () => void
  onChange: (v: BuddyView) => void
  now?: () => number
  /** The island's assistant: hand it work, ask how it's going, stop it; and what's running now. */
  assistant?: { busy: () => boolean; status: () => string; ask: (task: string) => void; stop: () => void; work: () => string }
  /** A permission prompt waiting (Claude Code or the assistant), to answer by voice. */
  approvals?: { pending: () => string | null; answer: (a: 'allow' | 'deny' | 'always') => boolean }
  /** Keep a fact about you in the brain's 00-me, after your yes. */
  remember?: (fact: string) => void
  /** Click (screen points) or type for you, after your yes. */
  act?: { click: (x: number, y: number) => Promise<void>; type: (text: string) => Promise<void> }
}

const plain = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * The buddy: you ask (spoken or typed), it looks at your screen with private
 * windows blacked out, answers out loud with captions on the island, and
 * points at what it means, one step at a time for a walkthrough.
 */
export class Buddy {
  private v: BuddyView = { ...IDLE_BUDDY }
  private run = 0
  private restTimer: NodeJS.Timeout | null = null

  constructor(private d: BuddyDeps) {}

  view(): BuddyView {
    return { ...this.v, wake: this.d.config().on && this.d.config().wake, interrupt: this.d.config().on && this.d.config().interrupt }
  }

  private set(v: Partial<BuddyView>): void {
    this.v = { ...this.v, ...v }
    this.d.onChange(this.view())
  }

  /** The settings changed (the wake word, on or off): tell the island. */
  refresh(): void {
    this.d.onChange(this.view())
  }

  /** Say these lines, one by one, with captions (the morning brief); only when it isn't busy. */
  async speakLines(lines: string[]): Promise<boolean> {
    if (this.v.phase !== 'idle' || !lines.length) return false
    this.d.stopSpeaking()
    const run = ++this.run
    this.set({ phase: 'speaking', heard: '', caption: lines[0], reply: lines.join(' '), points: [], step: 0, error: null })
    await this.say(lines, run)
    if (run === this.run) this.done(run)
    return true
  }

  /** Say something urgent (the announcer decided it should be said). */
  announce(line: string): void {
    if (this.v.phase !== 'idle') return
    void this.sayShort('', line)
  }

  /** You asked something. Words like "next" or "stop" steer what's going on instead. */
  async ask(text: string): Promise<void> {
    const t = text.trim().slice(0, 2000)
    if (!t) return
    // Yes or no: for its own offer first, then a permission prompt that's waiting.
    const yes = approvalWord(t)
    if (yes && this.v.offer) return this.answer(yes !== 'deny')
    if (yes && this.d.approvals?.pending()) {
      const what = this.d.approvals.pending()
      if (this.d.approvals.answer(yes)) return this.sayShort(t, yes === 'deny' ? 'Okay, not that.' : `Allowed${what ? `: ${what}` : ''}.`)
    }
    // While work it handed off is running: how's it going, stop, or a change of plan.
    if (this.v.task && !this.v.task.done && this.d.assistant?.busy()) {
      const k = interruptKind(t)
      if (k === 'status') return this.sayShort(t, this.d.assistant.status())
      if (k === 'cancel') {
        this.d.assistant.stop()
        this.set({ task: { ...this.v.task, status: 'Stopped', done: true } })
        return this.sayShort(t, 'Stopped it.')
      }
      if (steerLike(t)) {
        this.d.assistant.stop()
        this.d.assistant.ask(`Change of plan for what you were doing (${this.v.task.text}): ${t}`)
        this.set({ task: { text: this.v.task.text, status: 'Changing course…', done: false } })
        return this.sayShort(t, 'Okay, changing course.')
      }
    }
    const cmd = quickCommand(t)
    const busy = this.v.phase === 'speaking' || this.v.phase === 'pointing'
    if (cmd && (busy || ((cmd === 'repeat' || cmd === 'stop') && this.v.reply))) return this.command(cmd)
    if (!this.d.config().on) return this.set({ ...IDLE_BUDDY, heard: t, error: 'The buddy is off (Settings › Buddy).' })
    this.quiet()
    const run = ++this.run
    this.set({ ...IDLE_BUDDY, phase: 'thinking', heard: t })
    try {
      const cfg = this.d.config()
      let shot: Shot | null = null
      let jpeg: string | undefined
      let blanked = 0
      if (cfg.look) {
        // Paused (Settings › Privacy): don't even take the picture.
        const paused = egress.blocked()
        if (paused) throw new Error(paused)
        const d = this.d.display()
        const c = await this.d.pointer.hiddenFor(() => this.d.capture(d, cfg.private)).catch(() => null)
        if (c) {
          shot = c.shot
          jpeg = c.jpeg
          blanked = c.blanked
        }
      }
      if (run !== this.run) return
      const notes = await this.d.notes(t).catch(() => '')
      const canAct = !!(this.d.assistant || this.d.remember || this.d.act)
      const system = buddyPrompt({ name: this.d.name(), tone: cfg.tone, brief: this.d.brief(), notes, canSee: !!shot, shot, canAct, work: this.d.assistant?.work() })
      const answer = await this.d.model({ system, prompt: t, image: jpeg })
      if (run !== this.run) return
      const parsed = parseReply(answer, shot)
      const { speech, actions } = parseActions(parsed.speech)
      const points = parsed.points
      if (!speech && !points.length && !actions.length) throw new Error('It didn’t answer. Try asking another way?')
      // Real work goes to the assistant; the rest waits for your yes.
      let task: BuddyView['task'] = null
      let offer: BuddyOffer | null = null
      for (const a of actions) {
        if (a.t === 'do' && this.d.assistant && !task) {
          this.d.assistant.ask(a.task)
          task = { text: a.task, status: 'Starting…', done: false }
        } else if (!offer && a.t === 'remember' && this.d.remember) offer = { kind: 'remember', text: a.fact }
        else if (!offer && a.t === 'type' && this.d.act) offer = { kind: 'type', text: a.text }
        else if (!offer && a.t === 'click' && this.d.act && shot) offer = { kind: 'click', text: a.label || 'there', ...mapPoint(a.x, a.y, shot) }
      }
      this.set({ phase: 'speaking', reply: speech, points, step: 0, looked: !!shot, blanked, caption: '', task, offer })
      if (offer?.kind === 'click') this.d.pointer.show({ x: offer.x, y: offer.y, label: `Click ${offer.text}?` }, this.d.from())
      else if (points.length) this.point(0)
      if (cfg.save) {
        try {
          this.d.save(t, speech)
        } catch {
          // the brain is off or busy: nothing to keep
        }
      }
      await this.say(walkthrough(speech, points.length).first, run)
      if (run !== this.run) return
      // A walkthrough waits for "next"; an answer rests after a moment.
      this.done(run)
    } catch (e) {
      if (run !== this.run) return
      this.d.pointer.hide()
      this.set({ ...IDLE_BUDDY, heard: t, error: plain(e) })
    }
  }

  /** Your yes or no to what it offered (keep a fact, click, type). */
  async answer(yes: boolean): Promise<void> {
    const o = this.v.offer
    if (!o) return
    this.set({ offer: null })
    if (o.kind === 'click') this.d.pointer.hide()
    if (!yes) return this.sayShort('', 'Okay.')
    try {
      if (o.kind === 'remember') this.d.remember?.(o.text)
      else if (o.kind === 'click') await this.d.act?.click(o.x, o.y)
      else await this.d.act?.type(o.text)
      await this.sayShort('', o.kind === 'remember' ? 'Kept.' : 'Done.')
    } catch (e) {
      this.set({ error: plain(e) })
    }
  }

  /** The work it handed off moved on (or finished, with the answer's first line). */
  taskUpdate(status: string, done: boolean, summary = ''): void {
    if (!this.v.task || this.v.task.done) return
    this.set({ task: { ...this.v.task, status, done } })
    if (done && summary && this.v.phase === 'idle') void this.sayShort('', summary)
  }

  /** A short spoken line on the island (an answer to yes, no or how's it going). */
  private async sayShort(heard: string, line: string): Promise<void> {
    this.d.stopSpeaking()
    const run = ++this.run
    this.set({ phase: 'speaking', heard: heard || this.v.heard, caption: line, reply: line, points: [], step: 0, error: null })
    await this.d.speak(line).catch(() => {})
    if (run === this.run) this.done(run)
  }

  /** Next or back in a walkthrough, stop talking, or say it again. */
  async command(c: 'next' | 'back' | 'stop' | 'repeat'): Promise<void> {
    if (c === 'stop') {
      this.quiet()
      this.run++
      this.set({ ...IDLE_BUDDY })
      return
    }
    const n = this.v.points.length
    const w = walkthrough(this.v.reply, n)
    if (c === 'repeat') {
      if (!this.v.reply) return
      this.d.stopSpeaking()
      const r = ++this.run
      this.set({ phase: 'speaking' })
      if (n) this.point(this.v.step)
      await this.say(w.steps && this.v.step > 0 ? [w.steps[this.v.step]] : w.first, r)
      if (r === this.run) this.done(r)
      return
    }
    if (!n) return
    const step = this.v.step + (c === 'next' ? 1 : -1)
    if (step >= n) {
      // Past the last step: done.
      this.quiet()
      this.run++
      this.set({ ...IDLE_BUDDY })
      return
    }
    const s = Math.max(0, step)
    this.d.stopSpeaking()
    const r = ++this.run
    this.set({ step: s, phase: 'speaking' })
    this.point(s)
    if (w.steps) await this.say(s === 0 ? w.first : [w.steps[s]], r)
    if (r === this.run) this.done(r)
  }

  private done(run: number): void {
    const n = this.v.points.length
    this.set({ phase: n ? 'pointing' : 'speaking', caption: '' })
    // A walkthrough waits for "next", an offer for your answer; one spot stays a little; an answer rests soon.
    this.restIn(n > 1 ? 120_000 : this.v.offer ? 60_000 : n ? 8000 : 5000, run)
  }

  private point(i: number): void {
    const p = this.v.points[i]
    if (!p) return
    this.d.pointer.show(p, this.d.from(), { n: i + 1, of: this.v.points.length })
  }

  private async say(lines: string[], run: number): Promise<void> {
    for (const line of lines) {
      if (run !== this.run) return
      this.set({ caption: line })
      await this.d.speak(line).catch(() => {})
    }
  }

  private restIn(ms: number, run: number): void {
    if (this.restTimer) clearTimeout(this.restTimer)
    this.restTimer = setTimeout(() => {
      if (run !== this.run) return
      this.d.pointer.hide()
      // Work still running stays on the island; an unanswered offer goes.
      const task = this.v.task && !this.v.task.done ? this.v.task : null
      this.set({ ...IDLE_BUDDY, task })
    }, ms)
    this.restTimer.unref?.()
  }


  /** Stop talking and pointing. */
  private quiet(): void {
    if (this.restTimer) clearTimeout(this.restTimer)
    this.restTimer = null
    this.d.stopSpeaking()
    this.d.pointer.hide()
  }

  stop(): void {
    this.quiet()
    this.run++
  }
}
