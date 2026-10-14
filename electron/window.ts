import { BrowserWindow, screen, type Display } from 'electron'
import { columnBounds, type Side } from '@shared/dock'
import { displayKey, displayName, pickDisplay, type DisplayInfo, type DisplayPref } from '@shared/displays'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const info = (d: Display, primaryId: number): DisplayInfo => ({ id: d.id, label: d.label ?? '', bounds: d.bounds, primary: d.id === primaryId })

/** The displays, to choose from in Settings. */
export function displayChoices(): { key: string; name: string }[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({ key: displayKey(info(d, primaryId)), name: displayName(info(d, primaryId), i) }))
}

/**
 * The display the island lives on: DI_DISPLAY (index) if set, else your
 * choice in Settings (the main one, the one with the pointer, or a monitor).
 */
export function islandDisplay(pref: DisplayPref = 'primary'): Display {
  const all = screen.getAllDisplays()
  const i = Number(process.env.DI_DISPLAY)
  if (Number.isInteger(i) && all[i]) return all[i]
  const primaryId = screen.getPrimaryDisplay().id
  const cursorId = pref === 'cursor' ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id : undefined
  const pick = pickDisplay(all.map((d) => info(d, primaryId)), pref, cursorId)
  return all.find((d) => d.id === pick?.id) ?? screen.getPrimaryDisplay()
}

/**
 * Pin the window as a transparent column along one side of its display's work
 * area (so it never covers the top bar or dock). Handles hotplug/resolution.
 */
export function placeIslandWindow(win: BrowserWindow, side: Side, pref?: DisplayPref): Display {
  const d = islandDisplay(pref)
  win.setBounds(columnBounds(d.workArea, side))
  return d
}

export function createIslandWindow(side: Side, pref?: DisplayPref): BrowserWindow {
  const b = columnBounds(islandDisplay(pref).workArea, side)
  const win = new BrowserWindow({
    ...b,
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
  placeIslandWindow(win, side, pref)
  return win
}
