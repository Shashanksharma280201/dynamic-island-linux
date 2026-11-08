/**
 * The loop: the brain's scheduled jobs (commits, the evening filing, the daily
 * and weekly signals, the morning card). The pure parts: when each is due,
 * where inbox notes go, and reading the AI's answers.
 */
import { slugify } from './brain'

export type JobId = 'commits' | 'messages' | 'activity' | 'people' | 'triage' | 'projects' | 'daily' | 'weekly' | 'morning'

/** Local time of day; weekday 0 is Sunday. */
export type Schedule = { hour: number; minute: number; weekday?: number }

export const JOBS: { id: JobId; label: string; what: string; when: Schedule }[] = [
  { id: 'commits', label: 'Your commits', what: 'Today’s commits in your projects, kept as a source.', when: { hour: 20, minute: 45 } },
  { id: 'messages', label: 'Your messages', what: 'Today’s WhatsApp chats and mail, kept as sources (when you turn them on below).', when: { hour: 20, minute: 50 } },
  { id: 'activity', label: 'Your activity', what: 'Today’s GitHub, terminal, calendar, screen time and Codex and Gemini sessions, kept as sources (each one you turn on in Settings › Sources).', when: { hour: 20, minute: 55 } },
  { id: 'people', label: 'People', what: 'Who you were in touch with, and what you promised them in messages you sent (added to your promises, never sent anywhere).', when: { hour: 20, minute: 57 } },
  { id: 'triage', label: 'Evening filing', what: 'Where each inbox note should go. Nothing moves until you apply it.', when: { hour: 21, minute: 0 } },
  { id: 'projects', label: 'Projects', what: 'What moved in each project this week, and which have gone quiet.', when: { hour: 21, minute: 10 } },
  { id: 'daily', label: 'Daily signal', what: 'Five lines on your day.', when: { hour: 21, minute: 15 } },
  { id: 'weekly', label: 'Weekly signal', what: 'Patterns in your week, with counts.', when: { hour: 21, minute: 30, weekday: 0 } },
  { id: 'morning', label: 'Morning card', what: 'The one thing for today, why, and a draft.', when: { hour: 6, minute: 30 } },
]

const DAY = 86_400_000

/** The most recent time the schedule came round, at or before `now`. Pure (local time). */
export function lastDue(s: Schedule, now: number): number {
  const d = new Date(now)
  d.setHours(s.hour, s.minute, 0, 0)
  let t = d.getTime()
  if (t > now) t -= DAY
  if (s.weekday !== undefined) {
    for (let i = 0; i < 7 && new Date(t).getDay() !== s.weekday; i++) t -= DAY
  }
  return t
}

/** The next time after `now`. Pure. */
export function nextDue(s: Schedule, now: number): number {
  return lastDue(s, now + (s.weekday !== undefined ? 7 : 1) * DAY + 1)
}

/** Should it run now: it came round since it last ran (missed while asleep counts). Pure. */
export function isDue(s: Schedule, lastRun: number, now: number): boolean {
  return lastRun < lastDue(s, now)
}

export type JobState = { on: boolean; lastRun: number; ok: boolean | null; note: string }

export type JobStatus = JobState & { id: JobId; label: string; what: string; next: number }

// ------------------------------------------------------------ the filing ----

export type InboxNote = { path: string; title: string; type: string; about: string[] }
export type Move = { from: string; to: string; why: string }

const file = (p: string) => p.split('/').pop() ?? p

/**
 * Where each inbox note goes, by rules: people to the world model, ideas
 * and facts to their shelves, notes about a project to its folder, questions
 * to the buddy to resources. Project drafts keep their own Keep button. Pure.
 */
export function triagePlan(notes: InboxNote[], projects: string[]): Move[] {
  const known = new Map(projects.map((p) => [p.toLowerCase(), p]))
  const out: Move[] = []
  for (const n of notes) {
    if (n.type === 'project' || n.type === 'commits') continue
    const project = n.about.map((a) => known.get(slugify(a.replace(/^\[\[|\]\]$/g, ''), 80).toLowerCase())).find(Boolean)
    let to: string
    let why: string
    if (n.type === 'person') {
      to = `07-world-model/people/${slugify(n.title) || file(n.path).replace(/\.md$/, '')}.md`
      why = 'a person'
    } else if (project && n.type !== 'session') {
      to = `02-projects/${project}/notes/${file(n.path)}`
      why = `about ${project}`
    } else if (n.type === 'session') {
      to = project ? `02-projects/${project}/sessions/${file(n.path)}` : `05-archives/sessions/${file(n.path)}`
      why = project ? `a session in ${project}` : 'a session'
    } else if (n.type === 'idea') {
      to = `06-brain/ideas/${file(n.path)}`
      why = 'an idea'
    } else if (n.type === 'fact' || n.type === 'preference') {
      to = `06-brain/life/${file(n.path)}`
      why = n.type === 'fact' ? 'a fact' : 'a preference'
    } else if (n.type === 'outcome') {
      to = `06-brain/career/${file(n.path)}`
      why = 'an outcome'
    } else if (/^Asked /.test(n.title)) {
      to = `04-resources/asked/${file(n.path)}`
      why = 'a question you asked'
    } else {
      to = `04-resources/${file(n.path)}`
      why = 'a note'
    }
    if (to !== n.path) out.push({ from: n.path, to, why })
  }
  return out
}

// ------------------------------------------------------------- signals ----

export type DayFacts = {
  date: string
  sessions: { project: string; title: string }[]
  commits: { repo: string; count: number; lines: string[] }[]
  captures: number
  /** Messages kept that day, as names and counts ("WhatsApp 23 in 5 chats (Priya, Mom)"). */
  messages?: string
}

/** The day in plain words, when no AI writes it. Pure. */
export function dailyPlain(f: DayFacts): string {
  const projects = [...new Set(f.sessions.map((s) => s.project))]
  const commits = f.commits.reduce((n, c) => n + c.count, 0)
  return [
    `- Shipped: ${commits ? `${commits} commit${commits === 1 ? '' : 's'} in ${f.commits.map((c) => c.repo).join(', ')}` : 'no commits'}`,
    `- Worked on: ${projects.length ? projects.join(', ') : 'nothing logged'} (${f.sessions.length} Claude Code session${f.sessions.length === 1 ? '' : 's'})`,
    `- Captured: ${f.captures} note${f.captures === 1 ? '' : 's'}${f.messages ? `; ${f.messages}` : ''}`,
    `- Number: ${commits} commits, ${f.sessions.length} sessions`,
    '- Next: see tomorrow’s morning card',
  ].join('\n')
}

/** The week in counts, when no AI writes it. Pure. */
export function weeklyPlain(days: DayFacts[]): string {
  const sessions = days.flatMap((d) => d.sessions)
  const byProject = new Map<string, number>()
  for (const s of sessions) byProject.set(s.project, (byProject.get(s.project) ?? 0) + 1)
  const commits = days.reduce((n, d) => n + d.commits.reduce((m, c) => m + c.count, 0), 0)
  const busiest = [...days].sort((a, b) => b.sessions.length + b.commits.length - (a.sessions.length + a.commits.length))[0]
  const top = [...byProject.entries()].sort((a, b) => b[1] - a[1])
  return [
    `- ${sessions.length} Claude Code sessions and ${commits} commits this week.`,
    top.length ? `- Most time: ${top.slice(0, 3).map(([p, n]) => `${p} (${n} session${n === 1 ? '' : 's'})`).join(', ')}.` : '- No sessions logged.',
    busiest && (busiest.sessions.length || busiest.commits.length) ? `- Busiest day: ${busiest.date}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// --------------------------------------------------------- morning card ----

export type MorningCard = {
  date: string
  one: string
  why: string
  draft: string
  /** Who the draft is for, if it's a message: "Priya, by mail". */
  to: string
  state: 'new' | 'held' | 'done'
  holdUntil?: number
}

/** The morning card from the AI's answer ("One:", "Why:", "To:", "Draft:", in that order, on lines or not). Pure. */
export function parseMorning(text: string, date: string): MorningCard | null {
  const keys = ['One', 'Why', 'To', 'Draft'] as const
  const at: { key: (typeof keys)[number]; start: number; end: number }[] = []
  let pos = 0
  for (const key of keys) {
    const m = new RegExp(`(?:^|\\s)${key}:[ \\t]*`).exec(text.slice(pos))
    if (!m) continue
    at.push({ key, start: pos + m.index, end: pos + m.index + m[0].length })
    pos = pos + m.index + m[0].length
  }
  const val = (key: (typeof keys)[number]) => {
    const i = at.findIndex((a) => a.key === key)
    return i < 0 ? '' : text.slice(at[i].end, at[i + 1]?.start ?? text.length).trim()
  }
  const one = val('One').split('\n')[0].trim()
  if (!one) return null
  const to = val('To').split('\n')[0].trim()
  return { date, one: one.slice(0, 200), why: val('Why').slice(0, 400), to: /^(none|n\/a|-)?\.?$/i.test(to) ? '' : to.slice(0, 80), draft: val('Draft').slice(0, 2000), state: 'new' }
}

/** The morning card when there's no AI: the oldest open promise, else the busiest project. Pure. */
export function morningPlain(o: { date: string; promises: string[]; projects: string[] }): MorningCard | null {
  if (o.promises.length) return { date: o.date, one: o.promises[0].replace(/^-\s*(\[ \]\s*)?/, '').slice(0, 200), why: 'The oldest promise still open in your ledger.', to: '', draft: '', state: 'new' }
  if (o.projects.length) return { date: o.date, one: `Move ${o.projects[0]} forward`, why: 'Where most of your sessions went this week.', to: '', draft: '', state: 'new' }
  return null
}

/** Is the card showing now (not done, not held until later)? Pure. */
export function cardShowing(c: MorningCard | null, now: number): boolean {
  return !!c && (c.state === 'new' || (c.state === 'held' && (c.holdUntil ?? 0) <= now))
}

/** Settings › Second brain › The loop. */
export type LoopView = {
  jobs: JobStatus[]
  /** The evening filing, waiting for you to apply it. */
  filing: { date: string; moves: Move[]; applied: boolean } | null
  card: MorningCard | null
  running: JobId | null
}
