import { BrowserWindow, ipcMain, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { companionSpot } from '@shared/companion'
import type { CharacterConfig, CharacterMood } from '@shared/character'
import { COMPANION } from './companionChannels'

const here = dirname(fileURLToPath(import.meta.url))
export const COMPANION_SIZE = 120


/**
 * The desktop companion: your character in a small window of its own on the
 * desktop. It acts out what's going on, you can drag it anywhere (it remembers
 * the spot), and clicking it opens the island.
 */
export class Companion {
  private win: BrowserWindow | null = null
  private state: { mood: CharacterMood; character: CharacterConfig } | null = null

  constructor(
    private d: {
      spot: () => { x: number; y: number } | null
      saveSpot: (p: { x: number; y: number }) => void
      onClick: () => void
    },
  ) {
    ipcMain.on(COMPANION.MOVE, (e, m) => {
      if (!this.win || e.sender !== this.win.webContents || !Number.isFinite(m?.dx) || !Number.isFinite(m?.dy)) return
      const [x, y] = this.win.getPosition()
      this.win.setPosition(Math.round(x + m.dx), Math.round(y + m.dy))
    })
    ipcMain.on(COMPANION.DROP, (e) => {
      if (!this.win || e.sender !== this.win.webContents) return
      const [x, y] = this.win.getPosition()
      this.d.saveSpot({ x, y })
    })
    ipcMain.on(COMPANION.CLICK, (e) => {
      if (this.win && e.sender === this.win.webContents) this.d.onClick()
    })
  }

  get shown(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  show(): void {
    if (this.shown) return
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    const at = companionSpot(this.d.spot(), areas, COMPANION_SIZE)
    const win = new BrowserWindow({
      x: at.x,
      y: at.y,
      width: COMPANION_SIZE,
      height: COMPANION_SIZE,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      title: 'Companion',
      show: false,
      webPreferences: {
        preload: resolve(here, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    win.setVisibleOnAllWorkspaces(true)
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('did-finish-load', () => this.push())
    win.once('ready-to-show', () => win.showInactive())
    win.on('closed', () => (this.win = null))
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/companion.html`)
    else void win.loadFile(resolve(here, '../renderer/companion.html'))
    this.win = win
  }

  hide(): void {
    if (this.shown) this.win!.close()
    this.win = null
  }

  /** What it should look like now. */
  set(mood: CharacterMood, character: CharacterConfig): void {
    if (this.state?.mood === mood && this.state.character === character) return
    this.state = { mood, character }
    this.push()
  }

  private push(): void {
    if (this.shown && this.state) this.win!.webContents.send(COMPANION.STATE, this.state)
  }
}
