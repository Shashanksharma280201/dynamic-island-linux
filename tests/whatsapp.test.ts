import { vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: class {} }))
import {
  WhatsAppService,
  messageText,
  isRelevant,
  type WhatsAppEngine,
  type EngineEvents,
} from '../electron/providers/whatsapp'

test('messageText labels media', () => {
  expect(messageText('chat', ' hi ')).toBe('hi')
  expect(messageText('image', 'look')).toBe('📷 Photo: look')
  expect(messageText('ptt', '')).toBe('🎤 Voice message')
  expect(messageText('sticker', 'x')).toBe('Sticker')
})

test('isRelevant filters own, status and system messages', () => {
  expect(isRelevant({ from: '1@c.us', type: 'chat' })).toBe(true)
  expect(isRelevant({ from: '1@c.us', fromMe: true })).toBe(false)
  expect(isRelevant({ from: 'status@broadcast' })).toBe(false)
  expect(isRelevant({ from: '1@c.us', type: 'e2e_notification' })).toBe(false)
})

class FakeEngine implements WhatsAppEngine {
  ev!: EngineEvents
  sent: string[] = []
  stopped = false
  async start(ev: EngineEvents) {
    this.ev = ev
    ev.onQr('data:image/png;base64,QR')
  }
  async send(chatId: string, text: string) {
    this.sent.push(`${chatId}:${text}`)
  }
  async listChats() {
    return [{ id: '1@c.us', name: 'A', isGroup: false, unread: 0, time: 1, last: 'hi', lastFromMe: false }]
  }
  async getMessages() {
    return [{ id: 'm1', fromMe: false, text: 'hi', time: 1 }]
  }
  async markRead() {}
  async pairingCode() {
    return 'ABCD-EFGH'
  }
  async logout() {}
  async stop() {
    this.stopped = true
  }
}

test('service tracks QR → ready and only sends when ready', async () => {
  const engine = new FakeEngine()
  const svc = new WhatsAppService(() => engine)
  const states: string[] = []
  svc.onState((s) => states.push(s.state))
  await svc.start()
  expect(svc.current).toEqual({ state: 'qr', qr: 'data:image/png;base64,QR' })
  expect(await svc.pairingCode('+91 98765 43210')).toBe('ABCD-EFGH')
  await expect(svc.send('1@c.us', 'x')).rejects.toThrow(/not connected/)
  await expect(svc.listChats()).rejects.toThrow(/not connected/)
  engine.ev.onReady('Sam')
  expect((await svc.listChats())[0].name).toBe('A')
  expect((await svc.getMessages('1@c.us'))[0].text).toBe('hi')
  await svc.send('1@c.us', 'hi')
  expect(engine.sent).toEqual(['1@c.us:hi'])
  await svc.stop()
  expect(engine.stopped).toBe(true)
  expect(states).toEqual(['starting', 'qr', 'ready', 'disabled'])
})

test('engine start failure becomes an error state', async () => {
  const svc = new WhatsAppService(() => ({
    ...new FakeEngine(),
    start: async () => {
      throw new Error('net::ERR_TUNNEL_CONNECTION_FAILED')
    },
    stop: async () => {},
  }) as any)
  await svc.start()
  expect(svc.current).toEqual({ state: 'error', error: 'net::ERR_TUNNEL_CONNECTION_FAILED' })
  expect(svc.running).toBe(false)
})

import { FakeWhatsAppEngine } from '../electron/providers/whatsappFake'

test('fake engine keeps history: sending appends, reading clears unread', async () => {
  const e = new FakeWhatsAppEngine()
  const chats = await e.listChats(10)
  const group = chats.find((c) => c.isGroup)!
  expect(group.unread).toBeGreaterThan(0)
  expect(group.last).toContain(':') // author prefix in groups
  await e.getMessages(group.id, 10)
  expect((await e.listChats(10)).find((c) => c.id === group.id)!.unread).toBe(0)
  await e.send(group.id, 'On my way')
  const msgs = await e.getMessages(group.id, 10)
  expect(msgs.at(-1)).toMatchObject({ fromMe: true, text: 'On my way' })
})
