import type { Activity } from '@shared/types'
import type { ActivityStore } from './store'

/**
 * Cards that dismiss themselves (notifications, messages). A card being
 * hovered or replied to is "held": its timer stops, and restarts with a short
 * grace period once released. The queue is capped; the oldest cards go first.
 */
export class TransientCards {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private durations = new Map<string, number>()
  private held = new Set<string>()
  /** Cards on their way out (e.g. "Sent"); hovering no longer keeps them. */
  private closing = new Set<string>()
  private onDismissCbs: Array<(id: string) => void> = []

  constructor(
    private store: ActivityStore,
    private max = 6,
    private graceMs = 2500,
  ) {}

  onDismiss(cb: (id: string) => void): void {
    this.onDismissCbs.push(cb)
  }

  /** Show (or refresh) a card for `ms`. Re-showing the same id restarts its timer. */
  show(a: Activity, ms: number): void {
    this.store.upsert(a)
    this.durations.set(a.id, ms)
    this.arm(a.id, ms)
    let excess = this.durations.size - this.max
    for (const old of [...this.durations.keys()]) {
      if (excess <= 0) break
      if (old === a.id || this.held.has(old)) continue
      this.dismiss(old)
      excess--
    }
  }

  has(id: string): boolean {
    return this.durations.has(id)
  }

  hold(id: string, on: boolean): void {
    if (!this.durations.has(id) || this.closing.has(id)) return
    if (on) {
      this.held.add(id)
      clearTimeout(this.timers.get(id))
      this.timers.delete(id)
    } else if (this.held.delete(id)) {
      this.arm(id, this.graceMs)
    }
  }

  /** Dismiss after `ms` regardless of the card's normal duration (e.g. "Sent"). */
  dismissIn(id: string, ms: number): void {
    if (!this.durations.has(id)) return
    this.held.delete(id)
    this.closing.add(id)
    this.arm(id, ms)
  }

  dismiss(id: string): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    this.durations.delete(id)
    this.held.delete(id)
    this.closing.delete(id)
    this.store.remove(id)
    for (const cb of this.onDismissCbs) cb(id)
  }

  clear(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  private arm(id: string, ms: number): void {
    clearTimeout(this.timers.get(id))
    if (this.held.has(id)) return
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), ms),
    )
  }
}
