import { useSyncExternalStore } from 'react'

/** Files on the move right now, for the link figure and the status line: which way, what, how far. */
export type Activity = { kind: 'sending' | 'receiving'; label: string; progress: number } | null

let current: Activity = null
const subs = new Set<() => void>()

export function setActivity(a: Activity): void {
  current = a
  for (const s of subs) s()
}

export const getActivity = (): Activity => current

export function useActivity(): Activity {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => void subs.delete(cb)
    },
    () => current,
  )
}
