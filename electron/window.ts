import { BrowserWindow, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export function createIslandWindow(): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const height = 500
  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
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
    webPreferences: {
      preload: resolve(here, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Click-through is managed by the Interactivity cursor loop (main process),
  // not the unimplemented-on-Linux `forward` flag.
  win.setIgnoreMouseEvents(true)
  win.setBounds({ x: 0, y: 0, width, height })
  return win
}
