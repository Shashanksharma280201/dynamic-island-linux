import { appendFileSync } from 'node:fs'
import type { EngineEvents, WhatsAppEngine } from './whatsapp'
import type { ChatSummary, ChatMessage } from '@shared/types'

// 1x1 green PNG, stands in for the QR code.
const FAKE_QR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

type Chat = { id: string; name: string; isGroup: boolean; unread: number; messages: ChatMessage[] }

const min = 60_000

/** Some believable history so the chat list isn't empty. */
function seed(now: number): Chat[] {
  let n = 0
  const m = (fromMe: boolean, text: string, ago: number, author?: string): ChatMessage => ({
    id: `seed-${n++}`,
    fromMe,
    author,
    text,
    time: now - ago,
  })
  return [
    {
      id: '15550001111@c.us',
      name: 'Alice',
      isGroup: false,
      unread: 0,
      messages: [m(true, 'Lunch tomorrow?', 60 * min), m(false, 'Sure, where?', 58 * min)],
    },
    {
      id: '120363000000000000@g.us',
      name: 'Weekend Trip',
      isGroup: true,
      unread: 3,
      messages: [
        m(false, 'Booked the cabin 🏡', 50 * min, 'Sam'),
        m(false, 'Who is driving?', 40 * min, 'Priya'),
        m(true, 'I can drive', 35 * min),
        m(false, 'Great, leaving at 8', 30 * min, 'Sam'),
      ],
    },
    {
      id: '15550002222@c.us',
      name: 'Mom',
      isGroup: false,
      unread: 1,
      messages: [m(false, 'Call me when you are free', 3 * 60 * min)],
    },
    {
      id: '15550003333@c.us',
      name: 'Bob Builder',
      isGroup: false,
      unread: 0,
      messages: [m(false, 'Sent you the invoice', 26 * 60 * min), m(true, 'Thanks!', 25 * 60 * min)],
    },
  ]
}

/**
 * Stand-in WhatsApp used by demo mode and the e2e tests (the real one needs a
 * phone and web.whatsapp.com). Shows a QR, "links" after `readyMs`, then
 * receives a couple of messages. Sent replies are appended to `logFile`.
 */
export class FakeWhatsAppEngine implements WhatsAppEngine {
  private timers: ReturnType<typeof setTimeout>[] = []
  private chats: Chat[] = seed(Date.now())
  private seq = 0

  constructor(
    private logFile?: string,
    private readyMs = 2500,
  ) {}

  private log(entry: object): void {
    if (this.logFile) appendFileSync(this.logFile, JSON.stringify(entry) + '\n')
  }

  private chat(id: string): Chat {
    const c = this.chats.find((x) => x.id === id)
    if (!c) throw new Error('No such chat')
    return c
  }

  async start(ev: EngineEvents): Promise<void> {
    ev.onQr(FAKE_QR)
    const at = (ms: number, fn: () => void) => this.timers.push(setTimeout(fn, ms))
    at(this.readyMs, () => ev.onReady('Demo User'))
    const incoming = (text: string) => {
      const c = this.chat('15550001111@c.us')
      c.messages.push({ id: `in-${this.seq++}`, fromMe: false, text, time: Date.now() })
      c.unread++
      // newest chat first
      this.chats = [c, ...this.chats.filter((x) => x !== c)]
      ev.onMessage({ chatId: c.id, sender: c.name, isGroup: false, text, time: Date.now() })
    }
    at(this.readyMs + 1500, () => incoming('Hey! Are we still on for lunch?'))
    at(this.readyMs + 2500, () => incoming('📷 Photo: the new place'))
  }

  async listChats(limit: number): Promise<ChatSummary[]> {
    return this.chats.slice(0, limit).map((c) => {
      const last = c.messages[c.messages.length - 1]
      return {
        id: c.id,
        name: c.name,
        isGroup: c.isGroup,
        unread: c.unread,
        time: last?.time ?? 0,
        last: last ? (c.isGroup && last.author ? `${last.author}: ${last.text}` : last.text) : '',
        lastFromMe: !!last?.fromMe,
      }
    })
  }

  async getMessages(chatId: string, limit: number): Promise<ChatMessage[]> {
    const c = this.chat(chatId)
    c.unread = 0
    return c.messages.slice(-limit)
  }

  async send(chatId: string, text: string): Promise<void> {
    const c = this.chat(chatId)
    c.messages.push({ id: `out-${this.seq++}`, fromMe: true, text, time: Date.now() })
    this.log({ op: 'send', chatId, text })
  }

  async markRead(chatId: string): Promise<void> {
    this.chat(chatId).unread = 0
    this.log({ op: 'read', chatId })
  }

  async pairingCode(): Promise<string> {
    return 'DEMO-CODE'
  }

  async logout(): Promise<void> {}

  async stop(): Promise<void> {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }
}
