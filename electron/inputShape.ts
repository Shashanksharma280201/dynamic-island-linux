import type { BrowserWindow } from 'electron'
// @ts-expect-error - x11 ships no types
import x11 from 'x11'
import type { Rect } from '@shared/hitbox'

type Shape = { ext: any; X: any; xid: number; root: number; blurAtom?: number }

const WM_HINTS = 35 // predefined atom (also the property's type)
const INPUT_HINT = 1

/** WM_HINTS with only the input flag set: whether the WM may give us keyboard focus. Pure. */
export function wmHints(input: boolean): Buffer {
  const b = Buffer.alloc(9 * 4)
  b.writeUInt32LE(INPUT_HINT, 0)
  b.writeUInt32LE(input ? 1 : 0, 4)
  return b
}

/** A 32-byte X ClientMessage event (format 32), as sent to the root window. Pure. */
export function clientMessage(window: number, type: number, data: number[]): Buffer {
  const b = Buffer.alloc(32)
  b.writeUInt8(33, 0) // ClientMessage
  b.writeUInt8(32, 1) // format
  b.writeUInt32LE(window, 4)
  b.writeUInt32LE(type, 8)
  data.slice(0, 5).forEach((v, i) => b.writeUInt32LE(v >>> 0, 12 + i * 4))
  return b
}

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
          // A window that vanished (e.g. the app we return focus to) must not crash us.
          X.on('error', (xe: any) => console.error('[island] X11 error:', xe?.message ?? xe))
          resolve(new InputShape({ ext, X, xid: xidOf(win), root: d.screen[0].root }))
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

  private prevFocus = 0
  private activeAtom = 0
  private watch: ReturnType<typeof setInterval> | null = null
  private focusLostCbs: Array<() => void> = []

  /** Called when keyboard focus we took moves to another window (you clicked into another app). */
  onFocusLost(cb: () => void): void {
    this.focusLostCbs.push(cb)
  }

  /** While we hold the keyboard, check who has it; X doesn't reliably tell Chromium. */
  private watchFocus(on: boolean): void {
    if (this.watch) clearInterval(this.watch)
    this.watch = null
    if (!on) return
    const { X, xid } = this.s
    let confirmed = false // focus must have reached us before it can be lost
    this.watch = setInterval(() => {
      X.GetInputFocus((err: unknown, f: any) => {
        if (err || !this.watch) return
        if (f?.focus === xid) return void (confirmed = true)
        if (!confirmed) return
        this.watchFocus(false)
        this.prevFocus = 0 // the app you clicked keeps its focus
        X.ChangeProperty(0, xid, WM_HINTS, WM_HINTS, 32, wmHints(false))
        for (const cb of this.focusLostCbs) cb()
      })
    }, 250)
  }

  /**
   * Give the island real keyboard focus, or hand it back to the app that had
   * it. The island is a dock window created unfocusable, and window managers
   * (Mutter, KWin, …) don't give such windows keys on their own, so we set the
   * input hint, ask the WM to activate us (_NET_ACTIVE_WINDOW, as a pager
   * would) and set the X input focus directly.
   */
  keyboard(on: boolean): void {
    const { X, xid, root } = this.s
    const activate = (win: number) => {
      const send = () => {
        const SubstructureNotify = 0x80000
        const SubstructureRedirect = 0x100000
        X.SendEvent(root, false, SubstructureNotify | SubstructureRedirect, clientMessage(win, this.activeAtom, [2, 0, 0]))
      }
      if (this.activeAtom) return send()
      X.InternAtom(false, '_NET_ACTIVE_WINDOW', (err: unknown, atom: number) => {
        if (err || !atom) return
        this.activeAtom = atom
        send()
      })
    }
    if (on) {
      X.GetInputFocus((err: unknown, f: any) => {
        if (!err && f?.focus > 1 && f.focus !== xid) this.prevFocus = f.focus
        X.ChangeProperty(0, xid, WM_HINTS, WM_HINTS, 32, wmHints(true))
        activate(xid)
        X.SetInputFocus(xid, 2) // RevertToParent
        this.watchFocus(true)
      })
    } else {
      this.watchFocus(false)
      X.ChangeProperty(0, xid, WM_HINTS, WM_HINTS, 32, wmHints(false))
      const prev = this.prevFocus
      this.prevFocus = 0
      // Only hand focus back if we still have it: if you've clicked into
      // another app since, leave it there.
      X.GetInputFocus((err: unknown, f: any) => {
        if (err || f?.focus !== xid) return
        if (prev) {
          activate(prev)
          X.SetInputFocus(prev, 2)
        } else {
          X.SetInputFocus(1, 0) // PointerRoot: keys go to the window under the pointer
        }
      })
    }
  }

  /** Accept input on the whole window (e.g. while dragging). */
  full(): void {
    this.set([[0, 0, 32767, 32767]])
  }

  close(): void {
    this.watchFocus(false)
    try {
      this.s.X.terminate()
    } catch {
      // already closed
    }
  }
}
