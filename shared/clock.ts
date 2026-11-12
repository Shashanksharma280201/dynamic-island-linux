/**
 * The time on the notch: hours and minutes as the computer's locale writes
 * them, without AM/PM (like a phone's status bar), and the whole date and
 * time for its tooltip. Pure.
 */
export function clockText(at: Date, locale?: string, hour12?: boolean): string {
  const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', ...(hour12 === undefined ? {} : { hour12 }) }).formatToParts(at)
  return parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim()
}

/** "Tuesday, 11 November, 9:41 PM" for the clock's tooltip. Pure. */
export function clockTitle(at: Date, locale?: string, hour12?: boolean): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', ...(hour12 === undefined ? {} : { hour12 }) }).format(at)
}

/** Milliseconds until the next minute starts, so the clock turns over on time. Pure. */
export function msToNextMinute(now: number): number {
  return 60_000 - (now % 60_000)
}
