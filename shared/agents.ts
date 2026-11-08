/**
 * Island OS agents: work that goes on while you don't. Monitors that watch
 * for something and tell you once; research over your own brain, with
 * sources; and the roster that tends the brain (People: who you were in
 * touch with and what you promised them; Projects: what moved and what's
 * gone quiet; Inbox: the evening filing). Pure functions.
 */
import { dateOf } from './brain'

// ------------------------------------------------------------ monitors ----

export type MonitorKind = 'pr-review' | 'pr-merged' | 'ci' | 'url' | 'mention' | 'file'

export type Monitor = {
  id: string
  kind: MonitorKind
  /** What you asked, in your words. */
  text: string
  /** owner/repo for GitHub; the address for url; the words for mention; the path for file. */
  target: string
  /** The pull request's number, or the branch for ci. */
  ref?: string
  created: number
  /** Watching, or told you (and when, and what). */
  state: 'watching' | 'done' | 'failed'
  last?: number
  /** What it saw last time (to notice a change). */
  seen?: string
  said?: string
  error?: string
}

export const MONITOR_LIMIT = 30

/**
 * "Tell me when PR #43 is reviewed", "…when me/island#43 is merged", "…when
 * CI on me/island main finishes", "…when https://example.com changes",
 * "…when anyone mentions Acme", "…when ~/Downloads/report.pdf appears".
 * `repo` fills in a pull request without one. Null when it isn't one of
 * these. Pure.
 */
export function parseMonitor(text: string, repo = ''): Omit<Monitor, 'id' | 'created' | 'state'> | null {
  const t = text.trim().replace(/^(?:please\s+)?(?:tell|let|ping|notify)\s+me\s+(?:know\s+)?(?:when|if|once)\s+/i, '').replace(/[.!?]+$/, '')
  const url = /\b(https?:\/\/[^\s]+?)\s+(?:changes|is updated|updates|changes again)\b/i.exec(t)
  if (url) return { kind: 'url', text, target: url[1] }
  const pr = /(?:\b(?:pr|pull request)\s*#?\s*(\d{1,6})|\b([\w.-]+\/[\w.-]+)#(\d{1,6}))(?:\s+(?:in|on|of)\s+([\w.-]+\/[\w.-]+))?\s+(?:is\s+|gets\s+|has\s+been\s+)?(reviewed|approved|merged|closed)\b/i.exec(t)
  if (pr) {
    const target = pr[2] ?? pr[4] ?? repo
    if (!target) return null
    return { kind: /merged|closed/i.test(pr[5]) ? 'pr-merged' : 'pr-review', text, target, ref: pr[1] ?? pr[3] }
  }
  const ci = /\b(?:ci|the build|checks|tests?)\s+(?:on|for|in)\s+([\w.-]+\/[\w.-]+)(?:\s+(?:on\s+)?([\w./-]+))?\s+(?:finishes|passes|fails|is done|completes|goes green|goes red)\b/i.exec(t)
  if (ci) return { kind: 'ci', text, target: ci[1], ref: ci[2] && !/^(finishes|passes|fails)$/i.test(ci[2]) ? ci[2] : undefined }
  const mention = /\b(?:anyone|someone|somebody|a message|mail|an? email)\s+(?:mentions|says|talks about|is about|about)\s+["“]?(.{2,60}?)["”]?$/i.exec(t)
  if (mention) return { kind: 'mention', text, target: mention[1].trim() }
  // A path: ~/…, /…, or a Windows one (C:\\…).
  const file = /((?:~|\/|[A-Za-z]:[\\/])[^\s]+)\s+(?:appears|exists|is there|changes|is saved)\b/i.exec(t)
  if (file) return { kind: 'file', text, target: file[1] }
  return null
}

/** What GitHub says about a pull request (gh pr view --json state,reviews,mergedAt,title). */
export type PrInfo = { state?: string; title?: string; mergedAt?: string | null; reviews?: { state?: string; author?: { login?: string } }[] }

/** Is it time to tell you, and what to say; null to keep watching. Pure. */
export function judgePr(m: Pick<Monitor, 'kind' | 'target' | 'ref'>, pr: PrInfo): string | null {
  const name = `${m.target}#${m.ref}${pr.title ? ` (${pr.title})` : ''}`
  if (m.kind === 'pr-merged') {
    if (pr.mergedAt || pr.state === 'MERGED') return `${name} was merged.`
    if (pr.state === 'CLOSED') return `${name} was closed without merging.`
    return null
  }
  const done = (pr.reviews ?? []).filter((r) => ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'].includes(String(r.state)))
  if (!done.length) return pr.state === 'MERGED' ? `${name} was merged (without a review).` : null
  const last = done[done.length - 1]
  const who = last.author?.login ? ` by ${last.author.login}` : ''
  return last.state === 'APPROVED' ? `${name} was approved${who}.` : last.state === 'CHANGES_REQUESTED' ? `${name}: changes requested${who}.` : `${name} was reviewed${who}.`
}

/** The latest run (gh run list --json status,conclusion,displayTitle,headBranch): finished? Pure. */
export function judgeCi(m: Pick<Monitor, 'target' | 'ref'>, runs: unknown, since: number): string | null {
  if (!Array.isArray(runs)) return null
  const r = (runs as { status?: string; conclusion?: string; displayTitle?: string; headBranch?: string; createdAt?: string; updatedAt?: string }[]).find((x) => !m.ref || x.headBranch === m.ref)
  if (!r || r.status !== 'completed') return null
  if (r.updatedAt && Date.parse(r.updatedAt) < since) return null
  const ok = r.conclusion === 'success'
  const title = r.displayTitle ? `: ${r.displayTitle}` : ''
  // GitHub ends a long title with "…"; no full stop after it.
  return `CI on ${m.target}${m.ref ? ` ${m.ref}` : ''} ${ok ? 'passed' : r.conclusion === 'cancelled' ? 'was cancelled' : 'failed'}${title}${/[.…!?]$/.test(title) ? '' : '.'}`
}

/** A page's text, without its markup and what changes on every load (times, tokens). Pure. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200_000)
}

/** A short, stable fingerprint of text (FNV-1a). Pure. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** The first of these texts that mentions the words (case aside). Pure. */
export function findMention(words: string, texts: { at: number; text: string; from?: string }[], since: number): { at: number; text: string; from?: string } | null {
  const w = words.toLowerCase()
  return texts.find((t) => t.at >= since && t.text.toLowerCase().includes(w)) ?? null
}

/** "Watching · checked 3 min ago" or "Told you: …". Pure. */
export function monitorLine(m: Monitor, now: number): string {
  if (m.state === 'done') return m.said ?? 'Told you.'
  if (m.state === 'failed') return m.error ?? 'Stopped.'
  const ago = m.last !== undefined ? Math.round((now - m.last) / 60_000) : null
  return ago === null ? 'Watching' : `Watching · checked ${ago < 1 ? 'just now' : `${ago} min ago`}`
}

// ------------------------------------------------------------ people ----

/**
 * Something you promised in a message you wrote ("I'll send the deck by
 * Friday", "will share the slides tomorrow", "let me get back to you").
 * Null when it isn't one. Pure.
 */
export function promiseIn(text: string): string | null {
  const s = text.replace(/\s+/g, ' ').trim()
  const m = /\b(?:I['’]ll|I will|I['’]m going to|will|let me|I can)\s+((?:send|share|get back|call|ping|email|mail|review|finish|fix|write|look into|check|book|set up|follow up|forward|bring|pay|deliver|ship)\b[^.!?\n,;]{0,90})/i.exec(s)
  if (!m) return null
  // A question isn't a promise ("will you send…?").
  if (/\bwill you\b/i.test(s.slice(Math.max(0, m.index - 6), m.index + 12))) return null
  return m[1].replace(/[,;:]+$/, '').trim()
}

/** When a promise is due, from its words ("by Friday", "tomorrow", "today", "next week"). Pure (local time). */
export function dueFrom(text: string, sent: number): string {
  const s = text.toLowerCase()
  const day = new Date(sent)
  day.setHours(12, 0, 0, 0)
  if (/\btoday\b|\btonight\b|\bthis evening\b/.test(s)) return dateOf(day.getTime())
  if (/\btomorrow\b/.test(s)) return dateOf(day.getTime() + 86_400_000)
  if (/\bnext week\b/.test(s)) return dateOf(day.getTime() + 7 * 86_400_000)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const d = days.findIndex((n) => new RegExp(`\\b(?:by |on |this )?${n}\\b`).test(s))
  if (d >= 0) {
    const ahead = (d - day.getDay() + 7) % 7 || 7
    return dateOf(day.getTime() + ahead * 86_400_000)
  }
  return ''
}

/** People notes whose name (or first name, when only one person has it) appears in a chat's name. Pure. */
export function personFor(chat: string, people: string[]): string | null {
  const c = chat.toLowerCase()
  const word = (w: string) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u')
  const full = people.find((p) => word(p.toLowerCase()).test(c))
  if (full) return full
  const firsts = new Map<string, string[]>()
  for (const p of people) {
    const f = p.split(/\s+/)[0].toLowerCase()
    if (f.length >= 3) firsts.set(f, [...(firsts.get(f) ?? []), p])
  }
  for (const [f, list] of firsts) if (list.length === 1 && word(f).test(c)) return list[0]
  return null
}

/** A promise as a line in the ledger (the same shape the brain's own tool writes). Pure. */
export function promiseLine(o: { date: string; what: string; to: string; due: string; source: string }): string {
  return [`- [ ] ${o.date}`, o.what, o.to ? `to [[${o.to}]]` : '', o.due ? `due ${o.due}` : '', `(${o.source})`].filter(Boolean).join(' · ')
}

/** "## Asha Rao\n- Last in touch: 2026-11-08 (WhatsApp, 3 messages)". Pure. */
export function peopleNote(contacts: { person: string; last: number; source: string; count: number }[], date: string): string {
  const rows = [...contacts].sort((a, b) => b.last - a.last)
  return `---\ntype: roster\nroster: people\ndate: ${date}\n---\n# People: who you were in touch with\n\nUpdated each evening from the messages and mail the brain keeps.\n\n${rows
    .map((r) => `- [[${r.person}]]: ${dateOf(r.last)} (${r.source}, ${r.count} message${r.count === 1 ? '' : 's'})`)
    .join('\n')}\n`
}

// ------------------------------------------------------------ projects ----

export type ProjectPulse = { name: string; last: number | null; moved: string[] }

/** "Moving: island (12 things this week) · Quiet: robot-arm (19 days)". As a note. Pure. */
export function projectsNote(list: ProjectPulse[], now: number, date: string): string {
  const day = 86_400_000
  const moving = list.filter((p) => p.last && now - p.last < 7 * day).sort((a, b) => b.moved.length - a.moved.length)
  const quiet = list.filter((p) => !p.last || now - p.last >= 14 * day)
  const between = list.filter((p) => !moving.includes(p) && !quiet.includes(p))
  const line = (p: ProjectPulse) => `- [[${p.name}]]${p.last ? ` (last ${dateOf(p.last)})` : ' (nothing yet)'}${p.moved.length ? `: ${p.moved.slice(0, 3).join('; ')}${p.moved.length > 3 ? `; and ${p.moved.length - 3} more` : ''}` : ''}`
  return `---\ntype: roster\nroster: projects\ndate: ${date}\n---\n# Projects: what moved\n\n## Moving this week\n\n${moving.map(line).join('\n') || 'None.'}\n\n## Slower\n\n${between.map(line).join('\n') || 'None.'}\n\n## Quiet for two weeks or more\n\n${quiet.map(line).join('\n') || 'None.'}\n`
}

// ------------------------------------------------------------ research ----

/** The model's plan: up to five questions, one per line. Pure. */
export function parsePlan(text: string, fallback: string): string[] {
  const qs = text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 3 && l.length < 200 && !/^(here|plan|questions?)\b.*:$/i.test(l))
  return (qs.length ? qs : [fallback]).slice(0, 5)
}

export type ResearchJob = {
  id: string
  question: string
  state: 'planning' | 'reading' | 'writing' | 'done' | 'failed' | 'consent'
  step: number
  steps: number
  started: number
  /** The note it wrote. */
  path?: string
  answer?: string
  error?: string
  /** Who answered (for the chip). */
  where?: 'local' | 'cloud'
  cost?: number | null
}

/** Where a research note is kept. Pure. */
export function researchPath(question: string, at: number): string {
  const slug =
    question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'research'
  return `04-resources/research/${dateOf(at)}-${slug}.md`
}

/** "Planning", "Reading 2 of 4", "Writing", "Done". Pure. */
export function researchLine(j: ResearchJob): string {
  switch (j.state) {
    case 'planning':
      return 'Planning'
    case 'reading':
      return `Reading ${j.step} of ${j.steps}`
    case 'writing':
      return 'Writing it up'
    case 'consent':
      return 'Waiting for your yes to use the cloud'
    case 'failed':
      return j.error ?? 'It didn’t finish.'
    case 'done':
      return 'Done'
  }
}
