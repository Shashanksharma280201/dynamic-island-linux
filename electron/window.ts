import { BrowserWindow, screen, type Display } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/** Tall enough for the largest card (approval) plus its shadow. */
const HEIGHT = 520

/** The display the island lives on: DI_DISPLAY (index) or the primary one. */
export function islandDisplay(): Display {
  const all = screen.getAllDisplays()
  const i = Number(process.env.DI_DISPLAY)
  return Number.isInteger(i) && all[i] ? all[i] : screen.getPrimaryDisplay()
}

/** Pin the window across the top of its display (handles hotplug/resolution). */
export function placeIslandWindow(win: BrowserWindow): Display {
  const d = islandDisplay()
  win.setBounds({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: HEIGHT })
  return d
}

export function createIslandWindow(): BrowserWindow {
  const d = islandDisplay()
  const win = new BrowserWindow({
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    type: 'dock',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: resolve(here, '../preload/preload.mjs'),
      sandbox: false, // ESM preload requires an unsandboxed preload context
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Click-through is managed by the Interactivity cursor loop (main process),
  // not the unimplemented-on-Linux `forward` flag.
  win.setIgnoreMouseEvents(true)
  // Never navigate away or open new windows from the island.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  placeIslandWindow(win)
  return win
}
