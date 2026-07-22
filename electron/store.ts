import type { Activity } from '@shared/types'

export class ActivityStore {
  private items: Activity[] = []
  private seq = 0
  private order = new Map<string, number>()
  private cbs: Array<() => void> = []

  upsert(a: Activity): void {
    const i = this.items.findIndex((x) => x.id === a.id)
    if (i >= 0) this.items[i] = a
    else this.items.push(a)
    this.order.set(a.id, this.seq++)
    this.emit()
  }

  remove(id: string): void {
    const i = this.items.findIndex((x) => x.id === id)
    if (i < 0) return
    this.items.splice(i, 1)
    this.order.delete(id)
    this.emit()
  }

  list(): Activity[] {
    return [...this.items]
  }

  presented(): Activity | null {
    if (this.items.length === 0) return null
    return [...this.items].sort(
      (a, b) => b.priority - a.priority || this.order.get(b.id)! - this.order.get(a.id)!,
    )[0]
  }

  onChange(cb: () => void): void {
    this.cbs.push(cb)
  }

  private emit(): void {
    for (const cb of this.cbs) cb()
  }
}
