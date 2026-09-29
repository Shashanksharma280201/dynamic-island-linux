import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { ChatMediaFile, InboxSources, InboxUnread } from '@shared/types'
import type { MailManager } from './mailManager'
import type { NotesStore } from './notes'
import type { WhatsAppService } from './providers/whatsapp'

import { INBOX } from './inboxChannels'

export { INBOX }

const str = (v: unknown, name: string, max = 200): string => {
  if (typeof v !== 'string' || !v || v.length > max) throw new Error(`Invalid ${name}`)
  return v
}
const uidOf = (v: unknown): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid message')
  return n
}
const text = (v: unknown): string => {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t || t.length > 4000) throw new Error('Enter a message')
  return t
}

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
}

/** A safe file name for a downloaded attachment. Pure. */
export function attachmentName(name: string | undefined, mime: string, when = new Date()): string {
  const clean = (name ?? '').replace(/[/\\\0]/g, '_').replace(/^\.+/, '').trim().slice(0, 150)
  if (clean) return clean
  const stamp = when.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')
  return `WhatsApp ${stamp}${EXT[mime.split(';')[0]] ?? ''}`
}

/** `dir/name`, or `dir/name (2)` … if that exists. */
function freePath(dir: string, name: string): string {
  const ext = extname(name)
  const base = name.slice(0, name.length - ext.length)
  let p = join(dir, name)
  for (let i = 2; existsSync(p); i++) p = join(dir, `${base} (${i})${ext}`)
  return p
}

export function inboxSources(whatsapp: WhatsAppService, mail: MailManager): InboxSources {
  const s = whatsapp.current.state
  return {
    whatsapp: s === 'ready' ? 'ready' : s === 'disabled' ? 'off' : 'linking',
    mail: mail.accounts(),
  }
}

export function wireInbox(
  win: BrowserWindow,
  d: {
    whatsapp: WhatsAppService
    mail: MailManager
    /** Close a transient card for this conversation, if one is showing. */
    closeCard: (source: 'whatsapp' | 'mail', threadId: string) => void
    notes: NotesStore
  },
): { changed: (what: 'whatsapp' | 'mail' | 'sources' | 'unread') => void } {
  const { whatsapp, mail } = d
  const changed = (what: 'whatsapp' | 'mail' | 'sources' | 'unread') => {
    if (!win.isDestroyed()) win.webContents.send(INBOX.CHANGED, what)
  }
  ipcMain.handle(INBOX.SOURCES, () => inboxSources(whatsapp, mail))
  ipcMain.handle(INBOX.UNREAD, async (): Promise<InboxUnread> => {
    const chats =
      whatsapp.current.state === 'ready'
        ? await whatsapp
            .listChats(60)
            .then((cs) => cs.reduce((n, c) => n + Math.max(0, c.unread), 0))
            .catch(() => null)
        : null
    const mails = mail.accounts().length ? await mail.unreadCount().catch(() => null) : null
    return { chats, mail: mails }
  })
  ipcMain.handle(INBOX.CHATS, () => whatsapp.listChats(40))
  ipcMain.handle(INBOX.CHAT, async (_e, chatId) => {
    const id = str(chatId, 'chat')
    d.closeCard('whatsapp', id)
    const msgs = await whatsapp.getMessages(id, 40)
    changed('unread') // opening a chat marks it read
    return msgs
  })
  ipcMain.handle(INBOX.CHAT_MEDIA, async (_e, chatId, msgId): Promise<ChatMediaFile> => {
    const f = await whatsapp.getMedia(str(chatId, 'chat'), str(msgId, 'message', 300))
    return { mime: f.mime, url: `data:${f.mime};base64,${f.data}`, name: f.name }
  })
  // Save an attachment to Downloads and open it with the usual app.
  ipcMain.handle(INBOX.CHAT_MEDIA_OPEN, async (_e, chatId, msgId): Promise<string> => {
    const f = await whatsapp.getMedia(str(chatId, 'chat'), str(msgId, 'message', 300))
    const dir = process.env.DI_DOWNLOADS || app.getPath('downloads')
    mkdirSync(dir, { recursive: true })
    const file = freePath(dir, attachmentName(f.name, f.mime))
    writeFileSync(file, Buffer.from(f.data, 'base64'))
    if (!process.env.DI_DOWNLOADS) void shell.openPath(file)
    return file
  })
  ipcMain.handle(INBOX.CHAT_SEND, async (_e, chatId, body) => {
    const id = str(chatId, 'chat')
    await whatsapp.send(id, text(body))
    d.closeCard('whatsapp', id)
  })
  ipcMain.handle(INBOX.MAIL_LIST, (_e, accountId) =>
    mail.listRecent(accountId ? str(accountId, 'account') : undefined, 30),
  )
  ipcMain.handle(INBOX.MAIL_GET, async (_e, accountId, uid) => {
    const a = str(accountId, 'account')
    const u = uidOf(uid)
    d.closeCard('mail', `${a}:${u}`)
    const m = await mail.getMessage(a, u)
    changed('unread') // opening a mail marks it read
    return m
  })
  ipcMain.handle(INBOX.MAIL_REPLY, async (_e, accountId, uid, body) => {
    const a = str(accountId, 'account')
    const u = uidOf(uid)
    await mail.reply(`${a}:${u}`, text(body))
    d.closeCard('mail', `${a}:${u}`)
  })
  ipcMain.handle(INBOX.NOTES_LIST, () => d.notes.list())
  ipcMain.handle(INBOX.NOTE_GET, (_e, id) => d.notes.get(str(id, 'note', 60)))
  ipcMain.handle(INBOX.NOTE_SAVE, (_e, id, body) => {
    if (typeof body !== 'string') throw new Error('Invalid note')
    return d.notes.save(id ? str(id, 'note', 60) : undefined, body)
  })
  ipcMain.handle(INBOX.NOTE_DELETE, (_e, id) => d.notes.remove(str(id, 'note', 60)))
  ipcMain.handle(INBOX.MAIL_READ, async (_e, accountId, uid) => {
    await mail.markRead(`${str(accountId, 'account')}:${uidOf(uid)}`)
    changed('unread')
  })
  return {
    changed,
  }
}
