/**
 * The day by the hour, as the Today chart draws it: a column for each hour,
 * so many squares high. Pure, so it can be tested.
 */

export type DayColumn = {
  hour: number
  /** How many things happened in that hour. */
  count: number
  /** How many squares it's drawn with (none for an empty hour). */
  cells: number
}

/** The most squares a column gets: on a fuller day each square stands for a few things. */
export const DAY_ROWS = 7

/**
 * The columns to draw: every hour from the first with something in it (nine
 * at the latest) to the last (six in the evening at the earliest, and never
 * short of now), each with its count and its height in squares.
 */
export function dayColumns(hours: { hour: number; count: number }[], now: number): DayColumn[] {
  const by = new Map<number, number>()
  for (const h of hours) {
    const hour = Math.floor(h.hour)
    if (hour >= 0 && hour <= 23 && h.count > 0) by.set(hour, (by.get(hour) ?? 0) + h.count)
  }
  const at = Math.min(23, Math.max(0, Math.floor(now)))
  const active = [...by.keys()]
  const lo = Math.min(9, at, ...active)
  const hi = Math.max(18, at, ...active)
  const per = Math.max(1, Math.ceil(Math.max(0, ...by.values()) / DAY_ROWS))
  return Array.from({ length: hi - lo + 1 }, (_, i) => {
    const count = by.get(lo + i) ?? 0
    return { hour: lo + i, count, cells: count ? Math.ceil(count / per) : 0 }
  })
}

/**
 * Which columns to name on the chart (their indexes, at most three): the
 * busiest hours, each the tallest within `reach` columns either side (so its
 * label has clear air above it) and at least twice that from the next one
 * named (so two labels never meet). The busiest first; between equals, the later.
 */
export function dayPeaks(cols: DayColumn[], reach: number): number[] {
  const tops = cols
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.count > 0 && cols.slice(Math.max(0, i - reach), i + reach + 1).every((o) => o.cells <= c.cells))
    .sort((a, b) => b.c.count - a.c.count || b.i - a.i)
  const named: number[] = []
  for (const { i } of tops) {
    if (named.length === 3) break
    if (named.every((j) => Math.abs(j - i) >= 2 * reach)) named.push(i)
  }
  return named.sort((a, b) => a - b)
}
