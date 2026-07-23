import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type { Activity, DecisionMsg, MediaCmd, Rect, SystemState, SysCmd } from '@shared/types'

contextBridge.exposeInMainWorld('island', {
  onState: (cb: (a: Activity[]) => void) =>
    ipcRenderer.on(IPC.STATE, (_e, a) => cb(a)),
  sendDecision: (msg: DecisionMsg) => ipcRenderer.send(IPC.DECISION, msg),
  sendMediaCmd: (cmd: MediaCmd) => ipcRenderer.send(IPC.MEDIA_CMD, cmd),
  setHover: (b: boolean) => ipcRenderer.send(IPC.SET_HOVER, b),
  reportRect: (rect: Rect | null) => ipcRenderer.send(IPC.REPORT_RECT, rect),
  onSysState: (cb: (s: SystemState) => void) =>
    ipcRenderer.on(IPC.SYS_STATE, (_e, s) => cb(s)),
  sendSysCmd: (cmd: SysCmd) => ipcRenderer.send(IPC.SYS_CMD, cmd),
})
