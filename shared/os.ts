/**
 * Island OS: what Settings and the island see of the engine, the sources,
 * memory and agents, and the calls they may make (one channel, each call's
 * arguments checked before it runs).
 */
import type { AnswerMeta, EngineConfig, LocalModel } from './engine'
import type { SourcesView } from './intake'
import type { TimelineHour } from './memory'

export type EngineView = {
  cfg: EngineConfig
  local: { found: boolean; url: string; models: LocalModel[]; daily: string; research: string; error: string | null }
  /** The cloud: the AI in Settings › AI (null when there's none). */
  cloud: string | null
  /** Who answers now, in words. */
  label: string
  week: { local: number; cloud: number; cost: number; unknown: number }
  /** Kinds of question your traces say you'd rather send to the cloud. */
  learned: { feature: string; label: string }[]
}

/** Everything Island OS shows in Settings. */
export type OsView = { engine: EngineView; sources: SourcesView }

/** The Today panel: the day by hour, what's next on the calendar, and whether answers can stay here. */
export type TodayView = {
  date: string
  timeline: TimelineHour[]
  upcoming: { start: number; title: string; where?: string; allDay: boolean }[]
  /** A model on this computer answers questions. */
  local: boolean
  /** Some source is on (or the brain), so the day has something in it. */
  any: boolean
}

/** An answer as the island shows it, or why there isn't one. */
export type OsAnswer = { ok: true; text: string; meta: AnswerMeta; cites?: OsCite[] } | { ok: false; needsConsent: string } | { ok: false; error: string }

/** A source an answer used, numbered as it's cited ([1], [2]…). */
export type OsCite = { n: number; title: string; kind: string; path?: string; url?: string }

/** What may be called, and the type of each argument ('s' string, 'b' boolean, 'o' object, 'n' number; '?' may be left out). */
export const OS_CALLS = {
  'engine.view': [],
  'engine.set': ['o'],
  'engine.detect': [],
  'sources.view': [],
  'sources.set': ['o'],
  'sources.check': ['s'],
  'today.view': [],
  'today.ask': ['s', 'o?'],
} as const satisfies Record<string, readonly string[]>

export type OsCall = keyof typeof OS_CALLS

/** A call's arguments, checked against its kinds; null when they don't fit. Pure. */
export function osCallArgs(fn: unknown, args: unknown): { fn: OsCall; args: unknown[] } | null {
  if (typeof fn !== 'string' || !Object.hasOwn(OS_CALLS, fn)) return null
  const kinds = OS_CALLS[fn as OsCall] as readonly string[]
  const a = Array.isArray(args) ? args : []
  if (a.length > kinds.length) return null
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i]
    const v = a[i]
    if (k.endsWith('?') && (v === undefined || v === null)) continue
    const t = k.replace('?', '')
    if (t === 's' && (typeof v !== 'string' || v.length > 20_000)) return null
    if (t === 'n' && (typeof v !== 'number' || !Number.isFinite(v))) return null
    if (t === 'b' && typeof v !== 'boolean') return null
    if (t === 'o' && (!v || typeof v !== 'object' || Array.isArray(v))) return null
  }
  return { fn: fn as OsCall, args: a }
}
