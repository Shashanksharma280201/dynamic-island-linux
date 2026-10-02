import { PACKAGES, enabledPackages, enabledTabs, parsePackages } from '../shared/packages'
import { packageTools, type PackageContext } from '../electron/packages/tools'
import { runTool } from '../electron/agent/tools'

function ctx(over: Partial<PackageContext> = {}) {
  const sent: string[] = []
  const commands: unknown[] = []
  const replies: string[] = []
  let playing = true
  const c: PackageContext = {
    notes: { list: async () => [], get: async () => ({}) as any, save: async () => 'n1' },
    whatsapp: {
      ready: () => true,
      listChats: async () => [
        { id: 'a@c.us', name: 'Alice', isGroup: false, unread: 2, time: 1, last: 'lunch?', lastFromMe: false },
        { id: 'g@g.us', name: 'Weekend Trip', isGroup: true, unread: 0, time: 0, last: 'ok', lastFromMe: true },
      ],
      getMessages: async () => [{ fromMe: false, text: 'lunch?', time: 1 }, { fromMe: true, text: '', time: 2, media: { kind: 'image' } }],
      send: async (id, text) => void sent.push(`${id}:${text}`),
    },
    mail: {
      accounts: () => [{ id: 'work', label: 'Work' }],
      listRecent: async () => [{ accountId: 'work', uid: 7, from: { name: 'Boss', address: 'b@x.com' }, subject: 'Q3', snippet: 'numbers', date: 1, unread: true }],
      getMessage: async () => ({ from: { name: 'Boss', address: 'b@x.com' }, subject: 'Q3', text: 'Send numbers', date: 1 }),
      reply: async (t, text) => void replies.push(`${t}:${text}`),
    },
    media: {
      now: () => ({ title: 'Song', artist: 'Band', playing, canControl: true }),
      command: async (cmd) => {
        commands.push(cmd)
        if (cmd === 'playpause') playing = !playing
      },
    },
    spotify: {
      view: () => ({ status: 'ready' }),
      search: async () => ({ tracks: [{ uri: 'spotify:track:1', name: 'Tidal', artists: 'Blue Hour', durationMs: 1 }], albums: [], playlists: [], artists: [] }) as any,
      play: async () => ({ ok: true }),
    },
    ...over,
  }
  return { c, sent, commands, replies }
}

const names = (t: { name: string }[]) => t.map((x) => x.name)

test('the catalog and which packages are on', () => {
  expect(PACKAGES.map((p) => p.id)).toEqual(['basics', 'notes', 'chats', 'mail', 'music'])
  expect(parsePackages({ disabled: ['mail', 'basics', 'nope', 'mail'] })).toEqual({ disabled: ['mail'] }) // basics can't be off
  expect(enabledPackages({ disabled: ['mail'] })).toEqual(['basics', 'notes', 'chats', 'music'])
  expect(enabledTabs({ disabled: ['chats'] })).toEqual(['notes', 'mail', 'music'])
  // The catalog lists exactly the tools each package brings.
  const all = packageTools({ disabled: [] }, ctx().c)
  expect(names(all)).toEqual(PACKAGES.flatMap((p) => p.tools.map((t) => t.name)))
  for (const t of all) expect(!!t.asks).toBe(!!PACKAGES.flatMap((p) => p.tools).find((x) => x.name === t.name)!.asks)
})

test('turning a package off takes its tools away', () => {
  const t = names(packageTools({ disabled: ['chats', 'music'] }, ctx().c))
  expect(t).toContain('mail_list')
  expect(t).not.toContain('chats_send')
  expect(t).not.toContain('spotify_play')
})

test('WhatsApp: list, read by name, and send only when allowed', async () => {
  const { c, sent } = ctx()
  const tools = packageTools({ disabled: [] }, c)
  expect((await runTool(tools, 'chats_list', { unread_only: true })).output).toMatch(/^Alice · id a@c.us · 2 unread/)
  const read = await runTool(tools, 'chats_read', { chat: 'alice' })
  expect(read.output).toContain('Alice: lunch?')
  expect(read.output).toContain('You: (image)')
  const no = await runTool(tools, 'chats_send', { chat: 'Alice', text: 'late!' }, async () => false)
  expect(no.ok).toBe(false)
  expect(sent).toEqual([])
  // Without anyone to ask, it never sends.
  expect((await runTool(tools, 'chats_send', { chat: 'Alice', text: 'late!' })).ok).toBe(false)
  let asked: any
  const yes = await runTool(tools, 'chats_send', { chat: 'weekend', text: 'see you' }, async (t, i) => ((asked = await t.asks!(i)), true))
  expect(yes).toEqual({ ok: true, output: 'Sent to Weekend Trip.' })
  expect(asked).toEqual({ title: 'Send to Weekend Trip on WhatsApp', body: 'see you' })
  expect(sent).toEqual(['g@g.us:see you'])
  expect((await runTool(tools, 'chats_read', { chat: 'Bob' })).output).toMatch(/No chat called “Bob”/)
  const off = ctx({ whatsapp: { ...c.whatsapp, ready: () => false } })
  expect((await runTool(packageTools({ disabled: [] }, off.c), 'chats_list', {})).output).toMatch(/isn’t connected/)
})

test('Mail: list, read and reply (asks first)', async () => {
  const { c, replies } = ctx()
  const tools = packageTools({ disabled: [] }, c)
  expect((await runTool(tools, 'mail_list', {})).output).toMatch(/^id work:7 · unread/)
  expect((await runTool(tools, 'mail_read', { id: 'work:7' })).output).toContain('Send numbers')
  expect((await runTool(tools, 'mail_read', { id: 'nonsense' })).output).toMatch(/Use an email id/)
  let asked: any
  await runTool(tools, 'mail_reply', { id: 'work:7', text: 'Attached.' }, async (t, i) => ((asked = await t.asks!(i)), true))
  expect(asked.title).toBe('Reply to Boss: “Q3”')
  expect(replies).toEqual(['work:7:Attached.'])
})

test('Music: what’s playing, play / pause without toggling the wrong way, Spotify', async () => {
  const { c, commands } = ctx()
  const tools = packageTools({ disabled: [] }, c)
  expect((await runTool(tools, 'music_now_playing', {})).output).toBe('Playing: “Song” by Band')
  await runTool(tools, 'music_control', { action: 'play' }) // already playing: nothing to do
  expect(commands).toEqual([])
  await runTool(tools, 'music_control', { action: 'pause' })
  await runTool(tools, 'music_control', { action: 'next' })
  expect(commands).toEqual(['playpause', 'next'])
  expect((await runTool(tools, 'spotify_play', { query: 'tidal' })).output).toBe('Playing “Tidal” by Blue Hour.')
  const noDevice = ctx({ spotify: { ...c.spotify, play: async () => ({ needsDevice: true }) } })
  expect((await runTool(packageTools({ disabled: [] }, noDevice.c), 'spotify_play', { query: 'x' })).output).toMatch(/isn’t open on any device/)
})
