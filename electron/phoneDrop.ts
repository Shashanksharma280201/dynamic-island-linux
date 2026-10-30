import { basename } from 'node:path'
import { APPROACH_MS, HOVER_MS, KIND_COLOR, dropKind, dropTitle, sizeText, splitName, type DropApproach } from '@shared/drop'
import type { JobState } from '@shared/types'
import type { DropEvents } from './dropServer'
import type { DropOverlay } from './dropOverlay'

type Deps = {
  overlay: DropOverlay
  /** Show (or update) a card on the island; `made` are the files it can open, show or undo. */
  present: (id: string, job: JobState, made?: string[]) => void
  /** The island's middle, on the screen: where files land. */
  target: () => { x: number; y: number }
  /** "Downloads": where they were saved, for the card. */
  folderLabel: () => string
}

type Drop = {
  a: DropApproach
  /** near: heading for the edge; coming: bytes arriving in the glow; stowed: a slow one, carrying on in the island; landing: flying in. */
  phase: 'near' | 'coming' | 'stowed' | 'landing' | 'done'
  got: number[]
  saved: string[]
  timer?: ReturnType<typeof setTimeout>
  lastCard?: number
}

/** If the page never says the file landed, show its card anyway. */
const LAND_FALLBACK_MS = 3200

/**
 * Phone Drop, from the phone's first nudge to the card on the island: the
 * glow comes up while a file heads for the edge, the file comes out of it as
 * its bytes arrive, then flies into the island, which shows it to open,
 * show in its folder, undo or drag out.
 */
export class PhoneDrop implements DropEvents {
  private drops = new Map<string, Drop>()

  constructor(private d: Deps) {}

  approach(a: DropApproach): void {
    const cur = this.drops.get(a.id)
    if (cur && cur.phase !== 'near') return
    clearTimeout(cur?.timer)
    const drop: Drop = { a, phase: 'near', got: a.files.map(() => 0), saved: [] }
    this.drops.set(a.id, drop)
    const first = a.files[0]
    const { ext } = splitName(first.name)
    this.d.overlay.send({ t: 'approach', id: a.id, side: a.side, at: a.at, thumb: a.thumb, name: dropTitle(a.files), ext, color: KIND_COLOR[dropKind(first.name)] })
    drop.timer = setTimeout(() => this.cancel(a.id), APPROACH_MS)
  }

  cancel(id: string): void {
    const drop = this.drops.get(id)
    if (!drop || drop.phase !== 'near') return
    clearTimeout(drop.timer)
    this.drops.delete(id)
    this.d.overlay.send({ t: 'cancel', id })
  }

  start(id: string, index: number, name: string, size: number): void {
    let drop = this.drops.get(id)
    if (!drop) {
      // Sent without the gesture (or its approach got lost): in from the right.
      this.approach({ id, side: 'right', at: 0.5, files: [{ name, size }], device: 'Your phone' })
      drop = this.drops.get(id)!
    }
    while (drop.a.files.length <= index) drop.a.files.push({ name, size })
    drop.a.files[index] = { name, size }
    while (drop.got.length < drop.a.files.length) drop.got.push(0)
    if (drop.phase !== 'near') return
    clearTimeout(drop.timer)
    drop.phase = 'coming'
    this.d.overlay.send({ t: 'arrive', id })
    drop.timer = setTimeout(() => this.stow(id), HOVER_MS)
  }

  progress(id: string, index: number, got: number): void {
    const drop = this.drops.get(id)
    if (!drop) return
    drop.got[index] = got
    const p = this.fraction(drop)
    if (drop.phase === 'coming') this.d.overlay.send({ t: 'progress', id, p })
    else if (drop.phase === 'stowed' && Date.now() - (drop.lastCard ?? 0) > 250) {
      drop.lastCard = Date.now()
      this.d.present(`drop-${id}`, this.working(drop))
    }
  }

  saved(id: string, index: number, path: string): void {
    const drop = this.drops.get(id)
    if (!drop) return
    drop.saved.push(path)
    drop.got[index] = drop.a.files[index]?.size ?? 0
    if (drop.saved.length < drop.a.files.length) return
    clearTimeout(drop.timer)
    if (drop.phase === 'stowed') return this.done(id)
    drop.phase = 'landing'
    this.d.overlay.send({ t: 'land', id, to: this.d.overlay.toPage(this.d.target()) })
    drop.timer = setTimeout(() => this.done(id), LAND_FALLBACK_MS)
  }

  failed(id: string, why: string): void {
    const drop = this.drops.get(id)
    if (!drop) return
    clearTimeout(drop.timer)
    this.drops.delete(id)
    if (drop.phase !== 'stowed') this.d.overlay.send({ t: 'fail', id })
    this.d.present(`drop-${id}`, { title: 'Didn’t arrive', sub: `${dropTitle(drop.a.files)} from ${drop.a.device}`, phase: 'error', note: why }, drop.saved)
  }

  /** The page: this file's thumbnail reached the island. */
  landed(id: string): void {
    if (this.drops.get(id)?.phase === 'landing') this.done(id)
  }

  /** A slow one: it flies into the island now, which shows how far it's got. */
  private stow(id: string): void {
    const drop = this.drops.get(id)
    if (!drop || drop.phase !== 'coming') return
    drop.phase = 'stowed'
    this.d.overlay.send({ t: 'stow', id, to: this.d.overlay.toPage(this.d.target()) })
    drop.lastCard = Date.now()
    this.d.present(`drop-${id}`, this.working(drop))
  }

  private done(id: string): void {
    const drop = this.drops.get(id)
    if (!drop || drop.phase === 'done') return
    clearTimeout(drop.timer)
    drop.phase = 'done'
    this.drops.delete(id)
    const last = drop.saved[drop.saved.length - 1]
    const name = drop.saved.length === 1 ? basename(last) : dropTitle(drop.a.files)
    const total = drop.a.files.reduce((n, f) => n + f.size, 0)
    this.d.present(
      `drop-${id}`,
      {
        title: `From ${drop.a.device}`,
        sub: name,
        phase: 'done',
        result: {
          path: last,
          name,
          ext: splitName(last).ext,
          color: KIND_COLOR[dropKind(last)],
          meta: `Saved to ${this.d.folderLabel()} · ${sizeText(total)}`,
          // The phone's little picture of it (checked: a data: image URL).
          thumb: drop.a.thumb,
        },
      },
      drop.saved,
    )
  }

  private working(drop: Drop): JobState {
    return { title: `From ${drop.a.device}`, sub: dropTitle(drop.a.files), phase: 'working', progress: this.fraction(drop) }
  }

  private fraction(drop: Drop): number {
    const total = drop.a.files.reduce((n, f) => n + f.size, 0)
    if (!total) return 1
    return Math.min(1, drop.got.reduce((n, g) => n + g, 0) / total)
  }

  stop(): void {
    for (const d of this.drops.values()) clearTimeout(d.timer)
    this.drops.clear()
  }
}
