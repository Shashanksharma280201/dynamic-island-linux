import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import type { Activity, DecisionMsg, MediaCmd } from '@shared/types'

export function pushState(win: BrowserWindow, activities: Activity[]): void {
  if (win.isDestroyed()) return
  win.webContents.send(IPC.STATE, activities)
}

export function wireIpc(handlers: {
  onDecision: (m: DecisionMsg) => void
  onMediaCmd: (c: MediaCmd) => void
  onHover: (b: boolean) => void
}): void {
  ipcMain.on(IPC.DECISION, (_e, m) => handlers.onDecision(m))
  ipcMain.on(IPC.MEDIA_CMD, (_e, c) => handlers.onMediaCmd(c))
  ipcMain.on(IPC.SET_HOVER, (_e, b) => handlers.onHover(b))
}
