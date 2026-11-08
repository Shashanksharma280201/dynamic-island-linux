import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dateOf } from '@shared/brain'
import { MAX_PER_DAY, parseCaptured, type CapturedMessage } from '@shared/brainMessages'

/**
 * Messages waiting to be kept in the brain: today's (and any day the loop
 * hasn't filed yet), in the island's own folder, never in the vault until
 * the loop writes each day's note.
 */
export class MessageLog {
  private list: CapturedMessage[]
  private timer: NodeJS.Timeout | null = null

  constructor(private file: string) {
    let raw: unknown = null
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      // first run
    }
    this.list = parseCaptured(raw)
  }

  add(m: CapturedMessage): void {
    const day = dateOf(m.at)
    if (this.list.filter((x) => dateOf(x.at) === day).length >= MAX_PER_DAY) return
    this.list.push(m)
    this.saveSoon()
  }

  all(): CapturedMessage[] {
    return [...this.list]
  }

  count(): number {
    return this.list.length
  }

  /** Forget the days that were filed for good (before today). */
  dropDays(days: string[]): void {
    const drop = new Set(days)
    const next = this.list.filter((m) => !drop.has(dateOf(m.at)))
    if (next.length === this.list.length) return
    this.list = next
    this.save()
  }

  /** Forget everything (a source was turned off). */
  clear(source?: CapturedMessage['source']): void {
    this.list = source ? this.list.filter((m) => m.source !== source) : []
    this.save()
  }

  private saveSoon(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.save()
    }, 2000)
    this.timer.unref?.()
  }

  save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.list))
      renameSync(`${this.file}.tmp`, this.file)
    } catch (e) {
      console.error('[brain] messages:', e)
    }
  }
}
