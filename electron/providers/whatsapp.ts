import { BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

const require = createRequire(import.meta.url)

export type WaIncoming = {
  chatId: string
  sender: string
  chatName?: string
  isGroup: boolean
  text: string
  time: number
  avatar?: string
}

export type { WaState } from '@shared/types'
import type { WaState, ChatSummary, ChatMessage } from '@shared/types'
import {
  readChatsFromStore,
  readMessagesFromStore,
  readChatInfoFromStore,
  type RawChat,
  type RawMsg,
} from './whatsappStore'

export type EngineEvents = {
  onQr: (qr: string) => void
  onReady: (me?: string) => void
  onMessage: (m: WaIncoming) => void
  onDisconnected: (reason?: string) => void
}

/** What the island needs from a WhatsApp backend (a fake one is used in tests). */
export interface WhatsAppEngine {
  start(ev: EngineEvents): Promise<void>
  listChats(limit: number): Promise<ChatSummary[]>
  getMessages(chatId: string, limit: number): Promise<ChatMessage[]>
  send(chatId: string, text: string): Promise<void>
  markRead(chatId: string): Promise<void>
  pairingCode(phone: string): Promise<string>
  logout(): Promise<void>
  stop(): Promise<void>
}

const MEDIA_LABEL: Record<string, string> = {
  image: '📷 Photo',
  video: '🎥 Video',
  audio: '🎵 Audio',
  ptt: '🎤 Voice message',
  document: '📄 Document',
  sticker: 'Sticker',
  location: '📍 Location',
  vcard: '👤 Contact',
  multi_vcard: '👤 Contacts',
}

/** Text shown for a WhatsApp message of a given type. Pure. */
export function messageText(type: string, body: string | undefined): string {
  const label = MEDIA_LABEL[type]
  const b = (body ?? '').trim()
  if (!label) return b
  return b && type !== 'sticker' && type !== 'location' ? `${label}: ${b}` : label
}

/** Messages the island ignores (status updates, own messages, system events). Pure. */
export function isRelevant(m: { from?: string; fromMe?: boolean; isStatus?: boolean; type?: string }): boolean {
  if (m.fromMe || m.isStatus) return false
  if (!m.from || m.from === 'status@broadcast') return false
  if (m.type && ['e2e_notification', 'notification_template', 'call_log', 'protocol', 'revoked'].includes(m.type))
    return false
  return true
}

/** Map chats read straight from WhatsApp Web's data. Pure. */
export function chatsFromRaw(raw: RawChat[], limit: number): ChatSummary[] {
  return raw
    .filter((c) => !c.archived)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      name: c.name,
      isGroup: c.isGroup,
      unread: c.unread,
      time: c.t * 1000,
      last: c.last
        ? (c.isGroup && c.last.author && !c.last.fromMe ? `${c.last.author}: ` : '') +
          messageText(c.last.type, c.last.body)
        : '',
      lastFromMe: !!c.last?.fromMe,
    }))
}

/**
 * "+<number>" for a phone-number id ("91987…@c.us"), else undefined: group
 * senders often come as opaque "@lid" ids that are not phone numbers. Pure.
 */
export function phoneOf(id: unknown): string | undefined {
  const s = typeof id === 'string' ? id : ''
  return s.endsWith('@c.us') ? `+${s.split('@')[0]}` : undefined
}

/** Map messages read straight from WhatsApp Web's data. Pure. */
export function messagesFromRaw(raw: RawMsg[], isGroup: boolean): ChatMessage[] {
  return raw
    .filter((m) => isRelevant({ from: 'x', type: m.type }) || m.fromMe)
    .map((m) => ({
      id: m.id,
      fromMe: m.fromMe,
      author: isGroup && !m.fromMe ? m.author : undefined,
      text: messageText(m.type, m.body),
      time: m.t * 1000,
    }))
}

let connectPatched = false

/**
 * Point whatsapp-web.js at a window of this Electron app instead of launching
 * a browser. It calls `puppeteer.connect()` then `browser.newPage()`; we return
 * the hidden window's page (Electron can't create CDP targets itself) and make
 * `browser.close()` only disconnect, so it can never close the island.
 */
function patchPuppeteerConnect(): void {
  if (connectPatched) return
  connectPatched = true
  const puppeteer = require('puppeteer')
  const connect = puppeteer.connect.bind(puppeteer)
  puppeteer.connect = async (opts: any) => {
    const browser = await connect(opts)
    const marker: string | undefined = opts?.islandMarker
    if (marker) {
      const page = (await browser.pages()).find((p: any) => p.url().includes(marker))
      if (!page) throw new Error('WhatsApp window not found over CDP')
      browser.newPage = async () => page
      browser.close = async () => browser.disconnect()
    }
    return browser
  }
}

/**
 * whatsapp-web.js running in a hidden window of the island (partition
 * `persist:whatsapp`, so the linked-device login survives restarts). Requires
 * the app to have been started with a remote-debugging port on 127.0.0.1.
 */
export class WwebjsEngine implements WhatsAppEngine {
  private win: BrowserWindow | null = null
  private client: any = null

  constructor(private cdpUrl: string) {}

  async start(ev: EngineEvents): Promise<void> {
    patchPuppeteerConnect()
    const { Client, NoAuth } = require('whatsapp-web.js')
    const QRCode = require('qrcode')
    const marker = `di-whatsapp-${randomUUID()}`
    this.win = new BrowserWindow({
      show: false,
      width: 1100,
      height: 800,
      webPreferences: { partition: 'persist:whatsapp', backgroundThrottling: false },
    })
    await this.win.loadURL(`about:blank#${marker}`)
    const client = new Client({
      authStrategy: new NoAuth(), // the persist: partition keeps the session
      puppeteer: { browserURL: this.cdpUrl, defaultViewport: null, islandMarker: marker },
    })
    this.client = client
    client.on('qr', async (qr: string) => ev.onQr(await QRCode.toDataURL(qr, { margin: 1, width: 280 })))
    client.on('ready', () => ev.onReady(client.info?.pushname || client.info?.wid?.user))
    client.on('disconnected', (reason: string) => ev.onDisconnected(reason))
    client.on('message', async (msg: any) => {
      if (!isRelevant(msg)) return
      try {
        ev.onMessage(await this.describeIncoming(msg))
      } catch (e) {
        console.error('whatsapp message:', e)
      }
    })
    await client.initialize()
  }

  // Chats and messages are read straight from WhatsApp Web's in-memory data
  // first: whatsapp-web.js's getChats()/getChatById() convert every chat into
  // a full model (and query group metadata), which fails outright when
  // WhatsApp Web changes shape. The library's calls are only the fallback.

  async listChats(limit: number): Promise<ChatSummary[]> {
    try {
      const raw: RawChat[] = await this.client.pupPage.evaluate(readChatsFromStore, limit * 2)
      return chatsFromRaw(raw, limit)
    } catch (direct) {
      console.error('[whatsapp] direct chat read failed, trying getChats():', direct)
      const chats: any[] = await this.client.getChats()
      return chats
        .filter((c) => !c.archived && c.id?._serialized !== 'status@broadcast')
        .slice(0, limit)
        .map((c) => {
          const last = c.lastMessage
          return {
            id: c.id._serialized,
            name: c.name || c.id.user || 'Unknown',
            isGroup: !!c.isGroup,
            unread: c.unreadCount || 0,
            time: (c.timestamp || last?.timestamp || 0) * 1000,
            last: last ? messageText(last.type, last.body) : '',
            lastFromMe: !!last?.fromMe,
          }
        })
    }
  }

  async getMessages(chatId: string, limit: number): Promise<ChatMessage[]> {
    let result: ChatMessage[]
    try {
      const raw: RawMsg[] = await this.client.pupPage.evaluate(readMessagesFromStore, chatId, limit)
      result = messagesFromRaw(raw, chatId.endsWith('@g.us'))
    } catch (direct) {
      console.error('[whatsapp] direct message read failed, trying fetchMessages():', direct)
      const chat = await this.client.getChatById(chatId)
      const msgs: any[] = await chat.fetchMessages({ limit })
      result = msgs
        .filter((m) => m.type !== 'e2e_notification' && m.type !== 'notification_template')
        .map((m) => ({
          id: m.id?._serialized ?? String(m.timestamp),
          fromMe: !!m.fromMe,
          author: chat.isGroup && !m.fromMe ? m._data?.notifyName || phoneOf(m.author) : undefined,
          text: messageText(m.type, m.body),
          time: (m.timestamp ?? 0) * 1000,
        }))
    }
    await this.markRead(chatId).catch(() => {})
    return result
  }

  /**
   * Who sent an incoming message and in which chat. Avoids msg.getChat() /
   * getContact(), which break when WhatsApp Web changes its internals, and
   * reads the plain fields instead.
   */
  private async describeIncoming(msg: any): Promise<WaIncoming> {
    const chatId: string = msg.fromMe ? msg.to : msg.from
    const info = await this.client.pupPage
      .evaluate(readChatInfoFromStore, chatId)
      .catch(() => null)
    const isGroup = info?.isGroup ?? chatId.endsWith('@g.us')
    const pushName: string | undefined = msg._data?.notifyName || msg.notifyName
    const sender = isGroup
      ? pushName || phoneOf(msg.author) || 'Someone'
      : info?.name || pushName || chatId.split('@')[0]
    return {
      chatId,
      sender,
      chatName: isGroup ? info?.name : undefined,
      isGroup,
      text: messageText(msg.type, msg.body),
      time: (msg.timestamp ?? Date.now() / 1000) * 1000,
    }
  }

  async send(chatId: string, text: string): Promise<void> {
    await this.client.sendMessage(chatId, text)
    await this.markRead(chatId).catch(() => {})
  }

  async markRead(chatId: string): Promise<void> {
    // sendSeen looks the chat up without the (fragile) model conversion.
    await this.client.sendSeen(chatId)
  }

  async pairingCode(phone: string): Promise<string> {
    return this.client.requestPairingCode(phone.replace(/\D/g, ''))
  }

  async logout(): Promise<void> {
    await this.client?.logout()
  }

  async stop(): Promise<void> {
    try {
      await this.client?.destroy()
    } catch {
      // already gone
    }
    this.client = null
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }
}

/** Keeps a WhatsApp engine running and exposes its state. */
export class WhatsAppService {
  private engine: WhatsAppEngine | null = null
  private state: WaState = { state: 'disabled' }
  private stateCbs: Array<(s: WaState) => void> = []
  private msgCb: ((m: WaIncoming) => void) | null = null

  constructor(private makeEngine: () => WhatsAppEngine) {}

  onState(cb: (s: WaState) => void): void {
    this.stateCbs.push(cb)
  }

  onMessage(cb: (m: WaIncoming) => void): void {
    this.msgCb = cb
  }

  get current(): WaState {
    return this.state
  }

  get running(): boolean {
    return this.engine !== null
  }

  private set(s: WaState): void {
    this.state = s
    for (const cb of this.stateCbs) cb(s)
  }

  async start(): Promise<void> {
    if (this.engine) return
    const engine = this.makeEngine()
    this.engine = engine
    this.set({ state: 'starting' })
    try {
      await engine.start({
        onQr: (qr) => this.set({ state: 'qr', qr }),
        onReady: (me) => this.set({ state: 'ready', me }),
        onMessage: (m) => this.msgCb?.(m),
        onDisconnected: (reason) => this.set({ state: 'disconnected', reason }),
      })
    } catch (e: any) {
      this.engine = null
      this.set({ state: 'error', error: e?.message ?? String(e) })
      await engine.stop().catch(() => {})
    }
  }

  private need(): WhatsAppEngine {
    if (!this.engine || this.state.state !== 'ready') throw new Error('WhatsApp is not connected')
    return this.engine
  }

  async send(chatId: string, text: string): Promise<void> {
    return this.need().send(chatId, text)
  }

  async listChats(limit = 40): Promise<ChatSummary[]> {
    return this.need().listChats(limit)
  }

  async getMessages(chatId: string, limit = 40): Promise<ChatMessage[]> {
    return this.need().getMessages(chatId, limit)
  }

  async markRead(chatId: string): Promise<void> {
    return this.need().markRead(chatId)
  }

  async pairingCode(phone: string): Promise<string> {
    if (!this.engine || this.state.state !== 'qr') throw new Error('WhatsApp is not waiting to be linked')
    return this.engine.pairingCode(phone)
  }

  async logout(): Promise<void> {
    await this.engine?.logout().catch(() => {})
    await this.stop()
  }

  async stop(): Promise<void> {
    const e = this.engine
    this.engine = null
    await e?.stop().catch(() => {})
    this.set({ state: 'disabled' })
  }
}
