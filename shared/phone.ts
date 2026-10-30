/**
 * The island on your phone (protocol version 1): what the Island Drop app
 * shows and answers, built from the island's own state. Approvals (Claude
 * Code's permissions, its questions and plans, the island assistant's asks,
 * trades from a connected engine) can be answered from either; whichever
 * answers first wins. Pure.
 *
 *   GET  /island/view                  a PhoneView
 *   GET  /island/events                server-sent events: view (a PhoneView),
 *                                      incoming (a file from the computer, PhoneIncoming)
 *   POST /island/decide  DecisionMsg   answer an approval that's on the phone
 *   POST /island/media   { cmd }       playpause, next, previous
 *   GET  /island/art                   what's playing's cover
 *   GET  /drop/out/<id>                an incoming file's bytes
 *   POST /drop/out/<id>/done           the phone has it
 *   POST /island/call    { fn, args }  one of the island's own functions
 *                                      (PHONE_CALLS): { ok, value } or { ok: false, message }
 *
 * The event stream also carries push ({ topic, data }): what the island's
 * window is told when Claude, trading, the inbox, notifications, music, the
 * CRM, documents or services change (PHONE_TOPICS).
 */
import type { Activity, ToolRequest } from './types'
import type { AgentSession } from './sessions'
import type { CenterView } from './notifCenter'
import { parseQuestions } from './questions'
import { describeTool } from './toolDetail'

export const PHONE_PROTOCOL = 1

export type PhoneLine = { label: string; value: string; tone?: 'up' | 'down' | 'neutral' | 'warn' }

export type PhoneApproval = {
  id: string
  kind: 'claude' | 'question' | 'plan' | 'agent' | 'trade'
  /** "Claude Code", "Trading", the app the assistant wants to use. */
  app: string
  color: string
  title: string
  /** The command, the file, the plan… */
  body: string
  /** The project folder it's in. */
  where?: string
  lines?: PhoneLine[]
  note?: string
  allow: string
  deny: string
  /** Claude offered a rule to stop asking ("always allow"). */
  canAlways?: boolean
  questions?: { question: string; header?: string; multiSelect: boolean; options: { label: string; description?: string }[] }[]
  /** A trade expires (epoch ms on the computer's clock) … */
  deadline?: number
  /** … in this many seconds from when the view was made (the phone counts down from this). */
  secondsLeft?: number
}

export type PhoneMedia = {
  title: string
  artist: string
  playing: boolean
  canControl: boolean
  /** A cover: an https URL, or /island/art when it's a file on the computer. */
  art?: string
  length?: number
  position?: number
  positionAt?: number
}

export type PhoneSession = { id: string; agent: string; project: string; phase: string; prompt?: string; step?: string; added: number; removed: number }

export type PhoneNote = { id: string; at: number; app: string; title: string; body?: string; source: string; urgency?: string }

export type PhoneTrading = { app: string; text: string; short: string; tone: string; detail: string; color: string }

export type PhoneView = {
  protocol: number
  at: number
  /** This computer's name. */
  name: string
  approvals: PhoneApproval[]
  media: PhoneMedia | null
  sessions: PhoneSession[]
  notes: PhoneNote[]
  trading: PhoneTrading | null
  dnd: boolean
}

/** A file the computer is sending to the phone. */
export type PhoneIncoming = { id: string; name: string; size: number; kind: string; thumb?: string; side: 'left' | 'right' | 'top' | 'bottom'; at: number }

const cap = (s: string | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : '')
const folder = (cwd?: string) => cwd?.split(/[\\/]/).filter(Boolean).pop()

/** An approval as the phone shows it, or null if it isn't one the phone can answer. */
export function phoneApproval(r: ToolRequest, now: number): PhoneApproval | null {
  if (r.connected) {
    const c = r.connected
    return {
      id: r.id,
      kind: 'trade',
      app: c.app,
      color: c.color,
      title: cap(c.title, 120),
      body: cap(c.subtitle, 300),
      lines: c.lines.slice(0, 8).map((l) => ({ label: cap(l.label, 40), value: cap(l.value, 60), tone: l.tone })),
      note: cap(c.note, 300) || undefined,
      allow: cap(c.approveLabel, 20) || 'Approve',
      deny: cap(c.rejectLabel, 20) || 'Reject',
      deadline: c.deadline,
      secondsLeft: Math.max(0, Math.round((c.deadline - now) / 1000)),
    }
  }
  if (r.ask) return { id: r.id, kind: 'agent', app: cap(r.ask.app, 40), color: '#0a84ff', title: cap(r.ask.title, 160), body: cap(r.ask.body, 2000), allow: 'Allow', deny: 'Don’t Allow' }
  const where = folder(r.cwd)
  if (r.toolName === 'AskUserQuestion' && !r.fromIsland) {
    const qs = parseQuestions(r.toolInput)
    if (qs)
      return {
        id: r.id,
        kind: 'question',
        app: 'Claude Code',
        color: '#d97757',
        title: cap(qs[0].question, 200),
        body: '',
        where,
        allow: 'Send',
        deny: 'In terminal',
        questions: qs.map((q) => ({ question: cap(q.question, 300), header: q.header, multiSelect: q.multiSelect, options: q.options.slice(0, 8).map((o) => ({ label: cap(o.label, 80), description: cap(o.description, 160) || undefined })) })),
      }
  }
  if (r.toolName === 'ExitPlanMode' && typeof r.toolInput?.plan === 'string')
    return { id: r.id, kind: 'plan', app: 'Claude Code', color: '#d97757', title: 'Ready to start on its plan', body: cap(r.toolInput.plan as string, 4000), where, allow: 'Start', deny: 'Keep planning' }
  const d = describeTool(r.toolName, r.toolInput ?? {})
  return {
    id: r.id,
    kind: 'claude',
    app: 'Claude Code',
    color: '#d97757',
    title: d.label,
    body: cap(d.body || r.inputSummary, 2000),
    where,
    allow: 'Allow',
    deny: 'Deny',
    canAlways: Array.isArray(r.suggestions) && r.suggestions.length > 0,
  }
}

/** A cover the phone can load: https as it is, a file on this computer through /island/art. */
export function phoneArt(artUrl: string | undefined): string | undefined {
  if (!artUrl) return undefined
  if (/^https:\/\//.test(artUrl)) return artUrl
  if (/^(file:\/\/|\/)/.test(artUrl)) return `/island/art?v=${encodeURIComponent(artUrl.slice(-40))}`
  return undefined
}

/** Everything the phone shows, from the island's activities and its notification center. */
export function phoneView(input: { name: string; activities: Activity[]; sessions: AgentSession[]; center: CenterView | null; now: number }): PhoneView {
  const { activities, now } = input
  const approvals: PhoneApproval[] = []
  const sessions: PhoneSession[] = []
  let media: PhoneMedia | null = null
  let trading: PhoneTrading | null = null
  for (const a of activities) {
    if (a.kind === 'approval') {
      const p = phoneApproval(a.request, now)
      if (p) approvals.push(p)
    } else if (a.kind === 'media' && !media) {
      const m = a.media
      media = { title: cap(m.title, 160), artist: cap(m.artist, 160), playing: m.playing, canControl: m.canControl, art: phoneArt(m.artUrl), length: m.length, position: m.position, positionAt: m.positionAt }
    } else if (a.kind === 'connected' && !trading) {
      const c = a.status
      trading = { app: c.app, text: c.text, short: c.short, tone: c.tone, detail: c.detail, color: c.color }
    }
  }
  // Every session in your terminals, the ones at work first.
  const rank = (p: string) => (p === 'waiting' ? 0 : p === 'working' ? 1 : 2)
  for (const s of [...input.sessions].sort((a, b) => rank(a.phase) - rank(b.phase))) {
    const last = s.steps[s.steps.length - 1]
    sessions.push({ id: s.id, agent: s.agent, project: cap(s.project, 60), phase: s.phase, prompt: cap(s.prompt, 200) || undefined, step: last ? cap(last.label, 160) : undefined, added: s.added, removed: s.removed })
  }
  const notes: PhoneNote[] = (input.center?.entries ?? []).slice(0, 40).map((e) => ({ id: e.id, at: e.at, app: cap(e.app, 60), title: cap(e.title, 200), body: cap(e.body, 600) || undefined, source: e.source, urgency: e.urgency }))
  return { protocol: PHONE_PROTOCOL, at: now, name: input.name, approvals, media, sessions: sessions.slice(0, 12), notes, trading, dnd: !!input.center?.dnd }
}

// ---- The island's functions on the phone ----

/** An argument: string, number, boolean, object, string list; `?` may be left out (or null). */
type Arg = 's' | 'n' | 'b' | 'o' | 'S' | 's?' | 'o?'

/**
 * What the phone may call: the same functions the island's window uses
 * (Claude, trading, notifications, chats, mail, notes, music, system
 * controls, CRM, documents, services), and the arguments each takes.
 */
export const PHONE_CALLS = {
  'claude.state': [],
  'claude.ask': ['s'],
  'claude.stop': [],
  'claude.new': [],
  'connected.view': [],
  'connected.action': ['s'],
  'notifications.view': [],
  'notifications.dismiss': ['s'],
  'notifications.clearAll': [],
  'notifications.undo': [],
  'notifications.setDnd': ['b'],
  'inbox.sources': [],
  'inbox.unread': [],
  'inbox.chats': [],
  'inbox.chat': ['s'],
  'inbox.sendChat': ['s', 's'],
  'inbox.mailList': ['s?'],
  'inbox.mailGet': ['s', 'n'],
  'inbox.mailReply': ['s', 'n', 's'],
  'inbox.mailRead': ['s', 'n'],
  'notes.list': [],
  'notes.get': ['s'],
  'notes.save': ['s?', 's'],
  'notes.remove': ['s'],
  'spotify.state': [],
  'spotify.home': [],
  'spotify.search': ['s'],
  'spotify.page': ['s'],
  'spotify.play': ['o', 's?'],
  'spotify.devices': [],
  'spotify.transfer': ['s'],
  'spotify.control': ['o'],
  'spotify.like': ['s', 'b'],
  'system.read': [],
  'system.cmd': ['o'],
  'crm.overview': [],
  'crm.contacts': ['s', 's?'],
  'crm.contact': ['s'],
  'crm.saveContact': ['s?', 'o'],
  'crm.log': ['o'],
  'crm.tasks': ['s'],
  'crm.saveTask': ['s?', 'o'],
  'crm.deals': [],
  'crm.deal': ['s'],
  'docs.view': [],
  'docs.action': ['o'],
  'docs.remove': ['S'],
  'docs.toPhone': ['s'],
  'services.view': [],
  'services.refresh': ['s'],
} as const satisfies Record<string, readonly Arg[]>

export type PhoneCall = keyof typeof PHONE_CALLS

/** What the phone hears about as it changes (push events). */
export const PHONE_TOPICS = ['claude', 'connected', 'inbox', 'notifications', 'spotify', 'crm', 'docs', 'services'] as const
export type PhoneTopic = (typeof PHONE_TOPICS)[number]

/** A call's reply. */
export type PhoneCallResult = { ok: true; value: unknown } | { ok: false; message: string }

const MAX_TEXT = 100_000
const MAX_OBJECT = 200_000
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A call's name and arguments as the island takes them, or null if they're not what it takes. Pure. */
export function phoneCallArgs(fn: unknown, args: unknown): { fn: PhoneCall; args: unknown[] } | null {
  if (typeof fn !== 'string' || !Object.prototype.hasOwnProperty.call(PHONE_CALLS, fn)) return null
  const spec: readonly Arg[] = PHONE_CALLS[fn as PhoneCall]
  const given = args === undefined ? [] : args
  if (!Array.isArray(given) || given.length > spec.length) return null
  const out: unknown[] = []
  for (let i = 0; i < spec.length; i++) {
    const kind = spec[i]
    const v = given[i]
    if (kind.endsWith('?') && (v === undefined || v === null)) {
      out.push(v ?? undefined)
      continue
    }
    const k = kind.replace('?', '')
    if (k === 's' && !(typeof v === 'string' && v.length <= MAX_TEXT)) return null
    if (k === 'n' && !(typeof v === 'number' && Number.isFinite(v))) return null
    if (k === 'b' && typeof v !== 'boolean') return null
    if (k === 'o' && !(plain(v) && JSON.stringify(v).length <= MAX_OBJECT)) return null
    if (k === 'S' && !(Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === 'string' && x.length <= 400))) return null
    out.push(v)
  }
  // Trailing arguments left out are passed as left out.
  while (out.length && out[out.length - 1] === undefined) out.pop()
  return { fn: fn as PhoneCall, args: out }
}
