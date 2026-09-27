import { vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: class {} }))
import { readChatsFromStore, readMessagesFromStore, readChatInfoFromStore } from '../electron/providers/whatsappStore'
import { chatsFromRaw, messagesFromRaw, phoneOf } from '../electron/providers/whatsapp'

// A stand-in for WhatsApp Web's in-memory collections, as exposed via window.require.
const coll = (models: any[]) => ({
  getModelsArray: () => models,
  get: (id: string) => models.find((m) => m.id._serialized === id),
})
const msg = (id: string, body: string, t: number, fromMe = false, extra = {}) => ({
  id: { _serialized: id, fromMe },
  type: 'chat',
  body,
  t,
  ...extra,
})
const earlier = [msg('g0', 'older one', 90)]
const group = {
  id: { _serialized: 'g1@g.us', server: 'g.us' },
  formattedTitle: 'Weekend Trip',
  isGroup: true,
  unreadCount: 2,
  t: 200,
  msgs: (() => {
    const list = [msg('g1', 'Booked the cabin', 150, false, { notifyName: 'Sam' }), msg('g2', 'Leaving at 8', 200, false, { notifyName: 'Sam' })]
    return { getModelsArray: () => list, list }
  })(),
}
const direct = {
  id: { _serialized: '1@c.us', server: 'c.us' },
  formattedTitle: 'Alice',
  unreadCount: 0,
  t: 300,
  msgs: coll([msg('a1', 'hi', 300, true)]),
}
// A chat whose fields throw (the kind that breaks getChats()).
const broken = {
  id: { _serialized: 'x@c.us' },
  get formattedTitle() {
    throw new Error('r')
  },
}
// Group senders as WhatsApp now sends them: opaque "@lid" ids.
const lid = (id: string) => ({ _serialized: id })
const lids = {
  id: { _serialized: 'g2@g.us', server: 'g.us' },
  formattedTitle: 'no trip',
  isGroup: true,
  t: 100,
  msgs: coll([
    msg('l1', 'saved contact', 10, false, { author: lid('111@lid') }),
    msg('l2', 'profile name only', 11, false, { author: lid('222@lid') }),
    msg('l3', 'nobody we know', 12, false, { author: lid('213784077011444@lid') }),
    msg('l4', 'phone id', 13, false, { author: lid('919876543210@c.us') }),
  ]),
}
const contacts = [
  { id: { _serialized: '111@lid' }, name: 'Priya Shah', pushname: 'Priya' },
  { id: { _serialized: '222@lid' }, pushname: 'Rahul' },
]
const channel = { id: { _serialized: '123@newsletter' }, formattedTitle: 'News', t: 999, msgs: coll([]) }
const archived = { id: { _serialized: '2@c.us' }, formattedTitle: 'Old', archive: true, t: 50, msgs: coll([]) }

beforeEach(() => {
  ;(globalThis as any).window = {
    require: (name: string) => {
      if (name === 'WAWebCollections')
        return { Chat: coll([group, broken, direct, channel, archived, lids]), Contact: coll(contacts) }
      if (name === 'WAWebChatLoadMessages')
        return {
          loadEarlierMsgs: async ({ chat }: any) => {
            if (chat !== group || !earlier.length) return []
            const e = earlier.splice(0)
            chat.msgs.list.unshift(...e)
            return e
          },
        }
      throw new Error('unknown module ' + name)
    },
  }
})
afterEach(() => delete (globalThis as any).window)

test('reads chats directly, newest first, skipping unreadable chats and channels', () => {
  const raw = readChatsFromStore(10)
  expect(raw.map((c) => c.name)).toEqual(['Alice', 'Weekend Trip', 'no trip', 'Old'])
  const chats = chatsFromRaw(raw, 10)
  expect(chats.map((c) => c.name)).toEqual(['Alice', 'Weekend Trip', 'no trip']) // archived dropped
  expect(chats[1]).toMatchObject({ isGroup: true, unread: 2, last: 'Sam: Leaving at 8', time: 200_000 })
  expect(chats[0]).toMatchObject({ last: 'hi', lastFromMe: true })
})

test('reads messages, loading earlier ones when few are in memory', async () => {
  const raw = await readMessagesFromStore('g1@g.us', 10)
  expect(raw.map((m) => m.body)).toEqual(['older one', 'Booked the cabin', 'Leaving at 8'])
  const msgs = messagesFromRaw(raw, true)
  expect(msgs[1]).toMatchObject({ author: 'Sam', text: 'Booked the cabin', fromMe: false })
  await expect(readMessagesFromStore('nope@c.us', 5)).rejects.toThrow(/not found/)
})

test('chat info for incoming-message cards', () => {
  expect(readChatInfoFromStore('g1@g.us')).toEqual({ name: 'Weekend Trip', isGroup: true })
  expect(readChatInfoFromStore('missing@c.us')).toBeNull()
})

test('group senders are shown by name, never as raw ids', async () => {
  const msgs = messagesFromRaw(await readMessagesFromStore('g2@g.us', 10), true)
  expect(msgs.map((m) => m.author)).toEqual(['Priya Shah', 'Rahul', undefined, '+919876543210'])
  expect(phoneOf('919876543210@c.us')).toBe('+919876543210')
  expect(phoneOf('213784077011444@lid')).toBeUndefined()
})
