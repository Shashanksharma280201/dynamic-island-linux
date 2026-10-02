import type { BrowserWindow } from 'electron'
import { pointInRect, type Rect } from '@shared/hitbox'

/**
 * Drives island interactivity on X11 without relying on Electron's `forward`
 * flag (unimplemented on Linux). Polls the global cursor and toggles
 * ignore-mouse-events so the window is click-through everywhere except over the
 * island. The same signal is the authoritative hover state for the renderer
 * (DOM mouseleave is unreliable once the window stops receiving events).
 */
export class Interactivity {
  private rect: Rect | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private ignoring = true
  private busy = false
  private hoverCb: ((inside: boolean) => void) | null = null
  private failures = 0
  private locked = false

  constructor(
    private win: BrowserWindow,
    /** The pointer, in the same coordinates as setRect's rect. */
    private readCursor: () => Promise<{ x: number; y: number } | null>,
  ) {
    this.win.setIgnoreMouseEvents(true)
  }

  /** Island hit area, in the cursor's coordinates (X11: physical pixels). */
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
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 40)
  }

  private async tick(): Promise<void> {
    if (this.busy || this.locked || this.win.isDestroyed()) return
    this.busy = true
    try {
      const p = this.rect ? await this.readCursor().catch(() => null) : null
      if (this.rect && !p && ++this.failures === 25) {
        console.error(
          '[interactivity] cannot read the cursor; the island will stay click-through. ' +
            '(On Linux: is DISPLAY set and is this an X11 session?)',
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
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
