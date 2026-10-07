import { useEffect, useState } from 'react'

/** Hover this long and the island peeks: one line about what's going on. */
export const PEEK_MS = 140
/** Keep hovering this much longer and the full card opens. */
export const FULL_MS = 600
/** After the pointer leaves, fold back this much later (forgives a slip). */
export const LEAVE_MS = 350

export type HoverStage = 'none' | 'peek' | 'full'

/** Where the hover goes next, and after how long; null when it stays. Pure. */
export function nextStage(stage: HoverStage, hovering: boolean): { stage: HoverStage; after: number } | null {
  if (!hovering) return stage === 'none' ? null : { stage: 'none', after: LEAVE_MS }
  if (stage === 'none') return { stage: 'peek', after: PEEK_MS }
  if (stage === 'peek') return { stage: 'full', after: FULL_MS }
  return null
}

/**
 * Hover intent: a stray pass over the island does nothing, a short rest
 * peeks, a longer one opens the card. Leaving folds it back after a moment.
 */
export function useHoverIntent(hovering: boolean): HoverStage {
  const [stage, setStage] = useState<HoverStage>('none')
  useEffect(() => {
    const next = nextStage(stage, hovering)
    if (!next) return
    const t = setTimeout(() => setStage(next.stage), next.after)
    return () => clearTimeout(t)
  }, [hovering, stage])
  return stage
}
