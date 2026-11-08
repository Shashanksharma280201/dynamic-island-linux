/**
 * The Jarvis layer: the buddy as a voice in front of the real agents. The
 * pure parts: what you meant by interrupting, yes and no, the tags its
 * answers can carry, when it may speak up, the wake word and routines.
 */
import type { Schedule } from './loop'

/** While a task runs, what you said: how's it going, stop, or a change of plan. Pure. */
export function interruptKind(text: string): 'status' | 'cancel' | 'steer' {
  const t = text.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/^(stop|cancel|abort|never ?mind|forget it|kill it|stop it|stop that)\b/.test(t)) return 'cancel'
  if (/\b(how far|how long|how'?s it going|how is it going|what'?s (it|happening|going on)|what are you doing|status|are you done|is it done|progress)\b/.test(t)) return 'status'
  return 'steer'
}

/** Yes, no or always, for a pending approval. Pure. */
export function approvalWord(text: string): 'allow' | 'deny' | 'always' | null {
  const t = text.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/^always( allow)?( it)?$/.test(t)) return 'always'
  if (/^(yes|yeah|yep|yup|allow( it)?|go ahead|do it|ok|okay|sure|approve( it)?|let it)( please)?$/.test(t)) return 'allow'
  if (/^(no|nope|nah|don'?t|do not|deny( it)?|don'?t allow( it)?|reject( it)?)( please)?$/.test(t)) return 'deny'
  return null
}

export type BuddyAction =
  /** Real work for the assistant (Claude Code or the island's AI). */
  | { t: 'do'; task: string }
  /** Something about you worth keeping: you approve it first. */
  | { t: 'remember'; fact: string }
  /** Click or type for you: shown first, done only on your yes. */
  | { t: 'click'; x: number; y: number; label: string }
  | { t: 'type'; text: string }

const TAG = /\[(DO|REMEMBER|CLICK|TYPE):\s*([^\]]*)\]/gi

/** The answer without its action tags, and the actions in order. Pure (clicks in screenshot pixels). */
export function parseActions(text: string): { speech: string; actions: BuddyAction[] } {
  const actions: BuddyAction[] = []
  const speech = text
    .replace(TAG, (_all, kind: string, body: string) => {
      const b = body.trim()
      const k = kind.toUpperCase()
      if (k === 'DO' && b) actions.push({ t: 'do', task: b.slice(0, 2000) })
      else if (k === 'REMEMBER' && b) actions.push({ t: 'remember', fact: b.slice(0, 300) })
      else if (k === 'TYPE' && b) actions.push({ t: 'type', text: b.slice(0, 2000) })
      else if (k === 'CLICK') {
        const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*:\s*(.*))?$/.exec(b)
        if (m) actions.push({ t: 'click', x: Number(m[1]), y: Number(m[2]), label: (m[3] ?? '').trim().slice(0, 60) })
      }
      return ' '
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,!?;:])/g, '$1')
    .trim()
  return { speech, actions }
}

/** What the buddy says when the assistant is busy: the step it's on, in a few words. Pure. */
export function statusLine(run: { phase: string; tool?: string; steps?: number } | null, startedAt: number, now: number): string {
  if (!run || ['done', 'error', 'stopped'].includes(run.phase)) return 'Nothing’s running.'
  const mins = Math.max(0, Math.round((now - startedAt) / 60_000))
  const time = mins < 1 ? 'just started' : `${mins} minute${mins === 1 ? '' : 's'} in`
  const doing = run.tool ? run.tool.replace(/[.…]+$/, '') : run.phase === 'writing' ? 'Writing the answer' : 'Thinking'
  return `${doing}. ${time[0].toUpperCase()}${time.slice(1)}${run.steps ? `, ${run.steps} step${run.steps === 1 ? '' : 's'} done` : ''}.`
}

// --------------------------------------------------- speaking up, sparingly ----

export type AlertPriority = 'high' | 'medium' | 'low'
export type AlertsConfig = { speak: boolean; quietFrom: number; quietTo: number; perHour: number }
export const ALERT_DEFAULTS: AlertsConfig = { speak: true, quietFrom: 22, quietTo: 8, perHour: 4 }

/** Is this hour in the quiet hours (which may wrap past midnight)? Pure. */
export function inQuietHours(hour: number, c: AlertsConfig): boolean {
  if (c.quietFrom === c.quietTo) return false
  return c.quietFrom < c.quietTo ? hour >= c.quietFrom && hour < c.quietTo : hour >= c.quietFrom || hour < c.quietTo
}

/** Why something wasn't said out loud. */
export type KeptWhy = 'medium' | 'low' | 'muted' | 'quiet-hours' | 'dismissed' | 'repeat' | 'limit'

/**
 * Speak now, only show it, or keep it for the evening, and why: high only is
 * spoken, never in quiet hours, never twice in three days, at most a few an
 * hour, and not a kind you keep dismissing. Pure.
 */
export function alertDecision(o: {
  priority: AlertPriority
  key: string
  kind: string
  now: number
  config: AlertsConfig
  /** When each key was last spoken. */
  spoken: Record<string, number>
  /** How many times you dismissed each kind without acting. */
  dismissed: Record<string, number>
}): { way: 'speak' | 'show' | 'digest'; why: KeptWhy | null } {
  if (o.priority === 'low') return { way: 'digest', why: 'low' }
  if (o.priority === 'medium') return { way: 'show', why: 'medium' }
  if (!o.config.speak) return { way: 'show', why: 'muted' }
  if (inQuietHours(new Date(o.now).getHours(), o.config)) return { way: 'show', why: 'quiet-hours' }
  if ((o.dismissed[o.kind] ?? 0) >= 3) return { way: 'show', why: 'dismissed' }
  if (o.now - (o.spoken[o.key] ?? -Infinity) < 72 * 3_600_000) return { way: 'show', why: 'repeat' }
  const lastHour = Object.values(o.spoken).filter((t) => o.now - t < 3_600_000).length
  return lastHour >= o.config.perHour ? { way: 'show', why: 'limit' } : { way: 'speak', why: null }
}

/** Speak now, only show it, or keep it for the evening. Pure. */
export function alertWay(o: Parameters<typeof alertDecision>[0]): 'speak' | 'show' | 'digest' {
  return alertDecision(o).way
}

// ------------------------------------------------------------ wake word ----

/** "Hey Sparky, what's…" → what follows the name ('' for the name alone), or null. Pure. */
export function wakeMatch(text: string, name: string): string | null {
  const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  if (!n) return null
  const t = text.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim()
  const m = new RegExp(`^(?:(?:hey|hi|ok|okay|yo)\\s+)?${n.replace(/\s+/g, '\\s+')}\\b\\s*(.*)$`).exec(t)
  if (!m) return null
  // The name alone at the start only counts after a greeting or as a whole call.
  if (!/^(hey|hi|ok|okay|yo)\b/.test(t) && m[1] && !/^(what|where|how|why|who|when|can|could|would|please|open|show|tell|walk|set|find|is|are|do|does)\b/.test(m[1])) return null
  // Keep the original words (with their case) after the name.
  const words = text.trim().split(/\s+/)
  const skip = t.split(' ').length - (m[1] ? m[1].split(' ').length : 0)
  return words.slice(skip).join(' ').replace(/^[,.!?\s]+/, '')
}

// ------------------------------------------------------------- routines ----

export type Routine = {
  id: string
  name: string
  when: Schedule
  /** What it asks the assistant, as you'd say it. */
  ask: string
  on: boolean
  lastRun: number
}

/** A routine as saved, checked (a time, a name and what to ask). Pure. */
export function parseRoutine(raw: any): Routine | null {
  if (!raw || typeof raw !== 'object') return null
  const hour = Number(raw.when?.hour)
  const minute = Number(raw.when?.minute)
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : ''
  const ask = typeof raw.ask === 'string' ? raw.ask.trim().slice(0, 2000) : ''
  if (!name || !ask || !(hour >= 0 && hour < 24) || !(minute >= 0 && minute < 60)) return null
  const wd = raw.when?.weekday
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : `r${Math.abs(hashCode(name + ask))}`,
    name,
    ask,
    on: raw.on !== false,
    lastRun: typeof raw.lastRun === 'number' ? raw.lastRun : 0,
    when: { hour: Math.floor(hour), minute: Math.floor(minute), ...(Number.isInteger(wd) && wd >= 0 && wd <= 6 ? { weekday: wd } : {}) },
  }
}

function hashCode(s: string): number {
  let h = 0
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return h
}

/** Routines to start with (off until you turn them on). */
export const ROUTINE_EXAMPLES: Omit<Routine, 'id' | 'lastRun'>[] = [
  { name: 'End-of-day wrap', when: { hour: 18, minute: 30 }, ask: 'Wrap up my day in three lines: what got done, what’s waiting on me, and the first thing for tomorrow. Use my brain and today’s sessions.', on: false },
  { name: 'Weekly review', when: { hour: 17, minute: 0, weekday: 5 }, ask: 'Review my week from my brain: what I shipped, promises still open, and one thing to drop next week.', on: false },
]
