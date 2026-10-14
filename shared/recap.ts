/**
 * The weekly recap: what your coding agents did each week (time, sessions,
 * files and lines changed, commands, approvals), kept for 12 weeks, and the
 * card that sums up last week. Counts and names only: no prompts, no code. Pure.
 */

export type RecapWeek = {
  /** The Monday it starts on, "YYYY-MM-DD" (local time). */
  week: string
  turns: number
  /** Distinct sessions. */
  sessions: string[]
  codingMs: number
  longestMs: number
  files: number
  added: number
  removed: number
  commands: number
  allowed: number
  denied: number
  questions: number
  /** Time per agent, per project (folder name), per weekday (0 = Monday). */
  agents: Record<string, number>
  projects: Record<string, number>
  days: number[]
}

export type RecapHistory = RecapWeek[]

export const KEEP_WEEKS = 12

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The Monday of the week `at` falls in, as "YYYY-MM-DD". Pure. */
export function weekOf(at: number): string {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dayKey(d)
}

/** The Monday before `week`. Pure. */
export function weekBefore(week: string): string {
  const [y, m, d] = week.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 7))
}

const empty = (week: string): RecapWeek => ({ week, turns: 0, sessions: [], codingMs: 0, longestMs: 0, files: 0, added: 0, removed: 0, commands: 0, allowed: 0, denied: 0, questions: 0, agents: {}, projects: {}, days: [0, 0, 0, 0, 0, 0, 0] })

function update(h: RecapHistory, at: number, fn: (w: RecapWeek) => RecapWeek): RecapHistory {
  const week = weekOf(at)
  const cur = h.find((w) => w.week === week) ?? empty(week)
  const next = [...h.filter((w) => w.week !== week), fn(cur)].sort((a, b) => (a.week < b.week ? -1 : 1))
  return next.slice(-KEEP_WEEKS)
}

export type Turn = { at: number; session: string; agent: string; project: string; ms: number; files: number; added: number; removed: number; commands: number }

/** Count a finished turn (a prompt and everything the agent did for it). Pure. */
export function addTurn(h: RecapHistory, t: Turn): RecapHistory {
  const ms = Math.max(0, Math.min(t.ms, 6 * 3_600_000)) // a forgotten session isn't a 3-day turn
  return update(h, t.at, (w) => {
    const day = (new Date(t.at).getDay() + 6) % 7
    const days = [...w.days]
    days[day] += ms
    return {
      ...w,
      turns: w.turns + 1,
      sessions: w.sessions.includes(t.session) ? w.sessions : [...w.sessions, t.session].slice(-500),
      codingMs: w.codingMs + ms,
      longestMs: Math.max(w.longestMs, ms),
      files: w.files + t.files,
      added: w.added + t.added,
      removed: w.removed + t.removed,
      commands: w.commands + t.commands,
      agents: { ...w.agents, [t.agent]: (w.agents[t.agent] ?? 0) + ms },
      projects: t.project ? { ...w.projects, [t.project]: (w.projects[t.project] ?? 0) + ms } : w.projects,
      days,
    }
  })
}

/** Count an answer you gave on the island. Pure. */
export function addAnswer(h: RecapHistory, at: number, kind: 'allow' | 'deny' | 'question'): RecapHistory {
  return update(h, at, (w) => (kind === 'allow' ? { ...w, allowed: w.allowed + 1 } : kind === 'deny' ? { ...w, denied: w.denied + 1 } : { ...w, questions: w.questions + 1 }))
}

/** A saved history, checked. Pure. */
export function parseHistory(raw: unknown): RecapHistory {
  if (!Array.isArray(raw)) return []
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  const rec = (v: unknown): Record<string, number> => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).filter(([k, x]) => k.length <= 100 && n(x)).map(([k, x]) => [k, n(x)])) : {})
  return raw
    .filter((w) => w && typeof w.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.week))
    .map((w) => ({
      week: w.week,
      turns: n(w.turns),
      sessions: Array.isArray(w.sessions) ? w.sessions.filter((s: unknown) => typeof s === 'string').slice(-500) : [],
      codingMs: n(w.codingMs),
      longestMs: n(w.longestMs),
      files: n(w.files),
      added: n(w.added),
      removed: n(w.removed),
      commands: n(w.commands),
      allowed: n(w.allowed),
      denied: n(w.denied),
      questions: n(w.questions),
      agents: rec(w.agents),
      projects: rec(w.projects),
      days: Array.isArray(w.days) && w.days.length === 7 ? w.days.map(n) : [0, 0, 0, 0, 0, 0, 0],
    }))
    .slice(-KEEP_WEEKS)
}

const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "3 h 20 min", "45 min", "under a minute". Pure. */
export function hoursText(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'under a minute'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** "Sep 28 to Oct 4". Pure. */
export function weekRange(week: string): string {
  const [y, m, d] = week.split('-').map(Number)
  const a = new Date(y, m - 1, d)
  const b = new Date(y, m - 1, d + 6)
  return `${MONTH[a.getMonth()]} ${a.getDate()} to ${MONTH[b.getMonth()]} ${b.getDate()}`
}

const top = (r: Record<string, number>): string | undefined => Object.entries(r).sort((a, b) => b[1] - a[1])[0]?.[0]

export type RecapCard = {
  week: string
  range: string
  empty: boolean
  chips: { value: string; label: string }[]
  lines: { label: string; value: string }[]
}

/** The card for a week. `hideProjects` leaves project names out (for sharing). Pure. */
export function recapCard(w: RecapWeek | undefined, week: string, agentName: (id: string) => string, hideProjects = false): RecapCard {
  if (!w || !w.turns) return { week, range: weekRange(week), empty: true, chips: [], lines: [] }
  const busiest = w.days.indexOf(Math.max(...w.days))
  const lines: RecapCard['lines'] = []
  const agent = top(w.agents)
  if (agent) lines.push({ label: 'Top agent', value: agentName(agent) })
  const project = top(w.projects)
  if (project && !hideProjects) lines.push({ label: 'Top project', value: project })
  lines.push({ label: 'Busiest day', value: WEEKDAY[busiest] })
  lines.push({ label: 'Longest turn', value: hoursText(w.longestMs) })
  if (w.allowed || w.denied) lines.push({ label: 'Permissions', value: `${w.allowed} allowed, ${w.denied} denied` })
  if (w.questions) lines.push({ label: 'Questions answered', value: String(w.questions) })
  return {
    week,
    range: weekRange(week),
    empty: false,
    chips: [
      { value: hoursText(w.codingMs), label: 'with your agents' },
      { value: String(w.sessions.length), label: w.sessions.length === 1 ? 'session' : 'sessions' },
      { value: String(w.files), label: w.files === 1 ? 'file changed' : 'files changed' },
      { value: `+${w.added} −${w.removed}`, label: 'lines' },
      { value: String(w.commands), label: w.commands === 1 ? 'command' : 'commands' },
    ],
    lines,
  }
}

/**
 * Whether to show last week's recap by itself now: on Monday from 8 am (or
 * later in the week if the island wasn't running then), once a week. Pure.
 */
export function recapDue(now: number, lastShownWeek: string): boolean {
  const d = new Date(now)
  const thisWeek = weekOf(now)
  if (lastShownWeek === thisWeek) return false
  const isMondayEarly = (d.getDay() + 6) % 7 === 0 && d.getHours() < 8
  return !isMondayEarly
}
