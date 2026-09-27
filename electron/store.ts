import type { Activity } from '@shared/types'

export class ActivityStore {
  private items: Activity[] = []
  private seq = 0
  private cbs: Array<() => void> = []

  /** Insert or replace by id. Replacing keeps the original position in line. */
  upsert(a: Activity): void {
    const i = this.items.findIndex((x) => x.id === a.id)
    if (i >= 0) this.items[i] = { ...a, seq: this.items[i].seq }
    else this.items.push({ ...a, seq: this.seq++ })
    this.emit()
  }

  remove(id: string): void {
    const i = this.items.findIndex((x) => x.id === id)
    if (i < 0) return
    this.items.splice(i, 1)
    this.emit()
  }

  has(id: string): boolean {
    return this.items.some((x) => x.id === id)
  }

  list(): Activity[] {
    return [...this.items]
  }

  onChange(cb: () => void): void {
    this.cbs.push(cb)
  }

  private emit(): void {
    for (const cb of this.cbs) cb()
  }
}
