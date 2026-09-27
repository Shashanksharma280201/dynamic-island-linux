import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import type { DecisionMsg, MediaCmd, SysCmd } from '@shared/types'
import { isRect, type Rect } from '@shared/hitbox'

/** Send to the renderer if the window is still alive. */
export function send(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

// ---- validation of renderer input (pure, tested) ----
const DECISIONS = new Set(['allow', 'deny', 'ask'])
export function parseDecisionMsg(m: any): DecisionMsg | null {
  if (!m || typeof m.id !== 'string' || !DECISIONS.has(m.decision)) return null
  const out: DecisionMsg = { id: m.id, decision: m.decision }
  if (m.decision === 'deny' && typeof m.message === 'string' && m.message.trim())
    out.message = m.message.trim().slice(0, 2000)
  if (m.decision === 'allow' && m.always === true) out.always = true
  return out
}

const MEDIA = new Set(['playpause', 'next', 'previous'])
export function parseMediaCmd(c: any): MediaCmd | null {
  return MEDIA.has(c) ? c : null
}

export function parseSysCmd(c: any): SysCmd | null {
  if (!c || typeof c.type !== 'string') return null
  switch (c.type) {
    case 'volume':
    case 'brightness':
      return typeof c.value === 'number' && Number.isFinite(c.value)
        ? { type: c.type, value: c.value }
        : null
    case 'wifi':
    case 'bluetooth':
      return typeof c.value === 'boolean' ? { type: c.type, value: c.value } : null
    case 'mute':
      return { type: 'mute' }
    default:
      return null
  }
}

export function wireIpc(h: {
  onDecision: (m: DecisionMsg) => void
  onMediaCmd: (c: MediaCmd) => void
  onSysCmd: (c: SysCmd) => void
  onRect: (r: Rect | null) => void
  onPanel: (open: boolean) => void
  onDismiss: (id: string) => void
}): void {
  ipcMain.on(IPC.DECISION, (_e, m) => {
    const d = parseDecisionMsg(m)
    if (d) h.onDecision(d)
  })
  ipcMain.on(IPC.MEDIA_CMD, (_e, c) => {
    const m = parseMediaCmd(c)
    if (m) h.onMediaCmd(m)
  })
  ipcMain.on(IPC.SYS_CMD, (_e, c) => {
    const s = parseSysCmd(c)
    if (s) h.onSysCmd(s)
  })
  ipcMain.on(IPC.REPORT_RECT, (_e, r) => h.onRect(isRect(r) ? r : null))
  ipcMain.on(IPC.PANEL, (_e, open) => h.onPanel(open === true))
  ipcMain.on(IPC.DISMISS, (_e, id) => {
    if (typeof id === 'string') h.onDismiss(id)
  })
}
