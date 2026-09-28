import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type {
  Activity,
  DecisionMsg,
  MediaCmd,
  Rect,
  SystemState,
  SysCmd,
  SettingsState,
  MailAccountView,
  DockState,
  Dock,
  Side,
  InboxSources,
  ChatSummary,
  ChatMessage,
  MailSummary,
  MailMessageView,
  NoteSummary,
  Note,
} from '@shared/types'
import { SETTINGS } from '../electron/settingsChannels'
import { INBOX } from '../electron/inboxChannels'
import { CLAUDE } from '../electron/claudeChannels'
import type { ClaudeView } from '@shared/claude'

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
  hold: (id: string, hold: boolean) => ipcRenderer.send(IPC.HOLD, { id, hold }),
  setFocus: (focus: boolean) => ipcRenderer.send(IPC.FOCUS, focus),
  reply: (id: string, text: string) => ipcRenderer.send(IPC.REPLY, { id, text }),
  markRead: (id: string) => ipcRenderer.send(IPC.MESSAGE_ACTION, { id, action: 'read' }),
  notifAction: (id: string, key: string) => ipcRenderer.send(IPC.NOTIF_ACTION, { id, key }),
  openSettings: (section?: string) => ipcRenderer.send(IPC.OPEN_SETTINGS, section),
  onDock: (cb: (d: DockState) => void) => on(IPC.DOCK, cb),
  setDock: (d: Dock) => ipcRenderer.send(IPC.DOCK_SET, d),
  previewSide: (side: Side) => ipcRenderer.send(IPC.DOCK_PREVIEW, side),
  setDragging: (on: boolean) => ipcRenderer.send(IPC.DRAG, on),
  onTogglePanel: (cb: () => void) => on(IPC.TOGGLE_PANEL, cb),
  onFocusLost: (cb: () => void) => on(IPC.FOCUS_LOST, cb),
  onBackdrop: (cb: (dataUrl: string | null) => void) => on(IPC.BACKDROP, cb),
  claude: {
    state: (): Promise<ClaudeView> => ipcRenderer.invoke(CLAUDE.STATE),
    onChange: (cb: (v: ClaudeView) => void) => on(CLAUDE.CHANGED, cb),
    ask: (text: string): Promise<void> => ipcRenderer.invoke(CLAUDE.ASK, text),
    stop: (): Promise<void> => ipcRenderer.invoke(CLAUDE.STOP),
    newConversation: (): Promise<void> => ipcRenderer.invoke(CLAUDE.NEW),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(CLAUDE.PICK_FOLDER),
    setUsageBridge: (on: boolean): Promise<void> => ipcRenderer.invoke(CLAUDE.SET_BRIDGE, on),
    setApprovals: (on: boolean): Promise<void> => ipcRenderer.invoke(CLAUDE.SET_APPROVALS, on),
    ensureSpeechModel: (): Promise<void> => ipcRenderer.invoke(CLAUDE.STT_ENSURE),
    onVoice: (cb: () => void) => on(CLAUDE.VOICE, cb),
  },
  notes: {
    list: (): Promise<NoteSummary[]> => ipcRenderer.invoke(INBOX.NOTES_LIST),
    get: (id: string): Promise<Note> => ipcRenderer.invoke(INBOX.NOTE_GET, id),
    save: (id: string | undefined, body: string): Promise<string> => ipcRenderer.invoke(INBOX.NOTE_SAVE, id, body),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(INBOX.NOTE_DELETE, id),
  },
  onAppearance: (cb: (a: { appearance: 'glass' | 'solid'; blur: boolean }) => void) =>
    on(IPC.APPEARANCE, cb),
  inbox: {
    sources: (): Promise<InboxSources> => ipcRenderer.invoke(INBOX.SOURCES),
    chats: (): Promise<ChatSummary[]> => ipcRenderer.invoke(INBOX.CHATS),
    chat: (id: string): Promise<ChatMessage[]> => ipcRenderer.invoke(INBOX.CHAT, id),
    sendChat: (id: string, text: string): Promise<void> => ipcRenderer.invoke(INBOX.CHAT_SEND, id, text),
    mailList: (accountId?: string): Promise<MailSummary[]> => ipcRenderer.invoke(INBOX.MAIL_LIST, accountId),
    mailGet: (accountId: string, uid: number): Promise<MailMessageView> =>
      ipcRenderer.invoke(INBOX.MAIL_GET, accountId, uid),
    mailReply: (accountId: string, uid: number, text: string): Promise<void> =>
      ipcRenderer.invoke(INBOX.MAIL_REPLY, accountId, uid, text),
    mailRead: (accountId: string, uid: number): Promise<void> =>
      ipcRenderer.invoke(INBOX.MAIL_READ, accountId, uid),
    onChanged: (cb: (what: 'whatsapp' | 'mail' | 'sources') => void) => on(INBOX.CHANGED, cb),
  },
}

type MailInput = Omit<MailAccountView, 'status' | 'id'> & { id?: string }

/** Used by the settings window only. */
const settings = {
  get: (): Promise<SettingsState> => ipcRenderer.invoke(SETTINGS.GET),
  onChange: (cb: (s: SettingsState) => void) => on(SETTINGS.CHANGED, cb),
  setNotifications: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_NOTIFICATIONS, on),
  setAutostart: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_AUTOSTART, on),
  setHook: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_HOOK, on),
  setDockSide: (side: Side) => ipcRenderer.invoke(SETTINGS.SET_DOCK_SIDE, side),
  setAppearance: (a: 'glass' | 'solid') => ipcRenderer.invoke(SETTINGS.SET_APPEARANCE, a),
  setShortcut: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_SHORTCUT, on),
  setFrosted: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_FROSTED, on),
  openNotesFolder: () => ipcRenderer.invoke(SETTINGS.OPEN_NOTES_FOLDER),
  setClaude: (patch: Partial<{ permissionMode: string; voiceShortcut: boolean; sttModel: string; binary: string }>) =>
    ipcRenderer.invoke(SETTINGS.SET_CLAUDE, patch),
  pickClaudeFolder: (): Promise<string | null> => ipcRenderer.invoke(SETTINGS.PICK_CLAUDE_FOLDER),
  setUsageBridge: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_USAGE_BRIDGE, on),
  setWhatsApp: (on: boolean): Promise<{ restart: boolean }> =>
    ipcRenderer.invoke(SETTINGS.SET_WHATSAPP, on),
  restart: () => ipcRenderer.invoke(SETTINGS.RESTART),
  whatsappPair: (phone: string): Promise<string> => ipcRenderer.invoke(SETTINGS.WA_PAIR, phone),
  whatsappLogout: () => ipcRenderer.invoke(SETTINGS.WA_LOGOUT),
  mailPresets: (email?: string) => ipcRenderer.invoke(SETTINGS.MAIL_PRESETS, email),
  mailTest: (a: MailInput, password?: string) => ipcRenderer.invoke(SETTINGS.MAIL_TEST, a, password),
  mailSave: (a: MailInput, password?: string): Promise<string> =>
    ipcRenderer.invoke(SETTINGS.MAIL_SAVE, a, password),
  mailRemove: (id: string) => ipcRenderer.invoke(SETTINGS.MAIL_REMOVE, id),
}

export type IslandApi = typeof api
export type SettingsApi = typeof settings

contextBridge.exposeInMainWorld('island', api)
contextBridge.exposeInMainWorld('settings', settings)
