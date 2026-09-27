import { appendFileSync } from 'node:fs'
import type { EngineEvents, WhatsAppEngine } from './whatsapp'

// 1x1 green PNG, stands in for the QR code.
const FAKE_QR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * Stand-in WhatsApp used by demo mode and the e2e tests (the real one needs a
 * phone and web.whatsapp.com). Shows a QR, "links" after `readyMs`, then
 * sends a couple of messages. Sent replies are appended to `logFile`.
 */
export class FakeWhatsAppEngine implements WhatsAppEngine {
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(
    private logFile?: string,
    private readyMs = 2500,
  ) {}

  async start(ev: EngineEvents): Promise<void> {
    ev.onQr(FAKE_QR)
    const at = (ms: number, fn: () => void) => this.timers.push(setTimeout(fn, ms))
    at(this.readyMs, () => ev.onReady('Demo User'))
    const msg = (text: string, extra = {}) => ({
      chatId: '15550001111@c.us',
      sender: 'Alice',
      isGroup: false,
      text,
      time: Date.now(),
      ...extra,
    })
    at(this.readyMs + 1500, () => ev.onMessage(msg('Hey! Are we still on for lunch?')))
    at(this.readyMs + 2500, () => ev.onMessage(msg('📷 Photo: the new place')))
  }

  async send(chatId: string, text: string): Promise<void> {
    if (this.logFile) appendFileSync(this.logFile, JSON.stringify({ op: 'send', chatId, text }) + '\n')
  }

  async markRead(chatId: string): Promise<void> {
    if (this.logFile) appendFileSync(this.logFile, JSON.stringify({ op: 'read', chatId }) + '\n')
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
