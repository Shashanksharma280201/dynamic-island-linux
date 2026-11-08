/**
 * The evening digest: what the island kept quiet during the day (things it
 * didn't say out loud, things that weren't urgent, notifications you didn't
 * get to), once a day on the island at the hour you pick. Pure functions.
 */
import { appsText, countByApp, type CenterEntry } from './notifCenter'

export { appsText }
import type { KeptWhy } from './jarvis'

/** Something that wasn't said out loud, kept for the evening. */
export type DigestItem = { at: number; key: string; kind: string; line: string; why: KeptWhy }

/** The evening card, as the island shows it. */
export type EveningCard = {
  /** The day it's for ("2026-11-08"). */
  date: string
  /** Since when it counts (the last digest, or a day back). */
  since: number
  /** What wasn't said, newest first, with why. */
  kept: { line: string; why: string; at: number }[]
  /** How many more there were than shown. */
  more: number
  /** Notifications you didn't get to, by app, most first. */
  apps: { app: string; count: number }[]
  /** All of them. */
  notifications: number
  state: 'new' | 'done'
}

export const WHY_TEXT: Record<KeptWhy, string> = {
  medium: 'shown only',
  low: 'not urgent',
  muted: 'speaking is off',
  'quiet-hours': 'quiet hours',
  dismissed: 'you usually wave these away',
  repeat: 'said already',
  limit: 'enough said that hour',
}

/** What goes in: everything low, and what would have been said but wasn't. Approvals are answered at the time. Pure. */
export function keepForDigest(kind: string, why: KeptWhy | null): boolean {
  if (!why || kind === 'approval') return false
  return why !== 'medium' && why !== 'repeat'
}

/** A day as "2026-11-08", in local time. Pure. */
export function dayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Today's digest time (ms). Pure. */
export function digestTime(now: number, hour: number): number {
  const d = new Date(now)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/** Is today's digest due (its hour has come and it hasn't been shown since)? Pure. */
export function digestDue(now: number, hour: number, lastShown: number): boolean {
  const at = digestTime(now, hour)
  return now >= at && lastShown < at
}

/** The card, from what was kept since the last one; null when there's nothing to tell. Pure. */
export function buildEvening(o: { now: number; since: number; items: DigestItem[]; entries: CenterEntry[]; max?: number }): EveningCard | null {
  const max = o.max ?? 5
  const seen = new Set<string>()
  const kept: EveningCard['kept'] = []
  for (const i of [...o.items].sort((a, b) => b.at - a.at)) {
    if (i.at <= o.since || i.at > o.now || seen.has(i.key)) continue
    seen.add(i.key)
    kept.push({ line: i.line, why: WHY_TEXT[i.why], at: i.at })
  }
  const { apps, total: notifications } = countByApp(o.entries, o.since, o.now)
  if (!kept.length && !notifications) return null
  return { date: dayKey(o.now), since: o.since, kept: kept.slice(0, max), more: Math.max(0, kept.length - max), apps, notifications, state: 'new' }
}

/** The card's heading: "2 things kept quiet, 9 notifications". Pure. */
export function eveningTitle(c: EveningCard): string {
  const n = c.kept.length + c.more
  const parts = []
  if (n) parts.push(`${n} ${n === 1 ? 'thing' : 'things'} kept quiet`)
  if (c.notifications) parts.push(`${c.notifications} ${c.notifications === 1 ? 'notification' : 'notifications'}`)
  return parts.join(', ')
}

/** What the digest keeps between restarts, checked. Pure. */
export type DigestState = { items: DigestItem[]; lastShown: number; card: EveningCard | null }

const WHYS = Object.keys(WHY_TEXT) as KeptWhy[]

export function parseDigestState(raw: unknown, now: number): DigestState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const items: DigestItem[] = []
  for (const x of Array.isArray(r.items) ? r.items : []) {
    if (!x || typeof x !== 'object') continue
    const i = x as Record<string, unknown>
    if (!Number.isFinite(i.at) || typeof i.key !== 'string' || typeof i.kind !== 'string' || typeof i.line !== 'string' || !WHYS.includes(i.why as KeptWhy)) continue
    // Two days is plenty: older ones were in a digest already, or the computer was off.
    if (now - Number(i.at) > 48 * 3_600_000) continue
    items.push({ at: Number(i.at), key: i.key.slice(0, 200), kind: i.kind.slice(0, 40), line: i.line.slice(0, 300), why: i.why as KeptWhy })
  }
  const lastShown = Number.isFinite(r.lastShown) ? Number(r.lastShown) : 0
  let card: EveningCard | null = null
  const c = r.card as Record<string, unknown> | null
  if (c && typeof c === 'object' && typeof c.date === 'string' && Array.isArray(c.kept) && Array.isArray(c.apps) && (c.state === 'new' || c.state === 'done')) {
    // Yesterday's card isn't brought back.
    if (c.date === dayKey(now)) card = c as unknown as EveningCard
  }
  return { items: items.slice(-200), lastShown, card }
}
