/** "now", "5m", "3h", "Tue", "12 Oct". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const d = new Date(at)
  if (s < 6 * 86400) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// The island's own words for times and costs, written out here: the app's
// bundle holds only its own code (tests/phoneApp.test.ts checks they match).

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-11-09" → "Monday, 9 November" (anything else as it is). */
export function dayTitle(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "14:05", in this phone's time. */
export function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "0 ¢", "0.03 ¢", "1.2 ¢", "$0.31". */
export function money(usd: number | null): string {
  if (usd === null) return 'cost not known'
  if (usd === 0) return '0 ¢'
  const cents = usd * 100
  if (cents < 0.01) return '<0.01 ¢'
  if (cents < 100) return `${cents < 1 ? cents.toFixed(2) : cents.toFixed(1)} ¢`
  return `$${usd.toFixed(2)}`
}

/** "local model · 1.4 s · 0 ¢": where an answer ran, how long it took, what it cost. */
export function answerLine(m: { where: string; label: string; ms: number; cost: number | null }): string {
  const secs = m.ms < 1000 ? `${Math.max(0.1, Math.round(m.ms / 100) / 10)} s` : `${(m.ms / 1000).toFixed(1)} s`
  return `${m.where === 'local' ? 'local model' : m.label} · ${secs} · ${money(m.cost)}`
}
