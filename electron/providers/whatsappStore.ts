/**
 * Fallback readers that run *inside* the WhatsApp Web page (via Puppeteer's
 * page.evaluate) and read WhatsApp's own in-memory models directly, taking
 * only plain fields. whatsapp-web.js's getChats()/fetchMessages() serialise
 * whole models and break when WhatsApp Web changes shape or meets unusual
 * chats (channels, communities); these skip anything they can't read.
 *
 * They must stay self-contained: no imports, no closures over module scope.
 */

export type RawChat = {
  id: string
  name: string
  isGroup: boolean
  unread: number
  t: number
  archived: boolean
  last?: { type: string; body: string; fromMe: boolean; author?: string }
}

export type RawMsg = { id: string; type: string; body: string; fromMe: boolean; t: number; author?: string }

export function readChatsFromStore(limit: number): RawChat[] {
  const w = window as any
  const Chat = w.Store?.Chat ?? w.require?.('WAWebCollections')?.Chat
  if (!Chat) throw new Error('WhatsApp Web data is not available yet')
  // Sender name as WhatsApp shows it: your saved name, else their profile
  // name, else their phone number. Group senders often come as opaque
  // "@lid" ids, which must never be shown as if they were numbers.
  const Contact = w.Store?.Contact ?? w.require?.('WAWebCollections')?.Contact
  const senderName = (m: any): string | undefined => {
    const wid = m.author ?? m.from
    const id: string = wid?._serialized ?? (typeof wid === 'string' ? wid : '')
    let c: any
    try {
      c = m.senderObj ?? (id ? Contact?.get?.(id) : undefined)
    } catch {
      c = undefined
    }
    const named = c?.name || c?.pushname || m.notifyName || c?.verifiedName || c?.notifyName
    if (named) return String(named)
    const phone = c?.phoneNumber?.user ?? (id.endsWith('@c.us') ? id.split('@')[0] : '')
    return phone ? `+${phone}` : undefined
  }
  const models: any[] = Chat.getModelsArray?.() ?? Chat.models ?? []
  const out: RawChat[] = []
  for (const c of models) {
    try {
      const id: string = c.id?._serialized ?? String(c.id)
      if (!id || id === 'status@broadcast' || id.endsWith('@newsletter')) continue
      const msgs: any[] = c.msgs?.getModelsArray?.() ?? []
      const m = msgs[msgs.length - 1]
      out.push({
        id,
        name: c.formattedTitle || c.name || c.contact?.name || c.contact?.pushname || c.id?.user || 'Unknown',
        isGroup: !!(c.isGroup ?? c.id?.server === 'g.us'),
        unread: Math.max(0, Number(c.unreadCount) || 0),
        t: Number(c.t) || Number(m?.t) || 0,
        archived: !!c.archive,
        last: m
          ? {
              type: String(m.type || 'chat'),
              body: typeof m.body === 'string' ? m.body : typeof m.caption === 'string' ? m.caption : '',
              fromMe: !!m.id?.fromMe,
              author: senderName(m),
            }
          : undefined,
      })
    } catch {
      // unreadable chat: skip it
    }
  }
  out.sort((a, b) => b.t - a.t)
  return out.slice(0, limit)
}

export async function readMessagesFromStore(chatId: string, limit: number): Promise<RawMsg[]> {
  const w = window as any
  const Chat = w.Store?.Chat ?? w.require?.('WAWebCollections')?.Chat
  const chat = Chat?.get?.(chatId)
  if (!chat) throw new Error('Chat not found')
  // Sender name as WhatsApp shows it: your saved name, else their profile
  // name, else their phone number. Group senders often come as opaque
  // "@lid" ids, which must never be shown as if they were numbers.
  const Contact = w.Store?.Contact ?? w.require?.('WAWebCollections')?.Contact
  const senderName = (m: any): string | undefined => {
    const wid = m.author ?? m.from
    const id: string = wid?._serialized ?? (typeof wid === 'string' ? wid : '')
    let c: any
    try {
      c = m.senderObj ?? (id ? Contact?.get?.(id) : undefined)
    } catch {
      c = undefined
    }
    const named = c?.name || c?.pushname || m.notifyName || c?.verifiedName || c?.notifyName
    if (named) return String(named)
    const phone = c?.phoneNumber?.user ?? (id.endsWith('@c.us') ? id.split('@')[0] : '')
    return phone ? `+${phone}` : undefined
  }
  let msgs: any[] = chat.msgs?.getModelsArray?.() ?? []
  // Only the latest few are in memory; load earlier ones like WhatsApp Web does.
  for (let i = 0; i < 3 && msgs.length < limit; i++) {
    try {
      const loaded = await w.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat })
      if (!loaded || !loaded.length) break
      msgs = chat.msgs.getModelsArray()
    } catch {
      break
    }
  }
  const out: RawMsg[] = []
  for (const m of msgs.slice(-limit)) {
    try {
      out.push({
        id: m.id?._serialized ?? String(m.t),
        type: String(m.type || 'chat'),
        body: typeof m.body === 'string' ? m.body : typeof m.caption === 'string' ? m.caption : '',
        fromMe: !!m.id?.fromMe,
        t: Number(m.t) || 0,
        author: senderName(m),
      })
    } catch {
      // unreadable message: skip it
    }
  }
  return out
}

/** Name and kind of one chat (for incoming-message cards). */
export function readChatInfoFromStore(chatId: string): { name: string; isGroup: boolean } | null {
  const w = window as any
  const Chat = w.Store?.Chat ?? w.require?.('WAWebCollections')?.Chat
  const c = Chat?.get?.(chatId)
  if (!c) return null
  return {
    name: c.formattedTitle || c.name || c.contact?.name || c.contact?.pushname || c.id?.user || 'Unknown',
    isGroup: !!(c.isGroup ?? c.id?.server === 'g.us'),
  }
}
