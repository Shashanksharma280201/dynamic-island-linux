import type { Activity, ToolRequest } from './types'
import { byPresentationOrder } from './present'
import { ruleLabel } from './format'

/**
 * Answer the approval card from anywhere, without the island taking keyboard
 * focus: a plain Y or N could otherwise approve a command while you were
 * typing in another app. These chords are only grabbed while a card waits.
 */
export const APPROVAL_KEYS = {
  allow: 'Control+Alt+Y',
  deny: 'Control+Alt+N',
  always: 'Control+Alt+A',
} as const
export type ApprovalKey = keyof typeof APPROVAL_KEYS

/** The approval on screen: the first one asked (they queue in order). Pure. */
export function frontApproval(list: Activity[]): ToolRequest | null {
  const a = list.filter((x) => x.kind === 'approval').sort(byPresentationOrder)[0]
  return a?.kind === 'approval' ? a.request : null
}

/** Whether a request offers "Always Allow" (Claude suggested a rule). Pure. */
export function canAlways(r: ToolRequest): boolean {
  return !r.ask && !!ruleLabel(r.suggestions)
}

/** "⌃⌥Y" on a Mac, "Ctrl+Alt+Y" elsewhere. Pure. */
export function keyLabel(accel: string, mac: boolean): string {
  if (!mac) return accel.replace('Control', 'Ctrl')
  return accel
    .split('+')
    .map((k) => ({ Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' })[k] ?? k)
    .join('')
}
