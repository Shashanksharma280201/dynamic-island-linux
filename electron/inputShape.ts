import type { BrowserWindow } from 'electron'
// @ts-expect-error - x11 ships no types
import x11 from 'x11'
import type { Rect } from '@shared/hitbox'

type Shape = { ext: any; X: any; xid: number }

/** The X11 window id behind an Electron window. */
export function xidOf(win: BrowserWindow): number {
  const h = win.getNativeWindowHandle()
  return h.length >= 8 ? Number(h.readBigUInt64LE(0)) : h.readUInt32LE(0)
}

/** Window-relative CSS rect → physical-pixel rectangle for XShape. Pure. */
export function shapeRect(r: Rect, scale: number, pad = 0): [number, number, number, number] {
  const x = Math.max(0, Math.floor((r.x - pad) * scale))
  const y = Math.max(0, Math.floor((r.y - pad) * scale))
  return [x, y, Math.ceil((r.width + pad * 2) * scale), Math.ceil((r.height + pad * 2) * scale)]
}

/**
 * Click-through via the X11 SHAPE extension: the window's *input* region is
 * set to the island's rectangle, so the X server itself delivers clicks there
 * and passes everything else to the windows below. Drawing is not clipped, so
 * animations and shadows are unaffected. No cursor polling is needed.
 */
export class InputShape {
  private constructor(private s: Shape) {}

  static create(win: BrowserWindow): Promise<InputShape> {
    return new Promise((resolve, reject) => {
      if (!process.env.DISPLAY) return reject(new Error('no DISPLAY'))
      const timer = setTimeout(() => reject(new Error('X11 connection timed out')), 3000)
      const display = x11.createClient((err: unknown, d: any) => {
        if (err || !d) {
          clearTimeout(timer)
          return reject(err ?? new Error('no display'))
        }
        const X = d.client
        X.require('shape', (e: unknown, ext: any) => {
          clearTimeout(timer)
          if (e || !ext) return reject(e ?? new Error('no SHAPE extension'))
          resolve(new InputShape({ ext, X, xid: xidOf(win) }))
        })
      })
      display?.on?.('error', (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      })
    })
  }

  /** Accept input only inside these physical-pixel rectangles (none = fully click-through). */
  set(rects: [number, number, number, number][]): void {
    const { ext, xid } = this.s
    ext.Rectangles(ext.Op.Set, ext.Kind.Input, xid, 0, 0, rects)
  }

  /** Accept input on the whole window (e.g. while dragging). */
  full(): void {
    this.set([[0, 0, 32767, 32767]])
  }

  close(): void {
    try {
      this.s.X.terminate()
    } catch {
      // already closed
    }
  }
}
