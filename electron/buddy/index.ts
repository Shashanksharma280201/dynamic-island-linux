import type { Display } from 'electron'
import { IDLE_BUDDY, buddyPrompt, parseReply, quickCommand, walkthrough, type BuddyConfig, type BuddyPoint, type BuddyView, type Shot } from '@shared/buddy'
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
    return this.v
  }

  private set(v: Partial<BuddyView>): void {
    this.v = { ...this.v, ...v }
    this.d.onChange(this.v)
  }

  /** You asked something. Words like "next" or "stop" steer what's going on instead. */
  async ask(text: string): Promise<void> {
    const t = text.trim().slice(0, 2000)
    if (!t) return
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
      const system = buddyPrompt({ name: this.d.name(), tone: cfg.tone, brief: this.d.brief(), notes, canSee: !!shot, shot })
      const answer = await this.d.model({ system, prompt: t, image: jpeg })
      if (run !== this.run) return
      const { speech, points } = parseReply(answer, shot)
      if (!speech && !points.length) throw new Error('It didn’t answer. Try asking another way?')
      this.set({ phase: 'speaking', reply: speech, points, step: 0, looked: !!shot, blanked, caption: '' })
      if (points.length) this.point(0)
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
    // A walkthrough waits for "next"; one spot stays a little; an answer rests soon.
    this.restIn(n > 1 ? 120_000 : n ? 8000 : 5000, run)
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
      this.set({ ...IDLE_BUDDY })
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
