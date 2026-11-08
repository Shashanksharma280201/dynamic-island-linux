/**
 * Island OS: what Settings and the island see of the engine, the sources,
 * memory and agents, and the calls they may make (one channel, each call's
 * arguments checked before it runs).
 */
import type { AnswerMeta, EngineConfig, LocalModel } from './engine'
import type { SourcesView } from './intake'
import type { TimelineHour } from './memory'
import type { Monitor, ResearchJob } from './agents'
import type { AgencyAgent, AgencyView } from './agency'
import type { CallNote } from './calls'
import type { SkillsView } from './skills'

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

/** The Agents panel: monitors, research, the roster that tends the brain, the week, and The Agency. */
export type AgentsView = {
  monitors: (Monitor & { line: string })[]
  research: (ResearchJob & { line: string })[]
  /** People, the evening filing (Inbox) and Projects: the brain's loop jobs that tend it. */
  roster: { id: string; label: string; what: string; note: string; ok: boolean | null; lastRun: number }[]
  /** The brain is on (the roster and research notes need it). */
  brain: boolean
  week: { local: number; cloud: number; cost: number; unknown: number }
  agency: AgencyView
  /** Agent Skills (Anthropic's), downloaded when you ask. */
  skills: SkillsView
}

/** The resting island: notes waiting to be filed, and what's next on today's calendar. */
export type RestingView = { toFile: number; next: { title: string; at: number } | null }

/** Call notes: the latest calls, and whether one is being recorded. */
export type CallsView = { list: (CallNote & { line: string })[]; recording: boolean }

/** One of The Agency's agents, opened. */
export type AgencyDetail = AgencyAgent & { body: string; installed: boolean }

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
  'agents.view': [],
  'agents.monitor': ['s'],
  'agents.unmonitor': ['s'],
  'agents.check': [],
  'agents.research': ['s', 'b?'],
  'agents.forget': ['s'],
  'agents.run': ['s'],
  'calls.view': [],
  'calls.start': [],
  'calls.stop': [],
  'calls.sum': ['s', 'b?'],
  'calls.plain': ['s'],
  'calls.keep': ['s'],
  'calls.forget': ['s'],
  'today.speak': [],
  'agency.view': [],
  'agency.get': [],
  'agency.search': ['s', 's?'],
  'agency.agent': ['s'],
  'agency.start': ['s', 's'],
  'agency.install': ['s'],
  'agency.uninstall': ['s'],
  'skills.view': [],
  'skills.get': [],
  'skills.search': ['s'],
  'skills.skill': ['s'],
  'skills.install': ['s'],
  'skills.uninstall': ['s'],
  'skills.start': ['s'],
  'status.view': [],
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
