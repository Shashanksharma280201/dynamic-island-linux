import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import type { EngineEvents, WhatsAppEngine, WaMediaFile } from './whatsapp'
import type { ChatSummary, ChatMessage } from '@shared/types'

// ---- generated media: a sunset-ish PNG photo and a short WAV voice note ----
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => {
    let c = 0xffffffff
    for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const td = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    td.copy(out, 4)
    out.writeUInt32BE(crc(td), 8 + data.length)
    return out
  }
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y)
      const i = y * (w * 3 + 1) + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const sunset = (w: number, h: number) =>
  png(w, h, (x, y) => {
    const t = y / h
    const sun = Math.hypot(x - w * 0.62, y - h * 0.55) < h * 0.12
    if (sun) return [255, 236, 170]
    if (t > 0.62) return [40 + (x % 7), 60 + t * 40, 35] // field
    return [250 - t * 60, 150 - t * 60, 90 + t * 60]
  }).toString('base64')
function wav(seconds: number): string {
  const rate = 8000
  const n = rate * seconds
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 3000), 44 + i * 2)
  return b.toString('base64')
}
/** Full-size attachments by message id (thumbnails are in the messages). */
const FAKE_MEDIA: Record<string, WaMediaFile> = {
  'media-photo': { mime: 'image/png', data: sunset(480, 360) },
  'media-voice': { mime: 'audio/wav', data: wav(2) },
  'media-doc': { mime: 'text/plain', data: Buffer.from('Day 1: drive up\nDay 2: hike\n').toString('base64'), name: 'Trip plan.txt' },
}

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
        m(false, 'Is everyone in for the trip this weekend?', 26 * 60 * min, 'Priya'),
        m(true, 'Count me in!', 25 * 60 * min),
        m(false, 'Booked the cabin 🏡', 50 * min, 'Sam'),
        m(false, 'It has a hot tub', 49 * min, 'Sam'),
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
    // A realistic long tail, so the list has to scroll.
    ...[
      ['Priya Shah', 'Can you send me the slides from yesterday’s presentation? I want to go through them again tonight', false],
      ['Family ❤️', 'Dad: Dinner at 8, don’t be late this time!', true],
      ['Rahul (Work)', 'The deploy went fine, closing the ticket now', false],
      ['College Friends 2016–2020 Reunion Planning Committee', 'Neha: Poll: which weekend works for everyone?', true],
      ['Landlord', 'Rent receipt attached', false],
      ['Gym Buddies', 'Aman: 6am tomorrow?', true],
      ['Ananya', 'Haha that’s hilarious 😂', false], // + a photo, voice note and file (below)
      ['Book Club', 'Next pick is “Project Hail Mary”', true],
      ['Dentist Clinic', 'Reminder: appointment on Monday 10:30', false],
      ['Vikram', 'You: See you there', false],
    ].map(([name, text, isGroup], i) => ({
      id: `1555001${String(i).padStart(4, '0')}@${isGroup ? 'g' : 'c'}.us`,
      name: name as string,
      isGroup: isGroup as boolean,
      unread: i % 3 === 0 ? i + 1 : 0,
      messages:
        name === 'Gym Buddies'
          ? // A busy group with a long history (more than fits on screen).
            Array.from({ length: 40 }, (_, k) =>
              k % 5 === 4
                ? m(true, `On my way (${k})`, (30 + i * 9) * 60 * min + (40 - k) * 7 * min)
                : m(false, k === 39 ? String(text).replace(/^Aman: /, '') : `Set ${k}: ${'squats deadlifts bench '.repeat(1 + (k % 3))}`.trim(), (30 + i * 9) * 60 * min + (40 - k) * 7 * min, ['Aman', 'Neha', 'Kabir'][k % 3]),
            )
          : [
              ...(name === 'Ananya'
                ? [
                    {
                      ...m(false, 'The view from the cabin!', (31 + i * 9) * 60 * min),
                      id: 'media-photo',
                      media: { kind: 'image' as const, thumb: `data:image/png;base64,${sunset(48, 36)}`, mime: 'image/png', width: 480, height: 360 },
                    },
                    {
                      ...m(false, '', (31 + i * 9) * 60 * min - 30_000),
                      id: 'media-video',
                      media: { kind: 'video' as const, thumb: `data:image/png;base64,${sunset(48, 36)}`, mime: 'video/webm', duration: 1, width: 320, height: 240 },
                    },
                    { ...m(false, '', (31 + i * 9) * 60 * min - min), id: 'media-voice', media: { kind: 'voice' as const, mime: 'audio/wav', duration: 2 } },
                    { ...m(true, '', (31 + i * 9) * 60 * min - 2 * min), id: 'media-doc', media: { kind: 'document' as const, name: 'Trip plan.txt', mime: 'text/plain', size: 30 } },
                  ]
                : []),
              m(String(text).startsWith('You: '), String(text).replace(/^You: /, ''), (30 + i * 9) * 60 * min),
            ],
    })),
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
    const arrive = (wait: number) => {
      at(wait + 1500, () => incoming('Hey! Are we still on for lunch?'))
      at(wait + 2500, () => incoming('📷 Photo: the new place'))
    }
    // Recordings can choose the moment: the messages arrive once this file exists.
    const trigger = process.env.DI_FAKE_WA_TRIGGER
    if (!trigger) return arrive(this.readyMs)
    const poll = setInterval(() => {
      if (!existsSync(trigger)) return
      clearInterval(poll)
      arrive(0)
    }, 200)
    this.timers.push(poll as unknown as ReturnType<typeof setTimeout>)
  }

  async listChats(limit: number): Promise<ChatSummary[]> {
    // Real WhatsApp Web takes a moment to list chats: tests can mimic that.
    const slow = Number(process.env.DI_FAKE_WA_LIST_MS) || 0
    if (slow) await new Promise((r) => setTimeout(r, slow))
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

  async getMedia(chatId: string, msgId: string): Promise<WaMediaFile> {
    this.chat(chatId)
    // Tests can supply a real video file (DI_FAKE_WA_VIDEO).
    const video = process.env.DI_FAKE_WA_VIDEO
    const f =
      msgId === 'media-video' && video && existsSync(video)
        ? { mime: 'video/webm', data: readFileSync(video).toString('base64') }
        : FAKE_MEDIA[msgId]
    if (!f) throw new Error('This media is no longer available on your phone')
    this.log({ op: 'media', chatId, msgId })
    return f
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
