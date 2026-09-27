export type ToolRequest = {
  id: string
  toolName: string
  inputSummary: string
  toolInput?: Record<string, unknown>
  cwd?: string
  /** Claude's `permission_suggestions` (rules offered for "always allow"). */
  suggestions?: unknown[]
}

export type Decision = 'allow' | 'deny' | 'ask'

export type MediaState = {
  title: string
  artist: string
  artUrl?: string
  playing: boolean
  canControl: boolean
  /** Track length in seconds, if the player reports it. */
  length?: number
  /** Playback position in seconds at `positionAt` (epoch ms). */
  position?: number
  positionAt?: number
  /** MPRIS track id, needed to seek with SetPosition. */
  trackId?: string
  canSeek?: boolean
  /** Undefined when the player doesn't support it. */
  shuffle?: boolean
  loop?: LoopStatus
}

export type LoopStatus = 'None' | 'Track' | 'Playlist'

export type Urgency = 'low' | 'normal' | 'critical'

export type NotificationData = {
  app: string
  summary: string
  body: string
  icon?: string
  urgency?: Urgency
  /** Buttons the island can trigger (apps using GNOME's GNotification API). */
  actions?: { key: string; label: string }[]
}

export type MessageSource = 'whatsapp' | 'mail'

export type ChatLine = { text: string; time: number; author?: string }

/** A conversation update (WhatsApp chat or mail message) that can be replied to. */
export type MessageData = {
  source: MessageSource
  /** WhatsApp chat id, or `<accountId>:<uid>` for mail. */
  threadId: string
  sender: string
  /** Group name (WhatsApp) or subject (mail). */
  title?: string
  /** Mail account label, when more than one account is set up. */
  account?: string
  avatar?: string
  /** Most recent last; capped. */
  lines: ChatLine[]
  canReply: boolean
  status?: { kind: 'sending' | 'sent' | 'error'; text?: string }
}

type Base = { id: string; priority: number; /** insertion order, newer = larger */ seq?: number }

export type Activity =
  | (Base & { kind: 'media'; media: MediaState })
  | (Base & { kind: 'approval'; request: ToolRequest })
  | (Base & { kind: 'notification'; notification: NotificationData })
  | (Base & { kind: 'message'; message: MessageData })

export type SystemState = {
  volume: number // 0-100
  muted: boolean
  wifi: boolean | null // null if unavailable
  bluetooth: boolean | null // null if unavailable
  brightness: number | null // 0-100, null if unsupported
}

export type SysCmd =
  | { type: 'volume'; value: number }
  | { type: 'brightness'; value: number }
  | { type: 'mute' }
  | { type: 'wifi'; value: boolean }
  | { type: 'bluetooth'; value: boolean }

export const IPC = {
  STATE: 'island:state', // main -> renderer: Activity[]
  DECISION: 'island:decision', // renderer -> main: DecisionMsg
  MEDIA_CMD: 'island:media-cmd', // renderer -> main: MediaCmd
  REPORT_RECT: 'island:rect', // renderer -> main: island bounding Rect (window coords)
  SYS_STATE: 'island:sys-state', // main -> renderer: SystemState
  SYS_CMD: 'island:sys-cmd', // renderer -> main: SysCmd
  PANEL: 'island:panel', // renderer -> main: boolean (Control Center open)
  HOVER: 'island:hover', // main -> renderer: boolean (cursor over the island)
  DISMISS: 'island:dismiss', // renderer -> main: activity id (dismiss a transient card)
  HOLD: 'island:hold', // renderer -> main: { id, hold } keep a transient card open
  FOCUS: 'island:focus', // renderer -> main: boolean (take keyboard focus for typing)
  REPLY: 'island:reply', // renderer -> main: { id, text }
  MESSAGE_ACTION: 'island:message-action', // renderer -> main: { id, action }
  NOTIF_ACTION: 'island:notif-action', // renderer -> main: { id, key }
  OPEN_SETTINGS: 'island:open-settings', // renderer -> main: optional section
  DOCK: 'island:dock', // main -> renderer: DockState
  DOCK_SET: 'island:dock-set', // renderer -> main: Dock (drag released)
  DOCK_PREVIEW: 'island:dock-preview', // renderer -> main: Side (dragged across the middle)
  DRAG: 'island:drag', // renderer -> main: boolean (keep interactive while dragging)
  APPEARANCE: 'island:appearance', // main -> renderer: { appearance, blur }
  TOGGLE_PANEL: 'island:toggle-panel', // main -> renderer: global shortcut pressed
  FOCUS_LOST: 'island:focus-lost', // main -> renderer: keyboard focus moved to another app
  BACKDROP: 'island:backdrop', // main -> renderer: blurred-glass snapshot (data URL) or null
} as const

import type { Dock } from './dock'
export type { Dock, Side } from './dock'

/** Dock plus the work area it refers to (DIP), so the renderer can map screen x. */
export type DockState = Dock & { workArea: { x: number; y: number; width: number; height: number } }

export type ReplyMsg = { id: string; text: string }
export type MessageAction = 'read'
export type MessageActionMsg = { id: string; action: MessageAction }
export type NotifActionMsg = { id: string; key: string }

export type DecisionMsg = {
  id: string
  decision: Decision
  /** Deny reason shown to Claude. */
  message?: string
  /** Allow and apply Claude's suggested permission rules. */
  always?: boolean
}
export type MediaCmd =
  | 'playpause'
  | 'next'
  | 'previous'
  | 'shuffle'
  | 'loop'
  | { type: 'seek'; position: number }

export type { Rect } from './hitbox'

// ---- inbox browsing (hub panel) ----

export type MailSummary = {
  accountId: string
  uid: number
  from: { name: string; address: string }
  subject: string
  snippet: string
  date: number
  unread: boolean
}

export type MailMessageView = MailSummary & { to?: string; text: string }

export type ChatSummary = {
  id: string
  name: string
  isGroup: boolean
  unread: number
  time: number
  /** Last message preview. */
  last: string
  lastFromMe: boolean
  avatar?: string
}

export type ChatMessage = {
  id: string
  fromMe: boolean
  author?: string
  text: string
  time: number
}

export type NoteSummary = {
  id: string
  title: string
  preview: string
  created: number
  updated: number
}

export type Note = NoteSummary & { body: string }

/** What the hub can show: WhatsApp state and configured mail accounts. */
export type InboxSources = {
  whatsapp: 'off' | 'linking' | 'ready'
  mail: { id: string; label: string }[]
}

// ---- settings window ----

export type WaState =
  | { state: 'disabled' }
  | { state: 'starting' }
  | { state: 'qr'; qr: string }
  | { state: 'ready'; me?: string }
  | { state: 'disconnected'; reason?: string }
  | { state: 'error'; error: string }

export type MailStatus = { state: 'connecting' | 'connected' | 'error'; error?: string }

export type MailServer = { host: string; port: number; secure: boolean }

/** A mail account as the settings window sees it (never includes the password). */
export type MailAccountView = {
  id: string
  label: string
  user: string
  name?: string
  imap: MailServer
  smtp: MailServer
  status?: MailStatus
}

export type SettingsState = {
  notifications: boolean
  autostart: boolean
  hookInstalled: boolean
  /** False when passwords can only be obfuscated (no desktop keyring). */
  secureStorage: boolean
  dockSide: 'left' | 'right'
  appearance: 'glass' | 'solid'
  shortcut: boolean
  frosted: boolean
  /** Frosted snapshots need X11 screen capture (not on Wayland). */
  frostedAvailable: boolean
  notesFolder: string
  /** False if another app already owns the shortcut. */
  shortcutActive: boolean
  whatsapp: { enabled: boolean; needsRestart: boolean; status: WaState }
  mail: MailAccountView[]
}
