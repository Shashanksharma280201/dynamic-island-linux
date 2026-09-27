import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type { Activity, DecisionMsg, MediaCmd, Rect, SystemState, SysCmd } from '@shared/types'

/** Subscribe and return an unsubscribe function. */
function on<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api = {
  onState: (cb: (a: Activity[]) => void) => on(IPC.STATE, cb),
  onSysState: (cb: (s: SystemState) => void) => on(IPC.SYS_STATE, cb),
  onHover: (cb: (inside: boolean) => void) => on(IPC.HOVER, cb),
  sendDecision: (msg: DecisionMsg) => ipcRenderer.send(IPC.DECISION, msg),
  sendMediaCmd: (cmd: MediaCmd) => ipcRenderer.send(IPC.MEDIA_CMD, cmd),
  sendSysCmd: (cmd: SysCmd) => ipcRenderer.send(IPC.SYS_CMD, cmd),
  reportRect: (rect: Rect | null) => ipcRenderer.send(IPC.REPORT_RECT, rect),
  setPanel: (open: boolean) => ipcRenderer.send(IPC.PANEL, open),
  dismiss: (id: string) => ipcRenderer.send(IPC.DISMISS, id),
}

export type IslandApi = typeof api

contextBridge.exposeInMainWorld('island', api)
