/** m:ss (or h:mm:ss) for a number of seconds. Pure. */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** Current playback position, extrapolated from the last report. Pure. */
export function currentPosition(
  m: { position?: number; positionAt?: number; length?: number; playing: boolean },
  now: number,
): number {
  if (m.position === undefined) return 0
  const elapsed = m.playing && m.positionAt ? (now - m.positionAt) / 1000 : 0
  const p = m.position + Math.max(0, elapsed)
  return m.length ? Math.min(p, m.length) : p
}

/** Human label for a Claude permission rule suggestion, e.g. `Bash(npm test)`. Pure. */
export function ruleLabel(suggestions: unknown[] | undefined): string | null {
  const labels: string[] = []
  for (const s of suggestions ?? []) {
    const rules = (s as any)?.rules
    if (!Array.isArray(rules)) continue
    for (const r of rules) {
      if (typeof r?.toolName !== 'string') continue
      labels.push(r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName)
    }
  }
  return labels.length ? labels.join(', ') : null
}

const DAY = 86_400_000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * List timestamp in the style of Mail / Messages: "now", "5m", "14:05" today,
 * "Yesterday", a weekday within a week, else "12 Mar". Pure (local time).
 */
export function relativeTime(ts: number, now: number): string {
  const diff = now - ts
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  const d = new Date(ts)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  if (ts >= start) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (ts >= start - DAY) return 'Yesterday'
  if (ts >= start - 6 * DAY) return WEEKDAYS[d.getDay()]
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "Mon 12 Mar, 14:05" for a message header. Pure (local time). */
export function fullTime(ts: number): string {
  const d = new Date(ts)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${hm}`
}

/** "14:05". Pure (local time). */
export function clockTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Day divider in a conversation: "Today", "Yesterday", "Wednesday", "12 Mar 2025". Pure. */
export function dayLabel(ts: number, now: number): string {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  if (ts >= start) return 'Today'
  if (ts >= start - DAY) return 'Yesterday'
  if (ts >= start - 6 * DAY) return WEEKDAYS[new Date(ts).getDay()]
  const d = new Date(ts)
  const sameYear = d.getFullYear() === today.getFullYear()
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`
}

/** Local calendar-day key, for grouping messages by day. Pure. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** When a limit resets: "in 14 min", "in 2 h 14 min", or "Fri 09:00" beyond a day. Pure. */
export function resetText(ts: number, now: number): string {
  const ms = ts - now
  if (ms <= 0) return 'now'
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return `in ${min} min`
  if (ms < DAY) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `in ${h} h ${m} min` : `in ${h} h`
  }
  return `${WEEKDAYS[new Date(ts).getDay()].slice(0, 3)} ${clockTime(ts)}`
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". Pure. */
export function agoText(ts: number, now: number): string {
  const s = Math.max(0, (now - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
