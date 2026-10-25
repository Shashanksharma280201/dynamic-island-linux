import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CharacterConfig, CharacterId, CharacterMood, Outfit } from '@shared/character'
import type { ProviderId } from '@shared/ai'
import type { PackageId, PackageTab } from '@shared/packages'
import type { DocAction, DocActionResult, DocEntry, DocRecipe, DocsAdded, DocsView } from '@shared/docs'
import type {
  Activity as CrmActivity,
  Contact,
  ContactForm,
  ContactPage,
  ContactSummary,
  CrmChanges,
  CrmDealPage,
  CrmImported,
  CrmOverview,
  Deal,
  DealForm,
  DealSummary,
  Task,
  TaskForm,
  TaskSummary,
} from '@shared/crm'
import { IPC } from '@shared/types'
import type { AgentSession } from '@shared/sessions'
import type { Shortcuts } from '@shared/shortcuts'
import { SESSIONS } from './sessionChannels'
import { COMPANION } from './companionChannels'
import { SERVICES } from './servicesChannels'
import { CONNECTED } from './connectedChannels'
import type { ConnectedState } from '@shared/connected'
import type { ServiceState } from '@shared/services'
import type { RecapCard } from '@shared/recap'
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
  InboxUnread,
  ChatSummary,
  ChatMessage,
  ChatMediaFile,
  MailSummary,
  MailMessageView,
  NoteSummary,
  Note,
} from '@shared/types'
import { SETTINGS } from '../electron/settingsChannels'
import { INBOX } from '../electron/inboxChannels'
import { CLAUDE } from '../electron/claudeChannels'
import { SPOTIFY } from '../electron/spotifyChannels'
import { DOCS } from '../electron/docsChannels'
import { CRM } from '../electron/crmChannels'
import { NOTIFS } from '../electron/notifChannels'
import { JOB, RING } from '../electron/ringChannels'
import type { DragConfig, PlanEnv, SlotId } from '@shared/dragActions'
import type { CenterView } from '@shared/notifCenter'
import type { PlayResult, SpDevice, SpHome, SpPage, SpSearch, SpotifyView } from '@shared/spotify'
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
  onCursor: (cb: (at: { x: number; y: number }) => void) => on(IPC.CURSOR, cb),
  onGreet: (cb: (g: { first: boolean }) => void) => on(IPC.GREET, cb),
  sendDecision: (msg: DecisionMsg) => ipcRenderer.send(IPC.DECISION, msg),
  sendMediaCmd: (cmd: MediaCmd) => ipcRenderer.send(IPC.MEDIA_CMD, cmd),
  sendSysCmd: (cmd: SysCmd) => ipcRenderer.send(IPC.SYS_CMD, cmd),
  reportRect: (rect: Rect | null) => ipcRenderer.send(IPC.REPORT_RECT, rect),
  onRectRequest: (cb: () => void) => on(IPC.RECT_REQUEST, cb),
  setPanel: (open: boolean) => ipcRenderer.send(IPC.PANEL, open),
  dismiss: (id: string) => ipcRenderer.send(IPC.DISMISS, id),
  hold: (id: string, hold: boolean) => ipcRenderer.send(IPC.HOLD, { id, hold }),
  /** Keep a card that closes by itself until you close it. */
  pin: (id: string) => ipcRenderer.send(IPC.PIN, id),
  /** The global shortcuts' keys (they can be changed in Settings). */
  onKeys: (cb: (k: Shortcuts) => void) => on(IPC.KEYS, cb),
  /** Dress the character from the island (right-click wardrobe). */
  setLook: (patch: { outfit?: Outfit; color?: string | null }) => ipcRenderer.send(IPC.SET_LOOK, patch),
  /** Services you follow: their cards, a fresh look, opening their pages. */
  services: {
    view: (): Promise<ServiceState[]> => ipcRenderer.invoke(SERVICES.VIEW),
    refresh: (id: string): Promise<void> => ipcRenderer.invoke(SERVICES.REFRESH, id),
    open: (url: string): Promise<void> => ipcRenderer.invoke(SERVICES.OPEN, url),
    onChanged: (cb: (v: ServiceState[]) => void) => on(SERVICES.CHANGED, cb),
  },
  /** The connected package (trading engine…): what it shows, and its buttons. */
  connected: {
    view: (): Promise<ConnectedState> => ipcRenderer.invoke(CONNECTED.VIEW),
    action: (id: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(CONNECTED.ACTION, id),
    onChanged: (cb: (v: ConnectedState) => void) => on(CONNECTED.CHANGED, cb),
  },
  /** Ctrl+Alt+1…9 / Allow while one of Claude's questions is on the island. */
  onQuestionKey: (cb: (k: { n?: number; send?: boolean }) => void) => on(IPC.QUESTION_KEY, cb),
  /** Dictate anywhere: the shortcut, and typing what you said into the focused app. */
  dictate: {
    onToggle: (cb: () => void) => on(IPC.DICTATE, cb),
    type: (text: string): Promise<boolean> => ipcRenderer.invoke(IPC.DICTATE_TYPE, text),
  },
  /** The desktop companion's page. */
  companion: {
    onState: (cb: (s: { mood: CharacterMood; character: CharacterConfig }) => void) => on(COMPANION.STATE, cb),
    move: (dx: number, dy: number) => ipcRenderer.send(COMPANION.MOVE, { dx, dy }),
    drop: () => ipcRenderer.send(COMPANION.DROP),
    click: () => ipcRenderer.send(COMPANION.CLICK),
    ready: () => ipcRenderer.send(COMPANION.READY),
  },
  /** The drag actions ring's page (its own window, under the pointer). */
  ring: {
    onOpen: (cb: (o: { env: PlanEnv; pointer: { x: number; y: number }; files?: string[] }) => void) => on(RING.OPEN, cb),
    onPointer: (cb: (p: { x: number; y: number }) => void) => on(RING.POINTER, cb),
    onEnd: (cb: () => void) => on(RING.END, cb),
    onClose: (cb: () => void) => on(RING.CLOSE, cb),
    ready: () => ipcRenderer.send(RING.READY),
    shown: () => ipcRenderer.send(RING.SHOWN),
    none: () => ipcRenderer.send(RING.NONE),
    drop: (d: { slot: SlotId; choice?: string; paths: string[] }) => ipcRenderer.send(RING.DROP, d),
    pathFor: (f: File): string => webUtils.getPathForFile(f),
  },
  /** A drag action's card: what it made. */
  jobs: {
    open: (id: string) => ipcRenderer.invoke(JOB.OPEN, id),
    show: (id: string) => ipcRenderer.invoke(JOB.SHOW, id),
    undo: (id: string) => ipcRenderer.invoke(JOB.UNDO, id),
    drag: (id: string) => ipcRenderer.send(JOB.DRAG, id),
  },
  /** The weekly recap: shown by the main process; the image saved or copied. */
  recap: {
    onShow: (cb: (r: { card: RecapCard; shareCard: RecapCard; name: string }) => void) => on(IPC.RECAP, cb),
    save: (png: string): Promise<string | null> => ipcRenderer.invoke(IPC.RECAP_SAVE, png),
    copy: (png: string): Promise<boolean> => ipcRenderer.invoke(IPC.RECAP_COPY, png),
    show: (file: string): Promise<void> => ipcRenderer.invoke(IPC.RECAP_SHOW, file),
  },
  /** Start the tour (tray, Settings). */
  onTour: (cb: () => void) => on(IPC.TOUR, cb),
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
  /** Artwork as a data URL (to sample its colours). */
  imageData: (url: string): Promise<string | null> => ipcRenderer.invoke(SPOTIFY.IMAGE, url),
  /** The notification center: history, Clear all, Do Not Disturb. */
  /** Claude Code (and other agent) sessions in your terminals. */
  sessions: {
    list: (): Promise<AgentSession[]> => ipcRenderer.invoke(SESSIONS.LIST),
    /** Bring its terminal to the front; false if it couldn't be found. */
    focus: (id: string): Promise<boolean> => ipcRenderer.invoke(SESSIONS.FOCUS, id),
    forget: (id: string): Promise<void> => ipcRenderer.invoke(SESSIONS.FORGET, id),
    onChanged: (cb: (list: AgentSession[]) => void) => on(SESSIONS.CHANGED, cb),
  },
  notifications: {
    view: (): Promise<CenterView> => ipcRenderer.invoke(NOTIFS.VIEW),
    dismiss: (id: string): Promise<void> => ipcRenderer.invoke(NOTIFS.DISMISS, id),
    /** Clears the list and the island's cards; resolves to how many were cleared. */
    clearAll: (): Promise<number> => ipcRenderer.invoke(NOTIFS.CLEAR_ALL),
    undo: (): Promise<void> => ipcRenderer.invoke(NOTIFS.UNDO),
    seen: (): Promise<void> => ipcRenderer.invoke(NOTIFS.SEEN),
    setDnd: (on: boolean): Promise<void> => ipcRenderer.invoke(NOTIFS.SET_DND, on),
    onChanged: (cb: (v: CenterView) => void) => on(NOTIFS.CHANGED, cb),
  },
  spotify: {
    state: (): Promise<SpotifyView> => ipcRenderer.invoke(SPOTIFY.STATE),
    onChange: (cb: (v: SpotifyView) => void) => on(SPOTIFY.CHANGED, cb),
    signIn: (): Promise<void> => ipcRenderer.invoke(SPOTIFY.SIGN_IN),
    home: (): Promise<SpHome> => ipcRenderer.invoke(SPOTIFY.HOME),
    page: (uri: string): Promise<SpPage> => ipcRenderer.invoke(SPOTIFY.PAGE, uri),
    search: (q: string): Promise<SpSearch> => ipcRenderer.invoke(SPOTIFY.SEARCH, q),
    play: (o: { contextUri?: string; trackUri?: string }, deviceId?: string): Promise<PlayResult> =>
      ipcRenderer.invoke(SPOTIFY.PLAY, o, deviceId),
    devices: (): Promise<SpDevice[]> => ipcRenderer.invoke(SPOTIFY.DEVICES),
    transfer: (deviceId: string): Promise<void> => ipcRenderer.invoke(SPOTIFY.TRANSFER, deviceId),
    playInBrowser: (o: { contextUri?: string; trackUri?: string }): Promise<void> => ipcRenderer.invoke(SPOTIFY.PLAY_BROWSER, o),
    control: (cmd: { type: string; [k: string]: unknown }): Promise<void> => ipcRenderer.invoke(SPOTIFY.CONTROL, cmd),
    like: (uri: string, on: boolean): Promise<void> => ipcRenderer.invoke(SPOTIFY.LIKE, uri, on),
    watch: (on: boolean) => ipcRenderer.send(SPOTIFY.WATCH, on),
  },
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
    /** Open the Claude tab; with a draft, it waits in the box to be finished and sent. */
    onOpen: (cb: (o: { draft?: string }) => void) => on(CLAUDE.OPEN, cb),
    /** A screenshot and the title of the window you were in (null if none known). */
    attach: (): Promise<{ title: string; path: string | null; preview: string | null } | null> => ipcRenderer.invoke(CLAUDE.ATTACH),
  },
  notes: {
    list: (): Promise<NoteSummary[]> => ipcRenderer.invoke(INBOX.NOTES_LIST),
    get: (id: string): Promise<Note> => ipcRenderer.invoke(INBOX.NOTE_GET, id),
    save: (id: string | undefined, body: string): Promise<string> => ipcRenderer.invoke(INBOX.NOTE_SAVE, id, body),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(INBOX.NOTE_DELETE, id),
  },
  docs: {
    view: (): Promise<DocsView> => ipcRenderer.invoke(DOCS.VIEW),
    onChanged: (cb: () => void) => on(DOCS.CHANGED, cb),
    add: (paths: string[]): Promise<DocsAdded> => ipcRenderer.invoke(DOCS.ADD, paths),
    pick: (): Promise<DocsAdded> => ipcRenderer.invoke(DOCS.PICK),
    remove: (ids: string[]): Promise<void> => ipcRenderer.invoke(DOCS.REMOVE, ids),
    open: (id: string): Promise<void> => ipcRenderer.invoke(DOCS.OPEN, id),
    show: (id: string): Promise<void> => ipcRenderer.invoke(DOCS.SHOW, id),
    openFolder: (): Promise<void> => ipcRenderer.invoke(DOCS.OPEN_FOLDER),
    action: (a: DocAction): Promise<DocActionResult> => ipcRenderer.invoke(DOCS.ACTION, a),
    saveRecipe: (r: { id?: string; name: string; instruction: string }): Promise<DocRecipe[]> => ipcRenderer.invoke(DOCS.RECIPE_SAVE, r),
    removeRecipe: (id: string): Promise<DocRecipe[]> => ipcRenderer.invoke(DOCS.RECIPE_REMOVE, id),
    /** Where a file dropped on the island lives ('' if it isn't a file on disk). */
    pathFor: (f: File): string => webUtils.getPathForFile(f),
  },
  crm: {
    overview: (): Promise<CrmOverview> => ipcRenderer.invoke(CRM.OVERVIEW),
    /** Something changed; with the agent's changes when it was the agent. */
    onChanged: (cb: (agent: CrmChanges | null) => void) => on(CRM.CHANGED, cb),
    contacts: (query: string, status?: string): Promise<ContactSummary[]> => ipcRenderer.invoke(CRM.CONTACTS, query, status),
    contact: (id: string): Promise<ContactPage> => ipcRenderer.invoke(CRM.CONTACT, id),
    saveContact: (id: string | null, f: ContactForm): Promise<Contact> => ipcRenderer.invoke(CRM.SAVE_CONTACT, id, f),
    log: (a: { contactId?: string; dealId?: string; kind: string; text: string }): Promise<CrmActivity> => ipcRenderer.invoke(CRM.LOG, a),
    tasks: (filter: string): Promise<TaskSummary[]> => ipcRenderer.invoke(CRM.TASKS, filter),
    saveTask: (id: string | null, f: TaskForm): Promise<Task> => ipcRenderer.invoke(CRM.SAVE_TASK, id, f),
    deals: (): Promise<DealSummary[]> => ipcRenderer.invoke(CRM.DEALS),
    deal: (id: string): Promise<CrmDealPage> => ipcRenderer.invoke(CRM.DEAL, id),
    saveDeal: (id: string | null, f: DealForm): Promise<Deal> => ipcRenderer.invoke(CRM.SAVE_DEAL, id, f),
    /** Resolves to the change batch, to undo it. */
    remove: (what: 'contact' | 'deal' | 'task' | 'activity', id: string): Promise<string> => ipcRenderer.invoke(CRM.DELETE, what, id),
    undo: (batch?: string): Promise<{ undone: number; kept: number; summary: string[] }> => ipcRenderer.invoke(CRM.UNDO, batch),
    importFile: (): Promise<CrmImported | null> => ipcRenderer.invoke(CRM.IMPORT),
    exportCsv: (what: 'contacts' | 'deals' | 'tasks'): Promise<DocEntry> => ipcRenderer.invoke(CRM.EXPORT, what),
    setCurrency: (code: string): Promise<void> => ipcRenderer.invoke(CRM.SET_CURRENCY, code),
  },
  onAppearance: (cb: (a: { appearance: 'glass' | 'solid'; blur: boolean; sounds?: boolean; openOnHover?: boolean; customSounds?: Record<string, string> }) => void) =>
    on(IPC.APPEARANCE, cb),
  onCharacter: (cb: (c: CharacterConfig) => void) => on(IPC.CHARACTER, cb),
  onPackages: (cb: (tabs: PackageTab[]) => void) => on(IPC.PACKAGES, cb),
  inbox: {
    sources: (): Promise<InboxSources> => ipcRenderer.invoke(INBOX.SOURCES),
    chats: (): Promise<ChatSummary[]> => ipcRenderer.invoke(INBOX.CHATS),
    chat: (id: string): Promise<ChatMessage[]> => ipcRenderer.invoke(INBOX.CHAT, id),
    chatMedia: (chatId: string, msgId: string): Promise<ChatMediaFile> => ipcRenderer.invoke(INBOX.CHAT_MEDIA, chatId, msgId),
    /** Save to Downloads and open it; resolves to the saved file. */
    openChatMedia: (chatId: string, msgId: string): Promise<string> => ipcRenderer.invoke(INBOX.CHAT_MEDIA_OPEN, chatId, msgId),
    sendChat: (id: string, text: string): Promise<void> => ipcRenderer.invoke(INBOX.CHAT_SEND, id, text),
    mailList: (accountId?: string): Promise<MailSummary[]> => ipcRenderer.invoke(INBOX.MAIL_LIST, accountId),
    mailGet: (accountId: string, uid: number): Promise<MailMessageView> =>
      ipcRenderer.invoke(INBOX.MAIL_GET, accountId, uid),
    mailReply: (accountId: string, uid: number, text: string): Promise<void> =>
      ipcRenderer.invoke(INBOX.MAIL_REPLY, accountId, uid, text),
    mailRead: (accountId: string, uid: number): Promise<void> =>
      ipcRenderer.invoke(INBOX.MAIL_READ, accountId, uid),
    onChanged: (cb: (what: 'whatsapp' | 'mail' | 'sources' | 'unread') => void) => on(INBOX.CHANGED, cb),
    unread: (): Promise<InboxUnread> => ipcRenderer.invoke(INBOX.UNREAD),
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
  setAgentHook: (id: string, on: boolean) => ipcRenderer.invoke(SETTINGS.SET_AGENT_HOOK, id, on),
  /** Resolves to an error to show, or null once it's set. */
  setKey: (id: string, accel: string | null): Promise<string | null> => ipcRenderer.invoke(SETTINGS.SET_KEY, id, accel),
  setOpenOnHover: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_OPEN_ON_HOVER, on),
  setRecording: (on: boolean) => ipcRenderer.invoke(SETTINGS.RECORDING, on),
  tour: () => ipcRenderer.invoke(SETTINGS.TOUR),
  openSounds: () => ipcRenderer.invoke(SETTINGS.OPEN_SOUNDS),
  setCompanion: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_COMPANION, on),
  setDrag: (patch: Partial<DragConfig>) => ipcRenderer.invoke(SETTINGS.SET_DRAG, patch),
  setDisplay: (pref: string) => ipcRenderer.invoke(SETTINGS.SET_DISPLAY, pref),
  setRecap: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_RECAP, on),
  clearRecap: () => ipcRenderer.invoke(SETTINGS.CLEAR_RECAP),
  showRecap: () => ipcRenderer.invoke(SETTINGS.SHOW_RECAP),
  /** Turn a service on/off, or set its address or key; resolves to an error to show, or null. */
  setService: (id: string, patch: { on?: boolean; url?: string; token?: string }): Promise<string | null> => ipcRenderer.invoke(SETTINGS.SET_SERVICE, id, patch),
  setConnected: (patch: { on?: boolean; url?: string; token?: string }): Promise<string | null> => ipcRenderer.invoke(SETTINGS.SET_CONNECTED, patch),
  qr: (link: string): Promise<string | null> => ipcRenderer.invoke(SETTINGS.QR, link),
  setDictation: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_DICTATION, on),
  setDockSide: (side: Side) => ipcRenderer.invoke(SETTINGS.SET_DOCK_SIDE, side),
  setAppearance: (a: 'glass' | 'solid') => ipcRenderer.invoke(SETTINGS.SET_APPEARANCE, a),
  setCharacter: (patch: { id?: CharacterId; name?: string; outfit?: Outfit; color?: string | null }) => ipcRenderer.invoke(SETTINGS.SET_CHARACTER, patch),
  setAi: (patch: { provider?: ProviderId; model?: string; baseUrl?: string }) => ipcRenderer.invoke(SETTINGS.SET_AI, patch),
  setAiKey: (provider: ProviderId, key: string) => ipcRenderer.invoke(SETTINGS.SET_AI_KEY, provider, key),
  aiModels: (provider: ProviderId): Promise<string[]> => ipcRenderer.invoke(SETTINGS.AI_MODELS, provider),
  setPackage: (id: PackageId, on: boolean) => ipcRenderer.invoke(SETTINGS.SET_PACKAGE, id, on),
  setShortcut: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_SHORTCUT, on),
  setFrosted: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_FROSTED, on),
  setSounds: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_SOUNDS, on),
  openNotesFolder: () => ipcRenderer.invoke(SETTINGS.OPEN_NOTES_FOLDER),
  setClaude: (patch: Partial<{ permissionMode: string; voiceShortcut: boolean; sttModel: string; binary: string }>) =>
    ipcRenderer.invoke(SETTINGS.SET_CLAUDE, patch),
  pickClaudeFolder: (): Promise<string | null> => ipcRenderer.invoke(SETTINGS.PICK_CLAUDE_FOLDER),
  setUsageBridge: (on: boolean) => ipcRenderer.invoke(SETTINGS.SET_USAGE_BRIDGE, on),
  setSpotifyClient: (clientId: string) => ipcRenderer.invoke(SETTINGS.SET_SPOTIFY_CLIENT, clientId),
  spotifySignIn: () => ipcRenderer.invoke(SETTINGS.SPOTIFY_SIGN_IN),
  spotifySignOut: () => ipcRenderer.invoke(SETTINGS.SPOTIFY_SIGN_OUT),
  setWhatsApp: (on: boolean): Promise<{ restart: boolean }> =>
    ipcRenderer.invoke(SETTINGS.SET_WHATSAPP, on),
  restart: () => ipcRenderer.invoke(SETTINGS.RESTART),
  uninstall: () => ipcRenderer.invoke(SETTINGS.UNINSTALL),
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
