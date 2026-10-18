import { BrowserWindow, ipcMain, screen, type Rectangle } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { RING as GEO, SLOT_IDS, dwellStep, ringCenter, type DwellState, type OpenWhen, type PlanEnv, type SlotId } from '@shared/dragActions'
import { DragWatcher, type DragSample } from './dragWatch'
import { RING } from './ringChannels'

const here = dirname(fileURLToPath(import.meta.url))

export type RingDrop = { slot: SlotId; choice?: string; paths: string[] }

type Deps = {
  on: () => boolean
  opens: () => { when: OpenWhen; dwellMs: number }
  env: () => PlanEnv
  onDrop: (drop: RingDrop) => void
  /** The ring showed (for the first-time tip). */
  onShown?: () => void
}

/**
 * Drag actions: while a file is dragged anywhere, holding still (or pressing
 * Alt) opens a ring of actions under the pointer. The ring is a window of
 * its own, which the dragging app sees as a drop target: letting go on an
 * action drops the files on it. Moving away closes it and the drag goes on.
 */
export class DragRing {
  private watcher: DragWatcher
  private win: BrowserWindow | null = null
  private ready = false
  private dwell: DwellState = { anchor: null, bloomed: false }
  private open: { bounds: Rectangle; center: { x: number; y: number } } | null = null
  private dropped = false
  private ownUntil = 0

  constructor(private d: Deps) {
    this.watcher = new DragWatcher({
      onStart: () => this.onStart(),
      onSample: (s) => this.onSample(s),
      onEnd: () => this.onEnd(),
      ownDrag: () => Date.now() < this.ownUntil,
    })
    const mine = (e: Electron.IpcMainEvent) => !!this.win && e.sender === this.win.webContents
    ipcMain.on(RING.READY, (e) => {
      if (mine(e)) this.ready = true
    })
    ipcMain.on(RING.SHOWN, (e) => {
      if (mine(e)) this.d.onShown?.()
    })
    ipcMain.on(RING.NONE, (e) => {
      if (!mine(e)) return
      // Nothing for these files: stay out of this drag.
      this.dwell = { anchor: null, bloomed: true }
      this.close('none')
    })
    ipcMain.on(RING.DROP, (e, m) => {
      if (!mine(e) || !m || !SLOT_IDS.includes(m.slot) || !Array.isArray(m.paths)) return
      const paths = m.paths.filter((p: unknown): p is string => typeof p === 'string' && p.startsWith('/')).slice(0, 50)
      if (!paths.length) return
      this.dropped = true
      this.d.onDrop({ slot: m.slot, choice: typeof m.choice === 'string' ? m.choice.slice(0, 40) : undefined, paths })
      this.close('drop')
    })
  }

  /** Why it isn't running, if it isn't (no X11, Wayland…). */
  get problem() {
    return this.watcher.problem
  }

  async start(): Promise<boolean> {
    const ok = await this.watcher.start()
    if (ok) this.ensureWindow()
    return ok
  }

  private running: Promise<boolean> | null = null

  /** Watch drags or not, as the setting says. False when it can't here. */
  apply(): Promise<boolean> {
    if (this.d.on()) {
      this.running ??= this.start().then((ok) => {
        if (!ok) this.running = null
        return ok
      })
      return this.running
    }
    if (this.running) this.stop()
    return Promise.resolve(false)
  }

  stop(): void {
    this.running = null
    this.watcher.stop()
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  /** The island is starting a drag itself (a result dragged out): leave it be. */
  ownDrag(ms = 20_000): void {
    this.ownUntil = Date.now() + ms
  }

  private scale(): number {
    return screen.getPrimaryDisplay().scaleFactor || 1
  }

  private send(channel: string, v?: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, v)
  }

  private onStart(): void {
    this.dwell = { anchor: null, bloomed: false }
    this.dropped = false
    if (this.open) this.close('none')
  }

  private onSample(s: DragSample): void {
    if (!this.d.on()) return
    const k = this.scale()
    const p = { x: s.x / k, y: s.y / k }
    if (this.open) {
      const { bounds, center } = this.open
      this.send(RING.POINTER, { x: p.x - bounds.x, y: p.y - bounds.y })
      if (Math.hypot(p.x - center.x, p.y - center.y) > GEO.far) {
        // Moved away: the drag goes on, and holding still again reopens it.
        this.close('far')
        this.dwell = { anchor: null, bloomed: false }
      }
      return
    }
    const r = dwellStep(this.dwell, { x: s.x, y: s.y, t: s.t, alt: s.alt }, this.d.opens())
    this.dwell = r.state
    if (r.bloom) this.bloom(p)
  }

  private onEnd(): void {
    if (this.open) this.close(this.dropped ? 'drop' : 'end')
  }

  private bloom(p: { x: number; y: number }): void {
    const win = this.ensureWindow()
    if (!this.ready) return
    const display = screen.getDisplayNearestPoint({ x: Math.round(p.x), y: Math.round(p.y) })
    const c = ringCenter(p, display.workArea)
    const half = GEO.window / 2
    const bounds = { x: c.x - half, y: c.y - half, width: GEO.window, height: GEO.window }
    this.open = { bounds, center: c }
    this.dropped = false
    win.setBounds(bounds)
    this.send(RING.OPEN, { env: this.d.env(), pointer: { x: p.x - bounds.x, y: p.y - bounds.y } })
    win.showInactive()
    win.moveTop()
    // The dragging app only looks at what's under the pointer when it moves.
    setTimeout(() => this.watcher.nudge(), 60)
  }

  private close(why: 'far' | 'end' | 'none' | 'drop'): void {
    if (!this.open) return
    this.open = null
    if (why === 'far') this.send(RING.CLOSE)
    else if (why === 'end') this.send(RING.END)
    // The page folds the ring up (or swallows the file) first.
    const wait = why === 'none' ? 0 : why === 'drop' ? 420 : 230
    setTimeout(() => {
      if (!this.open && this.win && !this.win.isDestroyed()) this.win.hide()
    }, wait)
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = new BrowserWindow({
      width: GEO.window,
      height: GEO.window,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      title: 'Drag actions',
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
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/ring.html`)
    else void win.loadFile(resolve(here, '../renderer/ring.html'))
    this.win = win
    return win
  }
}
