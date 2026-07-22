import type { BrowserWindow } from 'electron'
import { readCursor } from './cursor'
import { pointInRect, type Rect } from '@shared/hitbox'

/**
 * Drives island interactivity on X11 without relying on Electron's `forward`
 * flag (unimplemented on Linux). Polls the global cursor and toggles
 * ignore-mouse-events so the window is click-through everywhere except over the
 * island's reported rectangle.
 */
export class Interactivity {
  private rect: Rect | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private ignoring = true
  private busy = false

  constructor(private win: BrowserWindow) {
    this.win.setIgnoreMouseEvents(true)
  }

  setRect(r: Rect | null): void {
    this.rect = r
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 40)
  }

  private async tick(): Promise<void> {
    if (this.busy || this.win.isDestroyed()) return
    this.busy = true
    try {
      const p = this.rect ? await readCursor() : null
      const inside = !!(p && this.rect && pointInRect(p.x, p.y, this.rect))
      if (inside && this.ignoring) {
        this.win.setIgnoreMouseEvents(false)
        this.ignoring = false
        if (process.env.DI_DEBUG) console.error('[interactivity] INTERACTIVE (cursor over island)')
      } else if (!inside && !this.ignoring) {
        this.win.setIgnoreMouseEvents(true)
        this.ignoring = true
        if (process.env.DI_DEBUG) console.error('[interactivity] click-through (cursor left island)')
      }
    } finally {
      this.busy = false
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
