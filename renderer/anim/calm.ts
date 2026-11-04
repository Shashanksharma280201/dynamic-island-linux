import { useSyncExternalStore } from 'react'

/**
 * Whether the island's ever-moving decorations (the orbs) rest: you're away
 * from the computer or its screen is locked, as the main process tells it.
 * Nothing else stops: cards, reactions and updates carry on.
 */
let calm = false
const subs = new Set<(calm: boolean) => void>()

export const isCalm = (): boolean => calm

export function setCalm(next: boolean): void {
  if (next === calm) return
  calm = next
  for (const cb of subs) cb(calm)
}

export function onCalm(cb: (calm: boolean) => void): () => void {
  subs.add(cb)
  return () => void subs.delete(cb)
}

export const useCalm = (): boolean => useSyncExternalStore(onCalm, isCalm)

// The island's window hears it from the main process; other windows stay lively.
if (typeof window !== 'undefined') window.island?.onCalm?.(setCalm)
