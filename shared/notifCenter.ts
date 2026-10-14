/**
 * The notification center: every notification and message the island shows
 * (or keeps quiet about, in Do Not Disturb) stays here until you dismiss it
 * or clear them all. Pure functions over a list, newest first.
 */

export type CenterSource = 'notification' | 'whatsapp' | 'mail'

export type CenterEntry = {
  /** Stable key: a WhatsApp chat or a mail keeps one entry, updated in place. */
  id: string
  /** When it last arrived (ms). */
  at: number
  source: CenterSource
  /** The app or account it came from, e.g. "Slack", "WhatsApp", "Mail · Work". */
  app: string
  /** A small image (data: URL or file path); dropped when too big to keep. */
  icon?: string
  title: string
  body?: string
  urgency?: 'low' | 'normal' | 'critical'
  /** How many messages it stands for (a chat that kept talking). */
  count: number
  /** Seen in the Notifications tab. */
  seen: boolean
  /** Where clicking it goes (a chat or a mail). */
  thread?: string
}

export type CenterView = {
  entries: CenterEntry[]
  unseen: number
  dnd: boolean
}

export const MAX_ENTRIES = 100
const MAX_ICON = 64 * 1024
const MAX_TEXT = 600

const clip = (s: string | undefined, n = MAX_TEXT): string | undefined => {
  const t = s?.trim()
  return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : undefined
}

/**
 * Add one arrival. An entry with the same id (the same chat) moves to the
 * top with the newest text and counts one more message. Pure.
 */
export function addEntry(list: CenterEntry[], e: Omit<CenterEntry, 'count' | 'seen'> & { count?: number }, max = MAX_ENTRIES): CenterEntry[] {
  const prev = list.find((x) => x.id === e.id)
  const next: CenterEntry = {
    ...e,
    title: clip(e.title, 200) ?? '',
    body: clip(e.body),
    icon: e.icon && e.icon.length <= MAX_ICON ? e.icon : prev?.icon,
    count: (prev?.count ?? 0) + (e.count ?? 1),
    seen: false,
  }
  return [next, ...list.filter((x) => x.id !== e.id)].slice(0, max)
}

export function dismissEntry(list: CenterEntry[], id: string): CenterEntry[] {
  return list.filter((x) => x.id !== id)
}

/** Put cleared entries back (Undo), newest first, without duplicating any. Pure. */
export function restoreEntries(list: CenterEntry[], back: CenterEntry[], max = MAX_ENTRIES): CenterEntry[] {
  const have = new Set(list.map((x) => x.id))
  return [...list, ...back.filter((x) => !have.has(x.id))].sort((a, b) => b.at - a.at).slice(0, max)
}

export function markSeen(list: CenterEntry[]): CenterEntry[] {
  return list.some((x) => !x.seen) ? list.map((x) => (x.seen ? x : { ...x, seen: true })) : list
}

export function unseenCount(list: CenterEntry[]): number {
  return list.filter((x) => !x.seen).length
}

/** Entries grouped by app, in the order the newest of each arrived. Pure. */
export function groupByApp(list: CenterEntry[]): { app: string; entries: CenterEntry[] }[] {
  const groups = new Map<string, CenterEntry[]>()
  for (const e of [...list].sort((a, b) => b.at - a.at)) {
    const g = groups.get(e.app)
    if (g) g.push(e)
    else groups.set(e.app, [e])
  }
  return [...groups].map(([app, entries]) => ({ app, entries }))
}

/** A saved list, checked entry by entry (a bad file keeps what's readable). Pure. */
export function parseEntries(raw: unknown): CenterEntry[] {
  if (!Array.isArray(raw)) return []
  const out: CenterEntry[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const e = r as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.title !== 'string' || typeof e.app !== 'string' || !Number.isFinite(e.at)) continue
    if (e.source !== 'notification' && e.source !== 'whatsapp' && e.source !== 'mail') continue
    out.push({
      id: e.id,
      at: Number(e.at),
      source: e.source,
      app: e.app,
      icon: typeof e.icon === 'string' && e.icon.length <= MAX_ICON ? e.icon : undefined,
      title: e.title,
      body: typeof e.body === 'string' ? e.body : undefined,
      urgency: e.urgency === 'low' || e.urgency === 'critical' ? e.urgency : e.urgency === 'normal' ? 'normal' : undefined,
      count: Number.isInteger(e.count) && (e.count as number) > 0 ? (e.count as number) : 1,
      seen: e.seen === true,
      thread: typeof e.thread === 'string' ? e.thread : undefined,
    })
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES)
}

/** "Cleared 3 notifications". Pure. */
export function clearedText(n: number): string {
  return `Cleared ${n} ${n === 1 ? 'notification' : 'notifications'}`
}
