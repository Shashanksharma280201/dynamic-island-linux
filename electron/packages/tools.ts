import type { ChatSummary, MediaCmd, MediaState } from '@shared/types'
import { enabledPackages, type PackageId, type PackagesConfig } from '@shared/packages'
import type { SpotifyView, SpSearch, PlayResult } from '@shared/spotify'
import { schema, str, type AgentTool } from '../agent/tools'
import type { NotesStore } from '../notes'
import { docsTools, type DocsContext } from './docsTools'

/** What the built-in packages reach. Small interfaces, so tests can fake them. */
export type PackageContext = {
  notes: Pick<NotesStore, 'list' | 'get' | 'save'>
  whatsapp: {
    ready: () => boolean
    listChats: (limit: number) => Promise<ChatSummary[]>
    getMessages: (chatId: string, limit: number) => Promise<Array<{ fromMe: boolean; author?: string; text: string; time: number; media?: { kind: string } }>>
    send: (chatId: string, text: string) => Promise<void>
  }
  mail: {
    accounts: () => { id: string; label: string }[]
    listRecent: (accountId?: string, limit?: number) => Promise<Array<{ accountId: string; uid: number; from: { name: string; address: string }; subject: string; snippet: string; date: number; unread: boolean }>>
    getMessage: (accountId: string, uid: number) => Promise<{ from: { name: string; address: string }; subject: string; text: string; date: number }>
    reply: (threadId: string, text: string) => Promise<void>
  }
  media: { now: () => MediaState | null; command: (c: MediaCmd) => Promise<void> }
  spotify: {
    view: () => Pick<SpotifyView, 'status'>
    search: (q: string) => Promise<SpSearch>
    play: (o: { contextUri?: string; trackUri?: string }) => Promise<PlayResult>
  }
  docs: DocsContext
  now?: () => Date
}

const when = (ms: number) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')

// ------------------------------------------------------------------ basics ----

function basics(ctx: PackageContext): AgentTool[] {
  const now = ctx.now ?? (() => new Date())
  return [
    {
      name: 'current_time',
      description: 'The current local date, time and time zone on the user’s computer.',
      input_schema: schema({}),
      label: () => 'Checking the time',
      run: async () => {
        const t = now()
        return `${t.toString()} (ISO ${t.toISOString()}, time zone ${Intl.DateTimeFormat().resolvedOptions().timeZone})`
      },
    },
  ]
}

// ------------------------------------------------------------------- notes ----

function notes(ctx: PackageContext): AgentTool[] {
  return [
    {
      name: 'notes_search',
      description:
        'Search the user’s notes (kept on this computer). Returns matching notes, newest first, with their id, title and a preview. An empty query lists the latest notes.',
      input_schema: schema({ query: { type: 'string', description: 'Words to look for; empty for the latest notes.' } }),
      label: (i) => (str(i.query) ? `Searching your notes for “${str(i.query)}”` : 'Looking through your notes'),
      run: async (i) => {
        const q = str(i.query).trim().toLowerCase()
        const all = await ctx.notes.list()
        const hits = (q ? all.filter((n) => `${n.title}\n${n.preview}`.toLowerCase().includes(q)) : all).slice(0, 15)
        if (!hits.length) return q ? `No notes match “${q}”.` : 'There are no notes yet.'
        return hits.map((n) => `id: ${n.id}\ntitle: ${n.title}\nupdated: ${new Date(n.updated).toISOString()}\npreview: ${n.preview}`).join('\n\n')
      },
    },
    {
      name: 'notes_read',
      description: 'Read the full text of one note by its id (from notes_search).',
      input_schema: schema({ id: { type: 'string', description: 'The note id.' } }, ['id']),
      label: () => 'Reading a note',
      run: async (i) => (await ctx.notes.get(str(i.id))).body,
    },
    {
      name: 'notes_create',
      description: 'Save a new note for the user. The first line becomes its title. Use it when they ask you to note, remember or write something down.',
      input_schema: schema({ text: { type: 'string', description: 'The note: first line is the title.' } }, ['text']),
      label: () => 'Writing a note',
      run: async (i) => {
        const text = str(i.text).trim()
        if (!text) throw new Error('The note is empty.')
        const id = await ctx.notes.save(undefined, text.slice(0, 20000))
        return `Saved the note (id ${id}).`
      },
    },
  ]
}

// ---------------------------------------------------------------- WhatsApp ----

function chats(ctx: PackageContext): AgentTool[] {
  const wa = ctx.whatsapp
  const need = () => {
    if (!wa.ready()) throw new Error('WhatsApp isn’t connected. The user can link it in Settings → WhatsApp.')
  }
  /** A chat by id, or by (part of) its name. */
  const find = async (q: string): Promise<ChatSummary> => {
    need()
    const all = await wa.listChats(80)
    const lower = q.trim().toLowerCase()
    const hit =
      all.find((c) => c.id === q) ??
      all.find((c) => c.name.toLowerCase() === lower) ??
      all.find((c) => c.name.toLowerCase().includes(lower))
    if (!hit) throw new Error(`No chat called “${q}” among the recent chats.`)
    return hit
  }
  const chatParam = { type: 'string' as const, description: 'The chat’s name (or id from chats_list).' }
  return [
    {
      name: 'chats_list',
      description: 'List the user’s recent WhatsApp chats, newest first, with unread counts and the last message.',
      input_schema: schema({ unread_only: { type: 'boolean', description: 'Only chats with unread messages.' } }),
      label: () => 'Checking your chats',
      run: async (i) => {
        need()
        let list = await wa.listChats(25)
        if (i.unread_only === true) list = list.filter((c) => c.unread > 0)
        if (!list.length) return i.unread_only === true ? 'No unread chats.' : 'No chats.'
        return list
          .map((c) => `${c.name}${c.isGroup ? ' (group)' : ''} · id ${c.id}${c.unread ? ` · ${c.unread} unread` : ''} · ${when(c.time)}\n  last: ${c.lastFromMe ? 'You: ' : ''}${c.last}`)
          .join('\n')
      },
    },
    {
      name: 'chats_read',
      description: 'Read the latest messages of one WhatsApp chat. Opening a chat marks it as read, like on the phone.',
      input_schema: schema({ chat: chatParam }, ['chat']),
      label: (i) => `Reading your chat with ${str(i.chat)}`,
      run: async (i) => {
        const c = await find(str(i.chat))
        const msgs = await wa.getMessages(c.id, 25)
        if (!msgs.length) return `No messages with ${c.name} yet.`
        return [
          `Chat: ${c.name}${c.isGroup ? ' (group)' : ''}`,
          ...msgs.map((m) => `[${when(m.time)}] ${m.fromMe ? 'You' : m.author || c.name}: ${m.media ? `(${m.media.kind}) ` : ''}${m.text}`),
        ].join('\n')
      },
    },
    {
      name: 'chats_send',
      description: 'Send a WhatsApp message in one chat. The user is asked to allow it first.',
      input_schema: schema({ chat: chatParam, text: { type: 'string', description: 'The message to send.' } }, ['chat', 'text']),
      label: (i) => `Sending a message to ${str(i.chat)}`,
      asks: async (i) => {
        const c = await find(str(i.chat))
        return { title: `Send to ${c.name} on WhatsApp`, body: str(i.text) }
      },
      run: async (i) => {
        const c = await find(str(i.chat))
        const text = str(i.text).trim()
        if (!text) throw new Error('The message is empty.')
        await wa.send(c.id, text.slice(0, 4000))
        return `Sent to ${c.name}.`
      },
    },
  ]
}

// -------------------------------------------------------------------- mail ----

function mail(ctx: PackageContext): AgentTool[] {
  const m = ctx.mail
  const need = () => {
    if (!m.accounts().length) throw new Error('No mail account is set up. The user can add one in Settings → Mail.')
  }
  const parseId = (id: string) => {
    const i = id.lastIndexOf(':')
    const uid = Number(id.slice(i + 1))
    if (i <= 0 || !Number.isInteger(uid) || uid <= 0) throw new Error('Use an email id from mail_list, like "work:1234".')
    return { accountId: id.slice(0, i), uid }
  }
  return [
    {
      name: 'mail_list',
      description: 'List the user’s recent emails (all inboxes), newest first.',
      input_schema: schema({ unread_only: { type: 'boolean', description: 'Only unread emails.' } }),
      label: () => 'Checking your mail',
      run: async (i) => {
        need()
        let list = await m.listRecent(undefined, 25)
        if (i.unread_only === true) list = list.filter((x) => x.unread)
        if (!list.length) return i.unread_only === true ? 'No unread mail.' : 'The inbox is empty.'
        return list
          .map((x) => `id ${x.accountId}:${x.uid}${x.unread ? ' · unread' : ''} · ${when(x.date)} · from ${x.from.name || x.from.address} <${x.from.address}>\n  subject: ${x.subject}\n  ${x.snippet}`)
          .join('\n')
      },
    },
    {
      name: 'mail_read',
      description: 'Read one email in full, by its id from mail_list.',
      input_schema: schema({ id: { type: 'string', description: 'The email id, like "work:1234".' } }, ['id']),
      label: () => 'Reading an email',
      run: async (i) => {
        need()
        const { accountId, uid } = parseId(str(i.id))
        const x = await m.getMessage(accountId, uid)
        return `From: ${x.from.name} <${x.from.address}>\nSubject: ${x.subject}\nDate: ${when(x.date)}\n\n${x.text.slice(0, 20000)}`
      },
    },
    {
      name: 'mail_reply',
      description: 'Reply to an email (to its sender, in the same thread). The user is asked to allow it first.',
      input_schema: schema({ id: { type: 'string', description: 'The email id from mail_list.' }, text: { type: 'string', description: 'The reply.' } }, ['id', 'text']),
      label: () => 'Replying to an email',
      asks: async (i) => {
        need()
        const { accountId, uid } = parseId(str(i.id))
        const x = await m.getMessage(accountId, uid)
        return { title: `Reply to ${x.from.name || x.from.address}: “${x.subject}”`, body: str(i.text) }
      },
      run: async (i) => {
        need()
        const { accountId, uid } = parseId(str(i.id))
        const text = str(i.text).trim()
        if (!text) throw new Error('The reply is empty.')
        await m.reply(`${accountId}:${uid}`, text.slice(0, 20000))
        return 'Reply sent.'
      },
    },
  ]
}

// ------------------------------------------------------------------- music ----

function music(ctx: PackageContext): AgentTool[] {
  return [
    {
      name: 'music_now_playing',
      description: 'What is playing on this computer right now (any media player).',
      input_schema: schema({}),
      label: () => 'Checking what’s playing',
      run: async () => {
        const s = ctx.media.now()
        return s ? `${s.playing ? 'Playing' : 'Paused'}: “${s.title}” by ${s.artist || 'unknown artist'}` : 'Nothing is playing.'
      },
    },
    {
      name: 'music_control',
      description: 'Control the media player that’s playing: play, pause, next or previous.',
      input_schema: schema({ action: { type: 'string', description: 'One of: play, pause, next, previous.' } }, ['action']),
      label: (i) => ({ play: 'Playing', pause: 'Pausing', next: 'Skipping to the next song', previous: 'Going back a song' })[str(i.action)] ?? 'Controlling the music',
      run: async (i) => {
        const s = ctx.media.now()
        if (!s) throw new Error('Nothing is playing, and no player is open.')
        const a = str(i.action)
        if (a === 'play' || a === 'pause') {
          if (s.playing !== (a === 'play')) await ctx.media.command('playpause')
          return a === 'play' ? 'Playing.' : 'Paused.'
        }
        if (a === 'next' || a === 'previous') {
          await ctx.media.command(a)
          return a === 'next' ? 'Skipped to the next song.' : 'Went back a song.'
        }
        throw new Error('The action must be play, pause, next or previous.')
      },
    },
    {
      name: 'spotify_play',
      description: 'Search Spotify and play the best match: a song (default), an album, a playlist or an artist.',
      input_schema: schema(
        {
          query: { type: 'string', description: 'What to search for, e.g. "Bohemian Rhapsody" or "lofi beats".' },
          kind: { type: 'string', description: 'song, album, playlist or artist. Default: song.' },
        },
        ['query'],
      ),
      label: (i) => `Finding “${str(i.query)}” on Spotify`,
      run: async (i) => {
        if (ctx.spotify.view().status !== 'ready') throw new Error('Spotify isn’t connected. The user can connect it in Settings → Spotify.')
        const r = await ctx.spotify.search(str(i.query))
        const kind = str(i.kind) || 'song'
        const pick =
          kind === 'album'
            ? r.albums[0] && { contextUri: r.albums[0].uri, what: `the album “${r.albums[0].name}”` }
            : kind === 'playlist'
              ? r.playlists[0] && { contextUri: r.playlists[0].uri, what: `the playlist “${r.playlists[0].name}”` }
              : kind === 'artist'
                ? r.artists[0] && { contextUri: r.artists[0].uri, what: `${r.artists[0].name}` }
                : r.tracks[0] && { trackUri: r.tracks[0].uri, what: `“${r.tracks[0].name}” by ${r.tracks[0].artists}` }
        if (!pick) return `Nothing on Spotify matches “${str(i.query)}”.`
        const { what, ...o } = pick
        const res = await ctx.spotify.play(o)
        if ('needsDevice' in res) return `Found ${what}, but Spotify isn’t open on any device. Ask the user to open Spotify (or use the Music tab’s “Connect to a device”).`
        return `Playing ${what}.`
      },
    },
  ]
}

const BUILDERS: Record<PackageId, (ctx: PackageContext) => AgentTool[]> = { basics, notes, chats, mail, music, docs: (ctx) => docsTools(ctx.docs) }

/** The agent's tools: those of the packages that are turned on. */
export function packageTools(c: PackagesConfig, ctx: PackageContext): AgentTool[] {
  return enabledPackages(c).flatMap((id) => BUILDERS[id](ctx))
}
