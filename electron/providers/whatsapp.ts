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
import type { WaState } from '@shared/types'

export type EngineEvents = {
  onQr: (qr: string) => void
  onReady: (me?: string) => void
  onMessage: (m: WaIncoming) => void
  onDisconnected: (reason?: string) => void
}

/** What the island needs from a WhatsApp backend (a fake one is used in tests). */
export interface WhatsAppEngine {
  start(ev: EngineEvents): Promise<void>
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
        const [contact, chat] = await Promise.all([msg.getContact(), msg.getChat()])
        let avatar: string | undefined
        try {
          avatar = (await contact.getProfilePicUrl()) || undefined
        } catch {
          // no picture / privacy settings
        }
        ev.onMessage({
          chatId: chat.id._serialized,
          sender: contact.pushname || contact.name || contact.number || 'Unknown',
          chatName: chat.isGroup ? chat.name : undefined,
          isGroup: !!chat.isGroup,
          text: messageText(msg.type, msg.body),
          time: (msg.timestamp ?? Date.now() / 1000) * 1000,
          avatar,
        })
      } catch (e) {
        console.error('whatsapp message:', e)
      }
    })
    await client.initialize()
  }

  async send(chatId: string, text: string): Promise<void> {
    await this.client.sendMessage(chatId, text)
    await this.markRead(chatId).catch(() => {})
  }

  async markRead(chatId: string): Promise<void> {
    const chat = await this.client.getChatById(chatId)
    await chat.sendSeen()
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
