import { BrowserWindow, ipcMain, type Display } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { DropCmd } from '@shared/drop'
import { DROP } from './dropChannels'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The screen plus a pixel all round: on X11 a window exactly the screen's
 * size comes out a pixel short (Chromium keeps window managers from taking it
 * for a full-screen app), which would leave the edge the light comes in at
 * unlit.
 */
const bleed = (b: Electron.Rectangle) => ({ x: b.x - 1, y: b.y - 1, width: b.width + 2, height: b.height + 2 })

type Deps = {
  /** The screen the island is on: the glow covers it. */
  display: () => Display
  /** A file's thumbnail reached the island. */
  onLanded: (id: string) => void
}

/**
 * Phone Drop's glow: a see-through window over the island's whole screen
 * that never takes a click. Made on the first drop, hidden when nothing
 * shows (the page says when).
 */
export class DropOverlay {
  private win: BrowserWindow | null = null
  private ready = false
  private queue: DropCmd[] = []
  private on: Display | null = null

  constructor(private d: Deps) {
    const mine = (e: Electron.IpcMainEvent) => !!this.win && e.sender === this.win.webContents
    ipcMain.on(DROP.READY, (e) => {
      if (!mine(e)) return
      this.ready = true
      for (const c of this.queue.splice(0)) this.win!.webContents.send(DROP.CMD, c)
    })
    ipcMain.on(DROP.LANDED, (e, id) => {
      if (mine(e) && typeof id === 'string') this.d.onLanded(id)
    })
    ipcMain.on(DROP.IDLE, (e) => {
      if (mine(e) && this.win && !this.win.isDestroyed()) this.win.hide()
    })
  }

  /** Where a point on the screen (DIP) is in the page. */
  toPage(p: { x: number; y: number }): { x: number; y: number } {
    const b = this.win && !this.win.isDestroyed() ? this.win.getBounds() : bleed((this.on ?? this.d.display()).bounds)
    return { x: p.x - b.x, y: p.y - b.y }
  }

  /** Load the page ahead of time (a drag heading for the phone may come), so the light starts at once. */
  prepare(): void {
    this.ensureWindow()
  }

  send(cmd: DropCmd): void {
    const win = this.ensureWindow()
    if (cmd.t === 'approach' || !win.isVisible()) this.cover(win)
    if (!win.isVisible()) win.showInactive()
    if (this.ready) win.webContents.send(DROP.CMD, cmd)
    else this.queue.push(cmd)
  }

  /** Over the island's screen, all of it. */
  private cover(win: BrowserWindow): void {
    const d = this.d.display()
    this.on = d
    const want = bleed(d.bounds)
    const b = win.getBounds()
    if (b.x !== want.x || b.y !== want.y || b.width !== want.width || b.height !== want.height) win.setBounds(want)
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const d = this.d.display()
    this.on = d
    const win = new BrowserWindow({
      ...bleed(d.bounds),
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      backgroundColor: '#00000000',
      title: 'Phone Drop',
      show: false,
      webPreferences: {
        preload: resolve(here, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    win.setIgnoreMouseEvents(true)
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true)
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.on('closed', () => {
      this.win = null
      this.ready = false
    })
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/drop.html`)
    else void win.loadFile(resolve(here, '../renderer/drop.html'))
    this.win = win
    return win
  }
}
