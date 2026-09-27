import type { BrowserWindow } from 'electron'
// @ts-expect-error - x11 ships no types
import x11 from 'x11'
import type { Rect } from '@shared/hitbox'

type Shape = { ext: any; X: any; xid: number; blurAtom?: number }

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

  /**
   * Ask the compositor to blur what's behind these rectangles (physical px).
   * KDE KWin honours _KDE_NET_WM_BLUR_BEHIND_REGION; others ignore it. `null`
   * removes the request.
   */
  setBlur(rects: [number, number, number, number][] | null): void {
    const s = this.s
    const apply = () => {
      if (!rects) {
        s.X.DeleteProperty(s.xid, s.blurAtom)
        return
      }
      const data = Buffer.alloc(rects.length * 16)
      rects.forEach((r, i) => r.forEach((v, j) => data.writeUInt32LE(Math.max(0, v), i * 16 + j * 4)))
      const XA_CARDINAL = 6
      s.X.ChangeProperty(0, s.xid, s.blurAtom, XA_CARDINAL, 32, data)
    }
    if (s.blurAtom) return apply()
    s.X.InternAtom(false, '_KDE_NET_WM_BLUR_BEHIND_REGION', (err: unknown, atom: number) => {
      if (err || !atom) return
      s.blurAtom = atom
      apply()
    })
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
