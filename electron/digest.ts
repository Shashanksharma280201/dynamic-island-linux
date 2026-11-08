import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildEvening, digestDue, digestTime, parseDigestState, type DigestItem, type DigestState, type EveningCard } from '@shared/digest'
import type { CenterEntry } from '@shared/notifCenter'

export type DigestDeps = {
  file: string
  config: () => { on: boolean; at: number }
  /** The notification center's list (unseen ones count). */
  entries: () => CenterEntry[]
  /** The card changed (show it, or put it away). */
  onCard: (c: EveningCard | null) => void
  now?: () => number
}

/**
 * The evening digest: keeps what wasn't said out loud, and once a day at
 * its hour (or as soon as the computer is awake after it) shows what was
 * kept and the notifications you didn't get to, if there's anything.
 */
export class Digest {
  private s: DigestState
  private timer: NodeJS.Timeout | null = null

  constructor(private d: DigestDeps) {
    let raw: unknown = null
    try {
      raw = JSON.parse(readFileSync(d.file, 'utf8'))
    } catch {
      // first run
    }
    this.s = parseDigestState(raw, this.now())
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.d.file), { recursive: true })
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.s))
      renameSync(`${this.d.file}.tmp`, this.d.file)
    } catch (e) {
      console.error('[island] digest:', e)
    }
  }

  /** Something wasn't said out loud: keep it for the evening. */
  add(item: DigestItem): void {
    this.s.items = [...this.s.items.filter((i) => i.key !== item.key), item].slice(-200)
    this.save()
    this.tick()
  }

  /** The card showing now, if any. */
  card(): EveningCard | null {
    return this.s.card?.state === 'new' ? this.s.card : null
  }

  /** Is it time, and is there anything to tell? */
  tick(): void {
    const c = this.d.config()
    const now = this.now()
    if (!c.on || !digestDue(now, c.at, this.s.lastShown)) return
    // Since the last one, or a day back.
    const since = Math.max(this.s.lastShown, digestTime(now, c.at) - 24 * 3_600_000)
    const card = buildEvening({ now, since, items: this.s.items, entries: this.d.entries() })
    if (!card) return
    this.s.lastShown = now
    this.s.card = card
    this.s.items = this.s.items.filter((i) => i.at > now)
    this.save()
    this.d.onCard(card)
  }

  /** You read it. */
  done(): void {
    if (!this.s.card || this.s.card.state === 'done') return
    this.s.card = { ...this.s.card, state: 'done' }
    this.save()
    this.d.onCard(null)
  }

  start(everyMs = 60_000): void {
    this.stop()
    this.timer = setInterval(() => this.tick(), everyMs)
    this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
