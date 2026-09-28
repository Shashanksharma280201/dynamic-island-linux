import { ipcMain, type BrowserWindow } from 'electron'
import type { InboxSources, InboxUnread } from '@shared/types'
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
