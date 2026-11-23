import type { Activity } from './types'

export type Presentation =
  | { mode: 'idle' }
  | { mode: 'compact'; primary: Activity; queued: number }
  | { mode: 'minimal'; primary: Activity; detached: Activity; queued: number }
  | { mode: 'expanded'; primary: Activity; queued: number }

/**
 * Presentation order: higher priority first. Within a priority, approvals are
 * first-come-first-served (answer them in the order Claude asked) while
 * everything else shows the newest first.
 */
export function byPresentationOrder(a: Activity, b: Activity): number {
  if (b.priority !== a.priority) return b.priority - a.priority
  const sa = a.seq ?? 0
  const sb = b.seq ?? 0
  return a.kind === 'approval' && b.kind === 'approval' ? sa - sb : sb - sa
}

/** Shows as a card by itself (it needs you, or it's a result); the rest sit quietly on the capsule. Pure. */
export function isCard(a: Activity): boolean {
  return (
    a.kind === 'approval' ||
    a.kind === 'notification' ||
    a.kind === 'message' ||
    // Claude's answer shows as a card; while working it stays a small orb.
    (a.kind === 'claude' && !['starting', 'thinking', 'tool', 'writing'].includes(a.run.phase)) ||
    // A session in a terminal: a card when it's done or stuck, a small orb while it works.
    (a.kind === 'session' && a.session.phase !== 'working') ||
    // A drag action: a pill with its progress, then the result to use.
    a.kind === 'job'
  )
}

/** How many quiet things are going on at once before the capsule takes turns: with two, both already show. */
export const TURNS_FROM = 3
/** How long each one has the capsule. */
export const TURN_MS = 6000

/**
 * What the capsule takes turns through: every quiet activity, most important
 * first; empty when there's nothing to take turns over (fewer than three, a
 * card is up, or a call is being recorded: its red dot stays put). Pure.
 */
export function turnTakers(list: Activity[]): Activity[] {
  const sorted = [...list].sort(byPresentationOrder)
  if (!sorted.length || isCard(sorted[0]) || sorted[0].kind === 'call') return []
  const quiet = sorted.filter((a) => !isCard(a))
  return quiet.length >= TURNS_FROM ? quiet : []
}

/**
 * Pure selector: given the current activities and whether the island is
 * hover-expanded, decide which Dynamic-Island presentation to render.
 * - 0 activities                     → idle pill
 * - approval / notification / message OR hover → expanded card
 * - 2+ ambient                       → minimal (attached pill + detached circle)
 * - 1 ambient                        → compact
 * `queued` counts further activities of the same kind waiting behind primary.
 *
 * `turn`: with three or more quiet activities the capsule can't show them
 * all, so it takes turns: the capsule shows the `turn`-th, the circle the one
 * after it. (Hovering opens the one that's showing.)
 */
export function present(list: Activity[], opts: { expanded: boolean; turn?: number }): Presentation {
  if (list.length === 0) return { mode: 'idle' }
  const sorted = [...list].sort(byPresentationOrder)
  const takers = opts.turn === undefined ? [] : turnTakers(list)
  const at = takers.length ? ((opts.turn! % takers.length) + takers.length) % takers.length : 0
  const primary = takers.length ? takers[at] : sorted[0]
  const queued = sorted.filter((a) => a !== primary && a.kind === primary.kind).length
  if (isCard(primary) || opts.expanded) return { mode: 'expanded', primary, queued }
  if (takers.length) return { mode: 'minimal', primary, detached: takers[(at + 1) % takers.length], queued }
  if (sorted.length >= 2) return { mode: 'minimal', primary, detached: sorted[1], queued }
  return { mode: 'compact', primary, queued }
}
