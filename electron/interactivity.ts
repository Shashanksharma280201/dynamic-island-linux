import type { BrowserWindow } from 'electron'
import { readCursor } from './cursor'
import { pointInRect, type Rect } from '@shared/hitbox'

/** How soon to look at the pointer again: often near the island, less when it's far away (fewer wake-ups). Pure. */
export function nextCheckMs(p: { x: number; y: number } | null, r: Rect | null): number {
  if (!p || !r) return 100
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height))
  return Math.hypot(dx, dy) > 200 ? 100 : 40
}

/**
 * Drives island interactivity on X11 without relying on Electron's `forward`
 * flag (unimplemented on Linux). Polls the global cursor and toggles
 * ignore-mouse-events so the window is click-through everywhere except over the
 * island. The same signal is the authoritative hover state for the renderer
 * (DOM mouseleave is unreliable once the window stops receiving events).
 */
export class Interactivity {
  private rect: Rect | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private ignoring = true
  private busy = false
  private hoverCb: ((inside: boolean) => void) | null = null
  private failures = 0
  private locked = false

  constructor(private win: BrowserWindow) {
    this.win.setIgnoreMouseEvents(true)
  }

  /** Island hit area in physical screen pixels (X11 root coordinates). */
  setRect(r: Rect | null): void {
    this.rect = r
  }

  /** Keep the window interactive regardless of the cursor (e.g. while dragging). */
  lock(on: boolean): void {
    this.locked = on
    if (on && this.ignoring) {
      this.win.setIgnoreMouseEvents(false)
      this.ignoring = false
    }
  }

  onHover(cb: (inside: boolean) => void): void {
    this.hoverCb = cb
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.schedule(40)
  }

  private schedule(ms: number): void {
    if (!this.running) return
    this.timer = setTimeout(() => void this.tick(), ms)
  }

  private async tick(): Promise<void> {
    let p: { x: number; y: number } | null = null
    if (this.win.isDestroyed()) return this.stop()
    if (this.busy || this.locked) return this.schedule(40)
    this.busy = true
    try {
      p = this.rect ? await readCursor() : null
      if (this.rect && !p && ++this.failures === 25) {
        console.error(
          '[interactivity] cannot read the X11 cursor; the island will stay click-through. ' +
            'Is DISPLAY set and is this an X11 session?',
        )
      }
      if (p) this.failures = 0
      const inside = !!(p && this.rect && pointInRect(p.x, p.y, this.rect))
      if (inside === !this.ignoring) return
      this.win.setIgnoreMouseEvents(!inside)
      this.ignoring = !inside
      this.hoverCb?.(inside)
      if (process.env.DI_DEBUG)
        console.error(`[interactivity] ${inside ? 'INTERACTIVE' : 'click-through'}`)
    } finally {
      this.busy = false
      this.schedule(nextCheckMs(p, this.rect))
    }
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
