import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import type {
  DecisionMsg,
  MediaCmd,
  SysCmd,
  ReplyMsg,
  MessageActionMsg,
  NotifActionMsg,
} from '@shared/types'
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

const MEDIA = new Set(['playpause', 'next', 'previous', 'shuffle', 'loop'])
export function parseMediaCmd(c: any): MediaCmd | null {
  if (MEDIA.has(c)) return c
  if (c?.type === 'seek' && typeof c.position === 'number' && Number.isFinite(c.position))
    return { type: 'seek', position: Math.max(0, c.position) }
  return null
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

const MAX_REPLY = 4000
export function parseReply(m: any): ReplyMsg | null {
  if (!m || typeof m.id !== 'string' || typeof m.text !== 'string') return null
  const text = m.text.trim()
  if (!text || text.length > MAX_REPLY) return null
  return { id: m.id, text }
}

export function parseMessageAction(m: any): MessageActionMsg | null {
  return m && typeof m.id === 'string' && m.action === 'read' ? { id: m.id, action: 'read' } : null
}

export function parseNotifAction(m: any): NotifActionMsg | null {
  return m && typeof m.id === 'string' && typeof m.key === 'string' ? { id: m.id, key: m.key } : null
}

export function wireIpc(h: {
  onDecision: (m: DecisionMsg) => void
  onMediaCmd: (c: MediaCmd) => void
  onSysCmd: (c: SysCmd) => void
  onRect: (r: Rect | null) => void
  onPanel: (open: boolean) => void
  onDismiss: (id: string) => void
  onHold: (id: string, hold: boolean) => void
  onFocus: (focus: boolean) => void
  onReply: (m: ReplyMsg) => void
  onMessageAction: (m: MessageActionMsg) => void
  onNotifAction: (m: NotifActionMsg) => void
  onOpenSettings: (section?: string) => void
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
  ipcMain.on(IPC.HOLD, (_e, m) => {
    if (m && typeof m.id === 'string') h.onHold(m.id, m.hold === true)
  })
  ipcMain.on(IPC.FOCUS, (_e, f) => h.onFocus(f === true))
  ipcMain.on(IPC.REPLY, (_e, m) => {
    const r = parseReply(m)
    if (r) h.onReply(r)
  })
  ipcMain.on(IPC.MESSAGE_ACTION, (_e, m) => {
    const a = parseMessageAction(m)
    if (a) h.onMessageAction(a)
  })
  ipcMain.on(IPC.NOTIF_ACTION, (_e, m) => {
    const a = parseNotifAction(m)
    if (a) h.onNotifAction(a)
  })
  ipcMain.on(IPC.OPEN_SETTINGS, (_e, section) =>
    h.onOpenSettings(typeof section === 'string' ? section : undefined),
  )
}
