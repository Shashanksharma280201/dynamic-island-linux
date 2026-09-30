import { app, ipcMain, protocol, shell, type BrowserWindow } from 'electron'
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

/** Private scheme WhatsApp attachments are served on (streams, seeks). */
export const MEDIA_SCHEME = 'island-media'
export const MEDIA_SCHEME_PRIVILEGES: Electron.CustomScheme = {
  scheme: MEDIA_SCHEME,
  // corsEnabled: the island page (file://) may only load it cross-origin.
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}

/** island-media://wa/<chat>/<message>. Pure. */
export function mediaUrl(chatId: string, msgId: string): string {
  return `${MEDIA_SCHEME}://wa/${encodeURIComponent(chatId)}/${encodeURIComponent(msgId)}`
}

/** The chat and message ids in a media URL, or null. Pure. */
export function parseMediaUrl(url: string): { chatId: string; msgId: string } | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (u.protocol !== `${MEDIA_SCHEME}:` || u.host !== 'wa' || parts.length !== 2) return null
    const [chatId, msgId] = parts.map(decodeURIComponent)
    return chatId && msgId && chatId.length <= 200 && msgId.length <= 300 ? { chatId, msgId } : null
  } catch {
    return null
  }
}

/** Byte range asked for by a Range header, clamped to the file. Pure. */
export function byteRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '')
  if (!m || size <= 0 || (!m[1] && !m[2])) return null
  let start: number
  let end: number
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  }
  return start <= end && start < size ? { start, end } : null
}

/**
 * Serve WhatsApp attachments to the island. Call after app 'ready' but before
 * the island page loads: a page only knows the schemes handled when it loaded.
 */
export function serveMedia(whatsapp: () => WhatsAppService | null): void {
  protocol.handle(MEDIA_SCHEME, async (req) => {
    const ids = parseMediaUrl(req.url)
    const wa = whatsapp()
    if (!ids || !wa) return new Response('Not found', { status: 404 })
    let f
    try {
      f = await wa.getMedia(ids.chatId, ids.msgId)
    } catch (e: any) {
      return new Response(e?.message ?? 'Download failed', { status: 502 })
    }
    const size = f.data.length
    const r = byteRange(req.headers.get('range'), size)
    const headers: Record<string, string> = {
      'Content-Type': f.mime,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    }
    if (!r) return new Response(new Uint8Array(f.data), { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
    const body = f.data.subarray(r.start, r.end + 1)
    return new Response(new Uint8Array(body), {
      status: 206,
      headers: { ...headers, 'Content-Length': String(body.length), 'Content-Range': `bytes ${r.start}-${r.end}/${size}` },
    })
  })
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
  // Download (so errors show), then hand out an address that streams it.
  ipcMain.handle(INBOX.CHAT_MEDIA, async (_e, chatId, msgId): Promise<ChatMediaFile> => {
    const c = str(chatId, 'chat')
    const m = str(msgId, 'message', 300)
    const f = await whatsapp.getMedia(c, m)
    return { mime: f.mime, url: mediaUrl(c, m), name: f.name }
  })
  // Save an attachment to Downloads and open it with the usual app.
  ipcMain.handle(INBOX.CHAT_MEDIA_OPEN, async (_e, chatId, msgId): Promise<string> => {
    const f = await whatsapp.getMedia(str(chatId, 'chat'), str(msgId, 'message', 300))
    const dir = process.env.DI_DOWNLOADS || app.getPath('downloads')
    mkdirSync(dir, { recursive: true })
    const file = freePath(dir, attachmentName(f.name, f.mime))
    writeFileSync(file, f.data)
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
