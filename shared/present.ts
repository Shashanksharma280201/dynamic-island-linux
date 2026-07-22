import type { Activity } from './types'

export type Presentation =
  | { mode: 'idle' }
  | { mode: 'compact'; primary: Activity }
  | { mode: 'minimal'; primary: Activity; detached: Activity }
  | { mode: 'expanded'; primary: Activity }

/**
 * Pure selector: given the current activities and whether the island is
 * hover-expanded, decide which Dynamic-Island presentation to render.
 * - 0 activities        → idle pill
 * - approval OR hover   → expanded (approvals always need attention)
 * - 2+ ambient          → minimal (highest priority attached, 2nd detached)
 * - 1 ambient           → compact
 */
export function present(list: Activity[], opts: { expanded: boolean }): Presentation {
  if (list.length === 0) return { mode: 'idle' }
  const sorted = [...list].sort((a, b) => b.priority - a.priority)
  const primary = sorted[0]
  if (primary.kind === 'approval' || opts.expanded) return { mode: 'expanded', primary }
  if (sorted.length >= 2) return { mode: 'minimal', primary, detached: sorted[1] }
  return { mode: 'compact', primary }
}
