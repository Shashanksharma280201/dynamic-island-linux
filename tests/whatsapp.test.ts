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
  engine.ev.onReady('Sam')
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
