import { BrowserWindow, ipcMain, type Display, type Rectangle } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { isAbsolutePath } from '@shared/dragActions'
import { edgeAim, edgeStrip, type DropSide } from '@shared/drop'
import type { DragSample } from './dragSource'
import type { DropOverlay } from './dropOverlay'
import { DROP } from './dropChannels'

const here = dirname(fileURLToPath(import.meta.url))

type P = { x: number; y: number }

type Deps = {
  /** The phone listening now (its name), or null: then there's nothing to send to. */
  phone: () => string | null
  /** The edge of the island's screen the phone is at. */
  side: () => DropSide
  /** The island's screen (the one the overlay covers). */
  display: () => Display
  overlay: DropOverlay
  /** What's being dragged, asked of the dragging app ([] when it can't say). */
  dragged: () => Promise<string[]>
  /** Send them; `from` is where they were let go, `at` where along the edge. */
  send: (paths: string[], from: P, at: number) => void
  /** Where it stays out of the way (over the island, which takes files itself). */
  avoid?: (p: P) => boolean
}

/**
 * Drag a file on this computer to the edge of the screen where your phone is
 * (the side its files come in from): the edge lights up as you get near,
 * following the pointer, with "Send to <phone>". Let go at the edge and the
 * file is pulled into the light and sent. A thin strip of our own at the edge
 * takes the drop, so the app underneath doesn't get the file too.
 */
export class PhoneEdge {
  private win: BrowserWindow | null = null
  private ready = false
  private strip: Rectangle | null = null
  /** The light is showing for this drag. */
  private lit = false
  /** Letting go now would send. */
  private inside = false
  private last: P | null = null
  private along = 0.5
  /** What's dragged: said at the start (macOS), or asked when it nears the edge (X11). */
  private files: string[] | undefined
  private asked = false
  private done = false
  private sent = { level: -1, at: -1, ready: false }

  constructor(private d: Deps) {
    const mine = (e: Electron.IpcMainEvent) => !!this.win && e.sender === this.win.webContents
    ipcMain.on(DROP.EDGE_READY, (e) => {
      if (mine(e)) this.ready = true
    })
    ipcMain.on(DROP.EDGE_OVER, (e) => {
      if (mine(e) && this.lit) this.inside = true
    })
    ipcMain.on(DROP.EDGE_DROP, (e, paths) => {
      if (!mine(e) || this.done || !Array.isArray(paths)) return
      const ok = paths.filter((p: unknown): p is string => typeof p === 'string' && isAbsolutePath(p)).slice(0, 20)
      if (ok.length) this.fire(ok)
      else this.off()
    })
  }

  /** Whether a point is near the phone's edge with a phone listening (the drag actions ring stays shut there). */
  near(p: P): boolean {
    return !!this.d.phone() && !!edgeAim(p, this.d.display().bounds, this.d.side())
  }

  onStart(files?: string[]): void {
    this.off()
    this.files = files?.length ? files.slice(0, 20) : undefined
    this.asked = false
    this.done = false
    // The strip's page and the light's load with the first drag while a phone listens.
    if (this.d.phone()) {
      this.ensureWindow()
      this.d.overlay.prepare()
    }
  }

  onSample(s: DragSample): void {
    if (this.done) return
    const phone = this.d.phone()
    const p = { x: s.x, y: s.y }
    this.last = p
    const side = this.d.side()
    const b = this.d.display().bounds
    const a = phone && !this.d.avoid?.(p) ? edgeAim(p, b, side) : null
    if (!a) return this.off()
    if (!this.files && !this.asked) {
      this.asked = true
      void this.d.dragged().then((paths) => {
        if (paths.length && !this.files) this.files = paths.slice(0, 20)
      })
    }
    this.lit = true
    this.inside = a.send
    this.along = a.along
    this.showStrip(b, side, a.along)
    // Only what changed (samples come every 30 ms).
    if (Math.abs(a.closeness - this.sent.level) > 0.015 || Math.abs(a.along - this.sent.at) > 0.003 || a.send !== this.sent.ready) {
      this.sent = { level: a.closeness, at: a.along, ready: a.send }
      this.d.overlay.send({ t: 'aim', side, at: a.along, level: a.closeness, ready: a.send, label: a.send ? `Let go to send to ${phone}` : `Send to ${phone}` })
      // Above the light, so the drop lands on the strip.
      if (this.win?.isVisible()) this.win.moveTop()
    }
  }

  onEnd(): void {
    if (!this.lit || this.done) return this.off()
    if (!this.inside) return this.off()
    // Let go at the edge: the light stays for the file, the label goes.
    this.d.overlay.send({ t: 'aim', side: this.d.side(), at: this.along, level: 1, ready: true, label: '' })
    // The drop on the strip comes just after the button is let go; where the
    // system doesn't send one (or the files were known from the start), letting go is the drop.
    setTimeout(() => {
      if (this.done) return
      if (this.files?.length) this.fire(this.files)
      else this.off()
    }, 350)
  }

  stop(): void {
    this.off()
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private fire(paths: string[]): void {
    this.done = true
    const from = this.last ?? { x: 0, y: 0 }
    const at = this.along
    this.hideStrip()
    this.lit = false
    this.inside = false
    this.sent = { level: -1, at: -1, ready: false }
    this.d.send(paths, from, at)
  }

  private off(): void {
    this.hideStrip()
    this.inside = false
    if (!this.lit) return
    this.lit = false
    this.sent = { level: -1, at: -1, ready: false }
    this.d.overlay.send({ t: 'aim', side: this.d.side(), at: this.along, level: 0 })
  }

  private showStrip(b: Rectangle, side: DropSide, along: number): void {
    const win = this.ensureWindow()
    if (!this.ready) return
    const want = edgeStrip(b, side, along)
    const s = this.strip
    // Moves with the pointer only when it nears the strip's ends.
    const far = !s || s.x !== want.x || (side === 'left' || side === 'right' ? Math.abs(want.y - s.y) > s.height * 0.3 : Math.abs(want.x - s.x) > s.width * 0.3)
    if (far) {
      this.strip = want
      win.setBounds(want)
    }
    if (!win.isVisible()) {
      win.showInactive()
      win.moveTop()
    }
  }

  private hideStrip(): void {
    this.strip = null
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide()
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = new BrowserWindow({
      width: 48,
      height: 420,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      title: 'Send to phone',
      show: false,
      webPreferences: {
        preload: resolve(here, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true)
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.on('closed', () => {
      this.win = null
      this.ready = false
    })
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/catch.html`)
    else void win.loadFile(resolve(here, '../renderer/catch.html'))
    this.win = win
    return win
  }
}
