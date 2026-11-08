import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { callPaths, callNoteText, callPrompt, callTranscriptText, plainCallNotes, readCallNotes, recorderArgs, type CallNote } from '@shared/calls'
import type { OsAnswer } from '@shared/os'

export type CallsDeps = {
  file: string
  /** Where audio waits to be made out (and is deleted after). */
  dir: string
  /** Make the audio out on this computer (Whisper, in the island's page). */
  transcribe: (wav: string) => Promise<string>
  ask: (o: { feature: string; system: string; prompt: string; purpose: string; interactive?: boolean; consent?: boolean }) => Promise<OsAnswer>
  /** Write a note into the brain (false when there's no brain). */
  writeNote: (path: string, text: string, why: string) => boolean
  /** The recorder: ffmpeg (or, in tests, a stand-in that writes the file and waits). */
  ffmpeg: () => string | null
  pactl?: () => string | null
  /** The recording started or stopped (for the island's red dot). */
  onRecording: (c: CallNote | null) => void
  onChange?: () => void
  now?: () => number
}

const defaultMonitor = (pactl: string): Promise<string | null> =>
  new Promise((resolve) =>
    execFile(pactl, ['get-default-sink'], { timeout: 3000 }, (e, out) => {
      const sink = String(out || '').trim()
      resolve(e || !sink ? null : `${sink}.monitor`)
    }),
  )

/**
 * Call notes: record (microphone and speakers), stop, make it out here,
 * delete the audio, sum it up (the model on this computer first; the cloud
 * only with your yes), and keep it in the brain when you say so.
 */
export class Calls {
  private list: CallNote[] = []
  private rec: { proc: ChildProcess; wav: string; id: string } | null = null

  constructor(private d: CallsDeps) {
    try {
      const raw = JSON.parse(readFileSync(d.file, 'utf8'))
      if (Array.isArray(raw)) this.list = raw.filter((c: CallNote) => c && typeof c.id === 'string').map((c: CallNote) => (['recording', 'transcribing', 'summing'].includes(c.state) ? { ...c, state: 'failed', error: 'The island quit before it finished.' } : c))
    } catch {
      // first run
    }
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  view(): CallNote[] {
    return this.list.slice(0, 10)
  }

  recording(): CallNote | null {
    return this.rec ? (this.list.find((c) => c.id === this.rec!.id) ?? null) : null
  }

  async start(): Promise<CallNote> {
    if (this.rec) return this.recording()!
    const ffmpeg = this.d.ffmpeg()
    if (!ffmpeg) throw new Error('Recording a call needs ffmpeg: sudo apt install ffmpeg')
    mkdirSync(this.d.dir, { recursive: true })
    const id = randomBytes(4).toString('hex')
    const wav = join(this.d.dir, `${id}.wav`)
    const pactl = this.d.pactl?.()
    const monitor = pactl ? await defaultMonitor(pactl) : null
    const proc = spawn(ffmpeg, recorderArgs({ monitor, out: wav }), { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr?.on('data', (b) => (err = (err + String(b)).slice(-2000)))
    const c: CallNote = { id, started: this.now(), state: 'recording' }
    this.list = [c, ...this.list].slice(0, 30)
    this.rec = { proc, wav, id }
    proc.on('exit', (code) => {
      // It stopped by itself (an error, or the length limit): carry on as if you'd pressed Stop.
      if (this.rec?.proc === proc) {
        if (code && !existsSync(wav)) this.fail(c, err.trim().split('\n').pop() || 'The recorder stopped.')
        else void this.stop()
      }
    })
    this.save()
    this.d.onRecording(c)
    return c
  }

  async stop(): Promise<CallNote | null> {
    const r = this.rec
    if (!r) return null
    this.rec = null
    const c = this.list.find((x) => x.id === r.id)!
    c.ended = this.now()
    this.d.onRecording(null)
    // ffmpeg finishes the file on SIGINT.
    await new Promise<void>((resolve) => {
      if (r.proc.exitCode !== null || r.proc.signalCode) return resolve()
      const t = setTimeout(() => {
        r.proc.kill('SIGKILL')
        resolve()
      }, 5000)
      r.proc.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
      r.proc.kill('SIGINT')
    })
    void this.process(c, r.wav)
    return c
  }

  private fail(c: CallNote, error: string): void {
    if (this.rec?.id === c.id) {
      this.rec = null
      this.d.onRecording(null)
    }
    Object.assign(c, { state: 'failed', error })
    this.save()
  }

  private async process(c: CallNote, wav: string): Promise<void> {
    try {
      if (!existsSync(wav) || statSync(wav).size <= 44) throw new Error('Nothing was recorded. Is a microphone connected?')
      Object.assign(c, { state: 'transcribing' })
      this.save()
      c.transcript = (await this.d.transcribe(wav)).trim()
    } catch (e) {
      return this.fail(c, (e as Error).message || 'It couldn’t be made out.')
    } finally {
      // The audio never stays.
      try {
        unlinkSync(wav)
      } catch {
        // already gone
      }
    }
    if (!c.transcript) return this.fail(c, 'Nothing could be made out in that recording.')
    await this.sum(c.id)
  }

  /** Sum it up: here first; the cloud only with your yes. */
  async sum(id: string, consent = false): Promise<CallNote> {
    const c = this.list.find((x) => x.id === id)
    if (!c || !c.transcript) throw new Error('There’s no transcript to sum up.')
    Object.assign(c, { state: 'summing', error: undefined })
    this.save()
    const minutes = Math.max(1, Math.round(((c.ended ?? this.now()) - c.started) / 60_000))
    const p = callPrompt(c.transcript, minutes)
    const r = await this.d.ask({ feature: 'calls', system: p.system, prompt: p.prompt, purpose: 'a call’s transcript, for its notes', interactive: true, consent })
    if (r.ok) Object.assign(c, readCallNotes(r.text), { state: 'done', where: r.meta.where, cost: r.meta.cost })
    else if ('needsConsent' in r) Object.assign(c, { state: 'consent', cloud: r.needsConsent })
    // No model at all: plain notes, so the call isn't lost.
    else Object.assign(c, plainCallNotes(c.transcript), { state: 'done', where: 'none' })
    this.save()
    return c
  }

  /** Keep it without asking the cloud: plain notes. */
  plain(id: string): CallNote {
    const c = this.list.find((x) => x.id === id)
    if (!c?.transcript) throw new Error('There’s no transcript.')
    Object.assign(c, plainCallNotes(c.transcript), { state: 'done', where: 'none' })
    this.save()
    return c
  }

  /** Into the brain: the notes in the inbox, the transcript as a source. */
  keep(id: string): CallNote {
    const c = this.list.find((x) => x.id === id)
    if (!c || c.state !== 'done') throw new Error('The notes aren’t ready yet.')
    const p = callPaths(c)
    if (!this.d.writeNote(p.transcript, callTranscriptText(c), 'a call’s transcript')) throw new Error('Turn on the second brain first (Settings › Second brain).')
    this.d.writeNote(p.note, callNoteText(c), 'call notes')
    c.kept = p.note
    this.save()
    return c
  }

  forget(id: string): void {
    this.list = this.list.filter((c) => c.id !== id || c.state === 'recording')
    this.save()
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.d.file), { recursive: true })
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.list))
      renameSync(`${this.d.file}.tmp`, this.d.file)
    } catch (e) {
      console.error('[island] calls:', e)
    }
    this.d.onChange?.()
  }
}
