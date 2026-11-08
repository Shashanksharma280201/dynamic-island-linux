import { BrowserWindow, ipcMain, type Display } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { closeWhenIdle } from '../idleClose'
import { BUDDY } from '../buddyChannels'
import type { PointerCmd } from '@shared/pointer'

const here = dirname(fileURLToPath(import.meta.url))
const bleed = (b: Electron.Rectangle) => ({ x: b.x - 1, y: b.y - 1, width: b.width + 2, height: b.height + 2 })

/**
 * The buddy's pointer: a see-through window over the screen that never takes
 * a click, with an arrow that flies from the island to the spot and its label.
 */
export class Pointer {
  private win: BrowserWindow | null = null
  private ready = false
  private queue: PointerCmd[] = []
  private on: Display | null = null
  /** The last place shown, for tests and the island. */
  last: { x: number; y: number; label: string } | null = null

  constructor(private display: () => Display) {
    ipcMain.on(BUDDY.POINTER_READY, (e) => {
      if (!this.win || e.sender !== this.win.webContents) return
      this.ready = true
      for (const c of this.queue.splice(0)) this.win.webContents.send(BUDDY.POINTER, c)
    })
  }

  /** Point at a spot on the screen (DIP), coming from `from` (the island). */
  show(p: { x: number; y: number; label: string }, from: { x: number; y: number }, step?: { n: number; of: number }): void {
    const win = this.ensure()
    const b = win.getBounds()
    this.last = p
    this.send({ t: 'show', x: p.x - b.x, y: p.y - b.y, label: p.label, fromX: from.x - b.x, fromY: from.y - b.y, step })
    if (!win.isVisible()) win.showInactive()
  }

  hide(): void {
    this.last = null
    if (!this.win || this.win.isDestroyed()) return
    this.send({ t: 'hide' })
    const w = this.win
    setTimeout(() => {
      if (!w.isDestroyed() && !this.last) w.hide()
    }, 400)
  }

  /** Hidden while a screenshot is taken, so it never shows in one. */
  async hiddenFor<T>(f: () => Promise<T>): Promise<T> {
    const shown = !!this.win && !this.win.isDestroyed() && this.win.isVisible()
    if (shown) {
      this.win!.hide()
      await new Promise((r) => setTimeout(r, 120))
    }
    try {
      return await f()
    } finally {
      if (shown && this.last && this.win && !this.win.isDestroyed()) this.win.showInactive()
    }
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private send(c: PointerCmd): void {
    if (this.ready && this.win) this.win.webContents.send(BUDDY.POINTER, c)
    else this.queue.push(c)
  }

  private ensure(): BrowserWindow {
    const d = this.display()
    if (this.win && !this.win.isDestroyed()) {
      if (this.on?.id !== d.id) {
        this.win.setBounds(bleed(d.bounds))
        this.on = d
      }
      return this.win
    }
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
      title: 'Buddy pointer',
      show: false,
      webPreferences: { preload: resolve(here, '../preload/preload.mjs'), sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
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
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pointer.html`)
    else void win.loadFile(resolve(here, '../renderer/pointer.html'))
    closeWhenIdle(win)
    this.win = win
    return win
  }
}
