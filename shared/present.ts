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

/**
 * Pure selector: given the current activities and whether the island is
 * hover-expanded, decide which Dynamic-Island presentation to render.
 * - 0 activities                     → idle pill
 * - approval / notification OR hover → expanded card
 * - 2+ ambient                       → minimal (attached pill + detached circle)
 * - 1 ambient                        → compact
 * `queued` counts further activities of the same kind waiting behind primary.
 */
export function present(list: Activity[], opts: { expanded: boolean }): Presentation {
  if (list.length === 0) return { mode: 'idle' }
  const sorted = [...list].sort(byPresentationOrder)
  const primary = sorted[0]
  const queued = sorted.filter((a) => a !== primary && a.kind === primary.kind).length
  if (primary.kind === 'approval' || primary.kind === 'notification' || opts.expanded)
    return { mode: 'expanded', primary, queued }
  if (sorted.length >= 2) return { mode: 'minimal', primary, detached: sorted[1], queued }
  return { mode: 'compact', primary, queued }
}
