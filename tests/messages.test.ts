import { vi } from 'vitest'
import { ActivityStore } from '../electron/store'
import { TransientCards } from '../electron/transient'
import { MessageHub, withLine } from '../electron/messages'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const wa = (text: string, extra = {}) => ({
  chatId: '123@c.us',
  sender: 'Alice',
  isGroup: false,
  text,
  time: 1,
  ...extra,
})

function setup() {
  const store = new ActivityStore()
  const hub = new MessageHub(new TransientCards(store))
  const calls: string[] = []
  let fail = false
  hub.setBackend('whatsapp', {
    reply: async (t, text) => {
      if (fail) throw new Error('offline')
      calls.push(`reply ${t} ${text}`)
    },
    markRead: async (t) => void calls.push(`read ${t}`),
  })
  const card = () => {
    const a = store.list()[0]
    return a?.kind === 'message' ? a.message : undefined
  }
  return { store, hub, calls, card, setFail: (f: boolean) => (fail = f) }
}

test('withLine keeps the last four lines', () => {
  const lines = [1, 2, 3, 4].map((n) => ({ text: String(n), time: n }))
  expect(withLine(lines, { text: '5', time: 5 }).map((l) => l.text)).toEqual(['2', '3', '4', '5'])
})

test('WhatsApp messages from one chat accumulate in one card', () => {
  const { store, hub, card } = setup()
  hub.addWhatsApp(wa('hi'))
  hub.addWhatsApp(wa('you there?'))
  expect(store.list()).toHaveLength(1)
  expect(card()!.lines.map((l) => l.text)).toEqual(['hi', 'you there?'])
  expect(card()!.canReply).toBe(true)
})

test('group messages show the group name and each author', () => {
  const { hub, card } = setup()
  hub.addWhatsApp(wa('lunch?', { chatId: 'g@g.us', isGroup: true, chatName: 'Team' }))
  expect(card()!.sender).toBe('Team')
  expect(card()!.lines[0].author).toBe('Alice')
})

test('reply: sending → sent, appends own line, then dismisses', async () => {
  const { store, hub, calls, card } = setup()
  hub.addWhatsApp(wa('hi'))
  const p = hub.reply('whatsapp:123@c.us', 'hello!')
  expect(card()!.status?.kind).toBe('sending')
  await p
  expect(calls).toEqual(['reply 123@c.us hello!'])
  expect(card()!.status?.kind).toBe('sent')
  expect(card()!.lines.at(-1)).toMatchObject({ text: 'hello!', author: 'You' })
  vi.advanceTimersByTime(1500)
  expect(store.list()).toHaveLength(0)
})

test('failed reply keeps the card open with the error', async () => {
  const { store, hub, card, setFail } = setup()
  setFail(true)
  hub.addWhatsApp(wa('hi'))
  await hub.reply('whatsapp:123@c.us', 'hello!')
  expect(card()!.status).toEqual({ kind: 'error', text: 'offline' })
  vi.advanceTimersByTime(60000)
  expect(store.list()).toHaveLength(1) // held until the user acts
})

test('mark read dismisses and tells the backend', async () => {
  const { store, hub, calls } = setup()
  hub.addWhatsApp(wa('hi'))
  await hub.markRead('whatsapp:123@c.us')
  expect(store.list()).toHaveLength(0)
  expect(calls).toEqual(['read 123@c.us'])
})

test('mail cards carry subject and account; no backend means no reply', () => {
  const store = new ActivityStore()
  const hub = new MessageHub(new TransientCards(store))
  hub.addMail(
    {
      accountId: 'a',
      uid: 7,
      from: { name: 'Bob', address: 'b@x' },
      subject: 'Invoice',
      snippet: 'Attached',
      date: 1,
    },
    'Work',
  )
  const a = store.list()[0]
  expect(a.id).toBe('mail:a:7')
  expect(a.kind === 'message' && a.message).toMatchObject({
    sender: 'Bob',
    title: 'Invoice',
    account: 'Work',
    canReply: false,
  })
})

import { parseMailThread } from '../electron/mailManager'

test('parseMailThread splits on the last colon', () => {
  expect(parseMailThread('acc:with:colons:42')).toEqual({ accountId: 'acc:with:colons', uid: 42 })
  expect(parseMailThread('acc:0')).toBeNull()
  expect(parseMailThread('nouid')).toBeNull()
})
