/**
 * Connected packages: a service on your computer (or reachable over your
 * private network) that the island shows and answers for, without the island
 * knowing anything about what it does. The first one is the Day-Trading
 * engine: its P&L on the capsule, its trade approvals as cards, its panel in
 * the rail. Everything shown comes from the service (protocol version 1, see
 * Day-Trading's docs/island-protocol.md), so the service can change what you
 * see without a new island release.
 *
 * The service's answers are untrusted input: every field is checked, cut to
 * size and dropped if it's the wrong shape. Pure.
 */
import type { ToolRequest } from './types'

export const CONNECTED_PROTOCOL = 1
/** Activity id of the status capsule. */
export const STATUS_ID = 'connected-status'
/** Approval card ids: this prefix plus the service's ask id. */
export const ASK_PREFIX = 'connected-ask-'
/** Reconnect when the stream says nothing (not even a keepalive) for this long. */
export const SILENCE_MS = 40_000

export type Tone = 'up' | 'down' | 'neutral' | 'warn'
const TONES: Tone[] = ['up', 'down', 'neutral', 'warn']

export type ConnectedManifest = {
  protocol: number
  id: string
  name: string
  color: string
  description: string
  permissions: string[]
  tabTitle: string
  phoneUrl?: string
  pairingLink?: string
}

export type ConnectedLine = { label: string; value: string; tone?: Tone }

export type ConnectedAsk = {
  id: string
  title: string
  subtitle: string
  lines: ConnectedLine[]
  note: string
  approveLabel: string
  rejectLabel: string
  secondsLeft: number
  tone: Tone
}

export type ConnectedStatus = { text: string; short: string; tone: Tone; detail: string; show: boolean }

export type ConnectedSection =
  | { type: 'stats'; title?: string; items: ConnectedLine[] }
  | { type: 'list'; title: string; empty?: string; rows: { title: string; subtitle?: string; value?: string; tone?: Tone }[] }
  | { type: 'actions'; actions: { id: string; label: string; style: 'danger' | 'default'; confirm?: string }[] }
  | { type: 'note'; text: string; tone?: Tone }

export type ConnectedView = {
  updatedAt: number
  status: ConnectedStatus
  asks: ConnectedAsk[]
  sections: ConnectedSection[]
}

export type ConnectedNotify = { title: string; body: string; urgency: 'low' | 'normal' | 'critical' }

/** What the island and Settings know about the connection. */
export type ConnectedState = {
  configured: boolean
  on: boolean
  phase: 'off' | 'connecting' | 'live' | 'error'
  error?: string
  manifest?: ConnectedManifest
  view?: ConnectedView
  /** When the last view arrived (epoch ms). */
  seenAt?: number
}

/** The capsule's activity payload. */
export type ConnectedCapsule = ConnectedStatus & { app: string; color: string }

/** What a connected approval card shows (carried on the approval's request). */
export type ConnectedCard = Omit<ConnectedAsk, 'secondsLeft'> & { app: string; color: string; deadline: number }

/** Saved settings (the token stays encrypted). */
export type ConnectedConfig = { on: boolean; url: string; secret: string }

// ---------------------------------------------------------------- checks ----

const text = (v: unknown, max = 200): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max) : '')
const tone = (v: unknown): Tone | undefined => (TONES.includes(v as Tone) ? (v as Tone) : undefined)
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : [])
const color = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#30d158')

/** An http(s) address with a host, no trailing slash; '' if not one. Pure. */
export function cleanUrl(raw: unknown): string {
  const s = text(raw, 300).trim().replace(/\/+$/, '')
  try {
    const u = new URL(s)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname || u.username || u.password) return ''
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return ''
  }
}

export function parseConnectedConfig(raw: any): ConnectedConfig {
  return { on: raw?.on === true, url: cleanUrl(raw?.url), secret: typeof raw?.secret === 'string' ? raw.secret : '' }
}

export function parseManifest(raw: any): ConnectedManifest | null {
  if (!raw || typeof raw !== 'object' || raw.protocol !== CONNECTED_PROTOCOL) return null
  const id = text(raw.id, 40)
  const name = text(raw.name, 40)
  if (!/^[a-z0-9-]+$/.test(id) || !name) return null
  const link = text(raw.pairing_link, 600)
  return {
    protocol: raw.protocol,
    id,
    name,
    color: color(raw.color),
    description: text(raw.description, 400),
    permissions: list(raw.permissions, 8).map((p) => text(p, 120)).filter(Boolean),
    tabTitle: text(raw.tab_title, 30) || name,
    ...(cleanUrl(raw.phone_url) ? { phoneUrl: cleanUrl(raw.phone_url) } : {}),
    ...(link.startsWith('daytrader://pair?') ? { pairingLink: link } : {}),
  }
}

const line = (v: any): ConnectedLine | null => {
  const label = text(v?.label, 60)
  const value = text(v?.value, 80)
  if (!label && !value) return null
  const t = tone(v?.tone)
  return { label, value, ...(t ? { tone: t } : {}) }
}

function parseAsk(v: any): ConnectedAsk | null {
  const id = text(v?.id, 40)
  const title = text(v?.title, 80)
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !title) return null
  const secs = Number(v?.seconds_left)
  return {
    id,
    title,
    subtitle: text(v?.subtitle, 120),
    lines: list(v?.lines, 8).map(line).filter((l): l is ConnectedLine => !!l),
    note: text(v?.note, 240),
    approveLabel: text(v?.approve_label, 20) || 'Approve',
    rejectLabel: text(v?.reject_label, 20) || 'Reject',
    secondsLeft: Number.isFinite(secs) ? Math.max(0, Math.min(3600, Math.floor(secs))) : 0,
    tone: tone(v?.tone) ?? 'neutral',
  }
}

function parseSection(v: any): ConnectedSection | null {
  switch (v?.type) {
    case 'stats': {
      const items = list(v.items, 12).map(line).filter((l): l is ConnectedLine => !!l)
      return items.length ? { type: 'stats', ...(text(v.title, 60) ? { title: text(v.title, 60) } : {}), items } : null
    }
    case 'list':
      return {
        type: 'list',
        title: text(v.title, 60),
        ...(text(v.empty, 80) ? { empty: text(v.empty, 80) } : {}),
        rows: list(v.rows, 50)
          .map((r: any) => {
            const title = text(r?.title, 100)
            if (!title) return null
            const t = tone(r?.tone)
            return { title, subtitle: text(r?.subtitle, 200), value: text(r?.value, 40), ...(t ? { tone: t } : {}) }
          })
          .filter((r): r is NonNullable<typeof r> => !!r),
      }
    case 'actions': {
      const actions = list(v.actions, 4)
        .map((a: any) => {
          const id = text(a?.id, 40)
          const label = text(a?.label, 40)
          if (!/^[a-z0-9_-]+$/.test(id) || !label) return null
          const confirm = text(a?.confirm, 200)
          return { id, label, style: a?.style === 'danger' ? ('danger' as const) : ('default' as const), ...(confirm ? { confirm } : {}) }
        })
        .filter((a): a is NonNullable<typeof a> => !!a)
      return actions.length ? { type: 'actions', actions } : null
    }
    case 'note': {
      const t = text(v.text, 300)
      const tn = tone(v.tone)
      return t ? { type: 'note', text: t, ...(tn ? { tone: tn } : {}) } : null
    }
    default:
      return null
  }
}

export function parseView(raw: any): ConnectedView | null {
  if (!raw || typeof raw !== 'object' || raw.protocol !== CONNECTED_PROTOCOL) return null
  const s = raw.status ?? {}
  const status: ConnectedStatus = {
    text: text(s.text, 40),
    short: text(s.short, 12) || text(s.text, 12),
    tone: tone(s.tone) ?? 'neutral',
    detail: text(s.detail, 120),
    show: s.show === true && !!text(s.text, 40),
  }
  const seen = new Set<string>()
  const asks = list(raw.asks, 10)
    .map(parseAsk)
    .filter((a): a is ConnectedAsk => !!a && !seen.has(a.id) && !!seen.add(a.id))
  return {
    updatedAt: Number.isFinite(raw.updated_at) ? Number(raw.updated_at) : 0,
    status,
    asks,
    sections: list(raw.sections, 20).map(parseSection).filter((x): x is ConnectedSection => !!x),
  }
}

export function parseNotify(raw: any): ConnectedNotify | null {
  const title = text(raw?.title, 100)
  if (!title) return null
  const u = raw?.urgency
  return { title, body: text(raw?.body, 240), urgency: u === 'low' || u === 'critical' ? u : 'normal' }
}

// ------------------------------------------------------------ the stream ----

/**
 * Server-Sent Events, chunk by chunk: returns the complete events in each
 * chunk and keeps the rest for the next one. Comment lines (": keepalive")
 * are ignored. A runaway line without a newline is dropped. Pure.
 */
export function createSseParser(maxBuffer = 1024 * 1024): (chunk: string) => { event: string; data: string }[] {
  let buf = ''
  let event = ''
  let data: string[] = []
  return (chunk) => {
    buf += chunk
    const out: { event: string; data: string }[] = []
    let i: number
    while ((i = buf.search(/\r?\n/)) >= 0) {
      const raw = buf.slice(0, i)
      buf = buf.slice(i + (buf[i] === '\r' ? 2 : 1))
      if (raw === '') {
        if (data.length) out.push({ event: event || 'message', data: data.join('\n') })
        event = ''
        data = []
        continue
      }
      if (raw.startsWith(':')) continue
      const c = raw.indexOf(':')
      const field = c < 0 ? raw : raw.slice(0, c)
      const value = c < 0 ? '' : raw.slice(c + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (buf.length > maxBuffer) buf = ''
    return out
  }
}

// ------------------------------------------------------- island activities ----

/** The approval card's request for an ask. `deadline` is local time (ms). */
export function askRequest(ask: ConnectedAsk, m: Pick<ConnectedManifest, 'name' | 'color'>, deadline: number): ToolRequest {
  const id = ASK_PREFIX + ask.id
  const { secondsLeft: _s, ...rest } = ask
  return {
    id,
    toolName: 'connected_ask',
    inputSummary: ask.title,
    fromIsland: true,
    connected: { ...rest, app: m.name, color: m.color, deadline },
  }
}

/** The service's ask id behind an approval card id, or null if it isn't one. Pure. */
export function askIdOf(activityId: string): string | null {
  return activityId.startsWith(ASK_PREFIX) ? activityId.slice(ASK_PREFIX.length) : null
}

/** Seconds left on a card, for its countdown. Pure. */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

/** Two short lines for the hover peek. Pure. */
export function capsulePeek(c: ConnectedCapsule): { title: string; sub: string } {
  return { title: `${c.app} · ${c.text}`, sub: c.detail }
}

/** The view in plain text, for the assistant (read only). Pure. */
export function viewText(m: ConnectedManifest | undefined, v: ConnectedView | undefined, phase: ConnectedState['phase']): string {
  if (!m) return phase === 'off' ? 'No connected package is set up (Settings → Connected).' : `The connected package isn’t reachable right now (${phase}).`
  if (!v) return `${m.name} is connected but hasn’t sent anything yet.`
  const out: string[] = [`${m.name}: ${v.status.text}${v.status.detail ? ` (${v.status.detail})` : ''}`]
  if (v.asks.length)
    out.push(
      `Waiting for the user's approval (only the user can answer, on the island or their phone): ${v.asks.map((a) => `${a.title} [${a.lines.map((l) => `${l.label} ${l.value}`).join(', ')}]`).join('; ')}`,
    )
  for (const s of v.sections) {
    if (s.type === 'stats') out.push(s.items.map((i) => `${i.label}: ${i.value}`).join(' · '))
    else if (s.type === 'list') out.push(`${s.title}: ${s.rows.length ? s.rows.map((r) => [r.title, r.subtitle, r.value].filter(Boolean).join(' · ')).join(' | ') : s.empty || 'none'}`)
    else if (s.type === 'note') out.push(s.text)
  }
  return out.join('\n')
}
