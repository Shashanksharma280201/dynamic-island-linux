import { ipcMain } from 'electron'
import { phoneCallArgs, type PhoneCall, type PhoneCallResult, type PhoneTopic } from '@shared/phone'
import { CLAUDE } from './claudeChannels'
import { CONNECTED } from './connectedChannels'
import { CRM } from './crmChannels'
import { DOCS } from './docsChannels'
import { INBOX } from './inboxChannels'
import { NOTIFS } from './notifChannels'
import { SERVICES } from './servicesChannels'
import { SPOTIFY } from './spotifyChannels'

type Handler = (e: unknown, ...args: unknown[]) => unknown

const handlers = new Map<string, Handler>()

/**
 * Keep every handler the island's windows invoke, so the phone can call the
 * very same functions (with the same checks) instead of copies. Call once,
 * before any are registered.
 */
export function keepHandlers(): void {
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, fn: Handler) => {
    handlers.set(channel, fn)
    handle(channel, fn as Parameters<typeof ipcMain.handle>[1])
  }) as typeof ipcMain.handle
}

/** Where each call goes: a channel the island's window invokes, or a function of main's own. */
export type PhoneRoutes = Record<PhoneCall, string | ((...args: any[]) => unknown)>

/** The channels the island's window invokes for each call (the rest are main's own functions). */
export const INVOKED: Partial<PhoneRoutes> = {
  'claude.state': CLAUDE.STATE,
  'claude.ask': CLAUDE.ASK,
  'claude.stop': CLAUDE.STOP,
  'claude.new': CLAUDE.NEW,
  'connected.view': CONNECTED.VIEW,
  'connected.action': CONNECTED.ACTION,
  'notifications.view': NOTIFS.VIEW,
  'notifications.dismiss': NOTIFS.DISMISS,
  'notifications.clearAll': NOTIFS.CLEAR_ALL,
  'notifications.undo': NOTIFS.UNDO,
  'notifications.setDnd': NOTIFS.SET_DND,
  'inbox.sources': INBOX.SOURCES,
  'inbox.unread': INBOX.UNREAD,
  'inbox.chats': INBOX.CHATS,
  'inbox.chat': INBOX.CHAT,
  'inbox.sendChat': INBOX.CHAT_SEND,
  'inbox.mailList': INBOX.MAIL_LIST,
  'inbox.mailGet': INBOX.MAIL_GET,
  'inbox.mailReply': INBOX.MAIL_REPLY,
  'inbox.mailRead': INBOX.MAIL_READ,
  'notes.list': INBOX.NOTES_LIST,
  'notes.get': INBOX.NOTE_GET,
  'notes.save': INBOX.NOTE_SAVE,
  'notes.remove': INBOX.NOTE_DELETE,
  'spotify.state': SPOTIFY.STATE,
  'spotify.home': SPOTIFY.HOME,
  'spotify.search': SPOTIFY.SEARCH,
  'spotify.page': SPOTIFY.PAGE,
  'spotify.play': SPOTIFY.PLAY,
  'spotify.devices': SPOTIFY.DEVICES,
  'spotify.transfer': SPOTIFY.TRANSFER,
  'spotify.control': SPOTIFY.CONTROL,
  'spotify.like': SPOTIFY.LIKE,
  'crm.overview': CRM.OVERVIEW,
  'crm.contacts': CRM.CONTACTS,
  'crm.contact': CRM.CONTACT,
  'crm.saveContact': CRM.SAVE_CONTACT,
  'crm.log': CRM.LOG,
  'crm.tasks': CRM.TASKS,
  'crm.saveTask': CRM.SAVE_TASK,
  'crm.deals': CRM.DEALS,
  'crm.deal': CRM.DEAL,
  'docs.view': DOCS.VIEW,
  'docs.action': DOCS.ACTION,
  'docs.remove': DOCS.REMOVE,
  'services.view': SERVICES.VIEW,
  'services.refresh': SERVICES.REFRESH,
}

/** What the island's window is told that the phone hears too, by topic. */
export const PUSHED: Record<string, PhoneTopic> = {
  [CLAUDE.CHANGED]: 'claude',
  [CONNECTED.CHANGED]: 'connected',
  [INBOX.CHANGED]: 'inbox',
  [NOTIFS.CHANGED]: 'notifications',
  [SPOTIFY.CHANGED]: 'spotify',
  [CRM.CHANGED]: 'crm',
  [DOCS.CHANGED]: 'docs',
  [SERVICES.CHANGED]: 'services',
}

/** Run a call from the phone: checked, then the island's own function. */
export async function phoneCall(routes: PhoneRoutes | null, fn: unknown, args: unknown): Promise<PhoneCallResult & { status: number }> {
  const c = phoneCallArgs(fn, args)
  if (!c) return { ok: false, status: 400, message: 'That isn’t something the island does.' }
  if (!routes) return { ok: false, status: 503, message: 'The island is still starting.' }
  const r = routes[c.fn]
  const run = typeof r === 'function' ? r : handlers.get(r)
  if (!run) return { ok: false, status: 501, message: 'The island can’t do that here.' }
  try {
    const value = typeof r === 'function' ? await r(...c.args) : await (run as Handler)({ sender: null }, ...c.args)
    return { ok: true, status: 200, value: value ?? null }
  } catch (e: any) {
    return { ok: false, status: 500, message: String(e?.message ?? e).slice(0, 300) }
  }
}

/** Call a kept handler directly (main's own use, for the phone). */
export async function invokeKept(channel: string, ...args: unknown[]): Promise<unknown> {
  const h = handlers.get(channel)
  if (!h) throw new Error(`No handler for ${channel}`)
  return h({ sender: null }, ...args)
}
