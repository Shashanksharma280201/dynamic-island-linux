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

export type RawMsg = {
  id: string
  type: string
  body: string
  fromMe: boolean
  t: number
  author?: string
  /** Media messages: the caption, and the preview WhatsApp keeps in `body`. */
  caption?: string
  thumb?: string
  mime?: string
  name?: string
  size?: number
  duration?: number
  width?: number
  height?: number
}

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
              // A media message's body is its preview image: use the caption.
              body:
                typeof m.caption === 'string' || m.directPath || m.mediaData
                  ? typeof m.caption === 'string'
                    ? m.caption
                    : ''
                  : typeof m.body === 'string'
                    ? m.body
                    : '',
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
      const media = !!(m.directPath || m.mediaData)
      const num = (v: any) => (typeof v === 'number' ? v : Number(v) || undefined)
      out.push({
        id: m.id?._serialized ?? String(m.t),
        type: String(m.type || 'chat'),
        body: !media && typeof m.body === 'string' ? m.body : '',
        fromMe: !!m.id?.fromMe,
        t: Number(m.t) || 0,
        author: senderName(m),
        ...(media
          ? {
              caption: typeof m.caption === 'string' ? m.caption : '',
              // The preview WhatsApp shows before downloading (base64 JPEG).
              thumb:
                typeof m.body === 'string' && m.body.length < 400000
                  ? m.body
                  : typeof m.mediaData?.preview === 'string'
                    ? m.mediaData.preview
                    : undefined,
              mime: typeof m.mimetype === 'string' ? m.mimetype : undefined,
              name: typeof m.filename === 'string' ? m.filename : undefined,
              size: num(m.size),
              duration: num(m.duration),
              width: num(m.width),
              height: num(m.height),
            }
          : {}),
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

export type RawMedia = { data: string; mimetype: string; filename?: string }

/**
 * Download and decrypt one message's attachment inside WhatsApp Web; returns
 * base64. First asks WhatsApp's download manager for the file directly (what
 * WhatsApp Web itself does), then, if that fails (old media whose link has
 * expired), lets WhatsApp re-fetch it and reads the copy it keeps.
 */
export async function downloadMediaInPage(msgId: string): Promise<RawMedia> {
  const w = window as any
  const Coll = w.require('WAWebCollections')
  const msg = Coll.Msg.get(msgId) || (await Coll.Msg.getMessagesById([msgId]))?.messages?.[0]
  if (!msg) throw new Error('Message not found')
  const toBase64 = (data: Blob | ArrayBuffer): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(data instanceof Blob ? data : new Blob([data]))
    })
  const mimetype: string = msg.mimetype || msg.mediaData?.mimetype || 'application/octet-stream'
  const done = async (data: Blob | ArrayBuffer): Promise<RawMedia> => ({
    data: await toBase64(data),
    mimetype,
    filename: typeof msg.filename === 'string' ? msg.filename : undefined,
  })
  const qpl = {
    addAnnotations() {
      return this
    },
    addPoint() {
      return this
    },
  }
  const direct = () =>
    w.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
      directPath: msg.directPath,
      encFilehash: msg.encFilehash,
      filehash: msg.filehash,
      mediaKey: msg.mediaKey,
      mediaKeyTimestamp: msg.mediaKeyTimestamp,
      type: msg.type,
      signal: new AbortController().signal,
      downloadQpl: qpl,
    })
  const kept = async (): Promise<Blob | null> => {
    const b = msg.mediaData?.mediaBlob
    if (!b) return null
    if (b instanceof Blob) return b
    return (await b.forceToBlob?.()) ?? null
  }
  let first: unknown
  try {
    const hit = await kept()
    if (hit) return await done(hit)
    return await done(await direct())
  } catch (e) {
    first = e
  }
  // Let WhatsApp resolve the media (re-requests expired links), then retry.
  if (msg.mediaData?.mediaStage !== 'RESOLVED') {
    await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true })
  }
  const stage = String(msg.mediaData?.mediaStage ?? '')
  if (stage.includes('ERROR') || stage === 'REUPLOADING') throw new Error('This media is no longer available on your phone')
  const hit = await kept()
  if (hit) return done(hit)
  try {
    return await done(await direct())
  } catch {
    throw first instanceof Error ? first : new Error(String(first))
  }
}
