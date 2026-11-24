/**
 * The Dashboard: four tiles you choose (what's playing, a focus timer, your
 * voice assistant, this computer, the day, what's next, Claude, the weather,
 * your devices, screen time, a to-do list, the shelf, a translator), a row of
 * apps, a timer that also shows on the resting island, and a few numbers
 * about the day and the computer. Pure.
 */
import { clockMinutes, parsePins } from './extras'

export const TILE_KINDS = ['media', 'timer', 'assistant', 'system', 'day', 'next', 'claude', 'weather', 'devices', 'screen', 'todo', 'shelf', 'translate'] as const
export type TileKind = (typeof TILE_KINDS)[number]

export const TILE_NAMES: Record<TileKind, string> = {
  media: 'Now playing',
  timer: 'Focus timer',
  /** (Shown under the name you gave it: "Friday".) */
  assistant: 'Assistant',
  day: 'Day progress',
  system: 'Computer',
  next: 'Next up',
  claude: 'Claude',
  weather: 'Weather',
  devices: 'Devices',
  screen: 'Screen time',
  todo: 'To-do',
  shelf: 'Shelf',
  translate: 'Translate',
}

export const TILE_SLOTS = 4
export const DEFAULT_TILES: TileKind[] = ['media', 'timer', 'assistant', 'system']

const isTile = (v: unknown): v is TileKind => typeof v === 'string' && (TILE_KINDS as readonly string[]).includes(v)

/** The four tiles from a saved list: known kinds, each once; the gaps filled from the defaults, then the rest. Pure. */
export function parseTiles(raw: unknown, defaults: TileKind[] = DEFAULT_TILES): TileKind[] {
  const out: TileKind[] = []
  if (Array.isArray(raw)) for (const v of raw) if (isTile(v) && !out.includes(v) && out.length < TILE_SLOTS) out.push(v)
  for (const k of [...defaults, ...DEFAULT_TILES, ...TILE_KINDS]) if (out.length < TILE_SLOTS && !out.includes(k)) out.push(k)
  return out
}

/** The evening's tiles, until you choose your own: wind down. */
export const EVENING_TILES: TileKind[] = ['media', 'weather', 'todo', 'screen']
/** A second set of tiles that takes over in the evening (off until you turn it on). */
export type Profiles = { on: boolean; dayFrom: string; eveningFrom: string; evening: TileKind[] }
export const PROFILE_DEFAULTS: Profiles = { on: false, dayFrom: '07:00', eveningFrom: '18:00', evening: EVENING_TILES }

export function parseProfiles(raw: unknown): Profiles {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const time = (v: unknown, d: string) => {
    const m = clockMinutes(v)
    return m === null ? d : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }
  return { on: r.on === true, dayFrom: time(r.dayFrom, PROFILE_DEFAULTS.dayFrom), eveningFrom: time(r.eveningFrom, PROFILE_DEFAULTS.eveningFrom), evening: parseTiles(r.evening, EVENING_TILES) }
}

/** Put `kind` in `slot`. If another slot has it, the two swap, so each kind shows once. Pure. */
export function setTile(tiles: TileKind[], slot: number, kind: TileKind): TileKind[] {
  const next = parseTiles(tiles)
  if (slot < 0 || slot >= TILE_SLOTS || !isTile(kind)) return next
  const at = next.indexOf(kind)
  if (at === slot) return next
  if (at >= 0) next[at] = next[slot]
  next[slot] = kind
  return next
}

// ---- The focus timer ---------------------------------------------------------

export type TimerPhase = 'idle' | 'focus' | 'break'
export type TimerCmd = 'start' | 'pause' | 'resume' | 'reset'

export type TimerState = {
  phase: TimerPhase
  /** When the running phase ends; null while paused or idle. */
  endsAt: number | null
  /** Paused: what was left (ms). */
  left: number | null
  /** Focus sessions finished on `day`. */
  done: number
  /** The day `done` counts, as YYYY-MM-DD in local time. */
  day: string
}

export type TimerPrefs = { focusMin: number; breakMin: number }
export const TIMER_DEFAULTS: TimerPrefs = { focusMin: 25, breakMin: 5 }
/** The lengths offered on the tile, and the break that goes with each. */
export const FOCUS_CHOICES: TimerPrefs[] = [
  { focusMin: 15, breakMin: 3 },
  { focusMin: 25, breakMin: 5 },
  { focusMin: 45, breakMin: 10 },
  { focusMin: 60, breakMin: 15 },
]

/** What the island shows of the timer: its state and the lengths it runs with. */
export type TimerView = TimerState & TimerPrefs

const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d)

export function parseTimerPrefs(raw: unknown): TimerPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { focusMin: clampInt(r.focusMin, 1, 180, TIMER_DEFAULTS.focusMin), breakMin: clampInt(r.breakMin, 1, 60, TIMER_DEFAULTS.breakMin) }
}

/** YYYY-MM-DD in local time. */
export function localDay(now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const timerIdle = (now: number, done = 0): TimerState => ({ phase: 'idle', endsAt: null, left: null, done, day: localDay(now) })

const MIN = 60_000
const phaseMs = (phase: TimerPhase, p: TimerPrefs) => (phase === 'break' ? p.breakMin : p.focusMin) * MIN

/** A new day starts the count of finished sessions again. */
const today = (s: TimerState, now: number): TimerState => (s.day === localDay(now) ? s : { ...s, done: 0, day: localDay(now) })

export const timerRunning = (s: TimerState): boolean => s.endsAt !== null
export const timerPaused = (s: TimerState): boolean => s.phase !== 'idle' && s.endsAt === null

/** What's left of the phase (a whole focus session while idle), never below zero. Pure. */
export function timerLeft(s: TimerState, p: TimerPrefs, now: number): number {
  if (s.endsAt !== null) return Math.max(0, s.endsAt - now)
  if (s.left !== null) return Math.max(0, s.left)
  return phaseMs('focus', p)
}

/** How far through the phase it is, 0 to 1 (0 while idle). Pure. */
export function timerFraction(s: TimerState, p: TimerPrefs, now: number): number {
  if (s.phase === 'idle') return 0
  const all = phaseMs(s.phase, p)
  return Math.min(1, Math.max(0, 1 - timerLeft(s, p, now) / all))
}

/** The timer after a button: start, pause, resume, or reset (stop a session early: nothing counted; or skip a break). Pure. */
export function timerStep(state: TimerState, cmd: TimerCmd, p: TimerPrefs, now: number): TimerState {
  const s = today(state, now)
  switch (cmd) {
    case 'start':
      return s.phase === 'idle' ? { ...s, phase: 'focus', endsAt: now + phaseMs('focus', p), left: null } : timerPaused(s) ? timerStep(s, 'resume', p, now) : s
    case 'pause':
      return s.endsAt === null ? s : { ...s, endsAt: null, left: Math.max(0, s.endsAt - now) }
    case 'resume':
      return timerPaused(s) ? { ...s, endsAt: now + (s.left ?? phaseMs(s.phase, p)), left: null } : s
    case 'reset':
      return s.phase === 'idle' ? s : timerIdle(now, s.done)
  }
}

/**
 * The timer when its phase has run out: focus counts one and goes straight
 * into the break; the break goes back to rest. `finished` says which ended
 * (null if nothing has run out yet). Pure.
 */
export function timerDue(state: TimerState, p: TimerPrefs, now: number): { state: TimerState; finished: 'focus' | 'break' | null } {
  const s = today(state, now)
  if (s.endsAt === null || s.endsAt > now) return { state: s, finished: null }
  if (s.phase === 'focus') return { state: { ...s, phase: 'break', endsAt: now + phaseMs('break', p), left: null, done: s.done + 1 }, finished: 'focus' }
  return { state: timerIdle(now, s.done), finished: 'break' }
}

/** "24:59" (or "1:05:00"): what's left, rounded up to the second so it reads 25:00 at the start. Pure. */
export function clockLeft(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`
}

/** One line on the timer for a title or the peek: "Focus · 24:59 left". Pure. */
export function timerLine(s: TimerState, p: TimerPrefs, now: number): string {
  if (s.phase === 'idle') return `Focus timer · ${p.focusMin} min`
  const what = s.phase === 'focus' ? 'Focus' : 'Break'
  return `${what} · ${clockLeft(timerLeft(s, p, now))} ${timerPaused(s) ? 'paused' : 'left'}`
}

// ---- The day -----------------------------------------------------------------

/** How much of today has gone: the fraction, the hour it is, and the minutes left. Pure. */
export function dayProgress(at: Date): { fraction: number; hour: number; leftMin: number } {
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
  const end = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime()
  const fraction = Math.min(1, Math.max(0, (at.getTime() - start) / (end - start)))
  return { fraction, hour: at.getHours(), leftMin: Math.max(0, Math.round((end - at.getTime()) / MIN)) }
}

/** "9 h 12 min left" / "42 min left". Pure. */
export function leftText(leftMin: number): string {
  const h = Math.floor(leftMin / 60)
  const m = leftMin % 60
  return h > 0 ? (m ? `${h} h ${m} min left` : `${h} h left`) : `${m} min left`
}

/** "in 42 min" / "in 2 h 5 min" / "now" / "tomorrow": how far off something is. Pure. */
export function untilText(at: number, now: number): string {
  const min = Math.round((at - now) / MIN)
  if (min <= 0) return 'now'
  if (min < 60) return `in ${min} min`
  if (min < 24 * 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `in ${h} h ${m} min` : `in ${h} h`
  }
  const days = Math.round(min / (24 * 60))
  return days <= 1 ? 'tomorrow' : `in ${days} days`
}

/** "12m" / "2h" / "now": the same, where there's only room for a word. Pure. */
export function untilShort(at: number, now: number): string {
  const min = Math.round((at - now) / MIN)
  if (min <= 0) return 'now'
  return min < 60 ? `${min}m` : `${Math.round(min / 60)}h`
}

// ---- What's about to start ---------------------------------------------------

/** Something on your calendar that's about to start (or just has): the resting island shows it. */
export type SoonEvent = { title: string; at: number; where?: string }
/** It shows from this long before it starts… */
export const EVENT_SOON_MIN = 30
/** …until this long after. */
export const EVENT_AFTER_MIN = 5

/** The event to show now: the earliest timed one starting within half an hour, or begun in the last five minutes. Pure. */
export function soonEvent(events: { start: number; title: string; where?: string; allDay: boolean }[], now: number): SoonEvent | null {
  const e = events
    .filter((x) => !x.allDay && x.start > now - EVENT_AFTER_MIN * MIN && x.start <= now + EVENT_SOON_MIN * MIN)
    .sort((a, b) => a.start - b.start)[0]
  if (!e) return null
  return { title: e.title.trim().slice(0, 80) || 'Event', at: e.start, ...(e.where?.trim() ? { where: e.where.trim().slice(0, 60) } : {}) }
}

// ---- The computer ------------------------------------------------------------

export type CpuTotals = { idle: number; total: number }
type CpuInfo = { times: { user: number; nice: number; sys: number; idle: number; irq: number } }

/** All cores' time so far, split into idle and everything (from os.cpus()). Pure. */
export function cpuTotals(cpus: CpuInfo[]): CpuTotals {
  let idle = 0
  let total = 0
  for (const c of cpus) {
    const t = c.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

/** How busy the processor was between two readings, 0 to 100. Pure. */
export function cpuPercent(a: CpuTotals, b: CpuTotals): number {
  const total = b.total - a.total
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((1 - (b.idle - a.idle) / total) * 100)))
}

/** Linux: the memory programs can still have, in bytes, from /proc/meminfo (null if it doesn't say). Pure. */
export function parseMemAvailable(meminfo: string): number | null {
  const m = /^MemAvailable:\s+(\d+)\s*kB/m.exec(meminfo)
  return m ? Number(m[1]) * 1024 : null
}

/** Memory in use, 0 to 100. Pure. */
export function memPercent(total: number, available: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((1 - available / total) * 100)))
}

export type Battery = { pct: number; charging: boolean }

/** Linux: the battery from /sys/class/power_supply's `capacity` and `status` files (null if they don't say). Pure. */
export function parseBattery(capacity: string, status: string): Battery | null {
  const pct = Number(capacity.trim())
  if (!capacity.trim() || !Number.isFinite(pct)) return null
  const st = status.trim().toLowerCase()
  return { pct: Math.min(100, Math.max(0, Math.round(pct))), charging: st === 'charging' || st === 'full' || st === 'not charging' }
}

export type SystemStats = {
  /** Processor in use since the last reading, 0 to 100. */
  cpu: number
  /** Memory in use, 0 to 100. */
  mem: number
  memUsedGb: number
  memTotalGb: number
  /** The battery; null when this computer has none, undefined when the island can't tell here (the page asks the browser). */
  battery?: Battery | null
}

// ---- What's saved, and what the panel shows ------------------------------------

export type DashboardConfig = {
  tiles: TileKind[]
  timer: TimerPrefs
  /** The row of apps, by id; null until you change it (then the usual ones that are installed). */
  pins: string[] | null
  profiles: Profiles
}

export function parseDashboardConfig(raw: unknown): DashboardConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { tiles: parseTiles(r.tiles), timer: parseTimerPrefs(r.timer), pins: Array.isArray(r.pins) ? parsePins(r.pins) : null, profiles: parseProfiles(r.profiles) }
}

const TIMER_CMDS: readonly TimerCmd[] = ['start', 'pause', 'resume', 'reset']
export const isTimerCmd = (v: unknown): v is TimerCmd => typeof v === 'string' && (TIMER_CMDS as readonly string[]).includes(v)

/** A saved timer, read back: null unless every part of it makes sense. Pure. */
export function parseTimerState(raw: unknown): TimerState | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  if (!r) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  if (r.phase !== 'idle' && r.phase !== 'focus' && r.phase !== 'break') return null
  if (typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return null
  const done = num(r.done)
  if (done === null) return null
  const endsAt = r.endsAt === null ? null : num(r.endsAt)
  const left = r.left === null ? null : num(r.left)
  if (r.phase === 'idle') return { phase: 'idle', endsAt: null, left: null, done: Math.round(done), day: r.day }
  // Running has an end; paused has what was left; never both.
  if ((endsAt === null) === (left === null)) return null
  return { phase: r.phase, endsAt, left, done: Math.round(done), day: r.day }
}

/**
 * A saved timer when the island starts again: one that ran out while it was
 * closed is finished (a focus session counts; the break it would have started
 * is over or not wanted now). Pure.
 */
export function timerRestored(saved: TimerState | null, now: number): TimerState {
  if (!saved) return timerIdle(now)
  const s = today(saved, now)
  if (s.endsAt === null || s.endsAt > now) return s
  return timerIdle(now, s.phase === 'focus' && saved.day === localDay(now) ? s.done + 1 : s.done)
}

export type DashView = {
  /** The tiles showing now (the evening's, when that set is on and it's the evening). */
  tiles: TileKind[]
  timer: TimerView
  /** Which set that is; absent when there's only the one. */
  profile?: 'day' | 'evening'
}
