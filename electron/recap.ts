import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { addAnswer, addTurn, parseHistory, type RecapHistory, type Turn } from '@shared/recap'

/**
 * The weekly recap's history (12 weeks of counts, on this computer) and the
 * last week whose recap was shown. Saved a moment after each change.
 */
export class RecapStore {
  private history: RecapHistory = []
  private shown = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private file: string,
    /** Keeping a history is on (Settings). */
    private on: () => boolean,
  ) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      this.history = parseHistory(raw?.history)
      this.shown = typeof raw?.shown === 'string' ? raw.shown : ''
    } catch {
      // nothing yet
    }
  }

  get weeks(): RecapHistory {
    return this.history
  }

  get lastShown(): string {
    return this.shown
  }

  markShown(week: string): void {
    this.shown = week
    this.save()
  }

  turn(t: Turn): void {
    if (!this.on()) return
    this.history = addTurn(this.history, t)
    this.save()
  }

  answer(kind: 'allow' | 'deny' | 'question', at = Date.now()): void {
    if (!this.on()) return
    this.history = addAnswer(this.history, at, kind)
    this.save()
  }

  clear(): void {
    this.history = []
    this.save()
  }

  private save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 500)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify({ history: this.history, shown: this.shown }), { mode: 0o600 })
      renameSync(tmp, this.file)
    } catch (e: any) {
      console.error('[island] recap not saved:', e?.message ?? e)
    }
  }
}
