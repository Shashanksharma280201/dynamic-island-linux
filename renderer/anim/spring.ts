// One spring per job, used everywhere (see the design boards, 02).
// Framer Motion keeps the current velocity when a spring is retargeted, so
// every one of these can be interrupted halfway without a kink.

/** The island growing: a capsule opening into a card or the panel (~2% overshoot). */
export const islandOpen = { type: 'spring', stiffness: 420, damping: 32, mass: 1 } as const
/** The island shrinking back: no bounce. */
export const islandClose = { type: 'spring', stiffness: 520, damping: 48, mass: 1 } as const
/** Small things popping in: chips, badges, the rail. */
export const pop = { type: 'spring', stiffness: 640, damping: 30, mass: 1 } as const
/** The character's squash, hops and wobbles. */
export const boing = { type: 'spring', stiffness: 300, damping: 12, mass: 1 } as const

/** Default for layout morphs that are neither clearly opening nor closing. */
export const spring = islandOpen

/**
 * Content hand-off: the old content leaves fast while the new one starts a
 * little later, so the two overlap and the island is never empty.
 */
export const contentOut = { duration: 0.11, ease: [0.4, 0, 1, 1] } as const
export const contentIn = { duration: 0.22, delay: 0.06, ease: [0, 0, 0.2, 1] } as const

/**
 * How big a presentation is, to pick the open or close spring. Pure.
 * Resting shapes < peek < cards < the panel.
 */
export function sizeRank(key: string): number {
  if (key === 'panel') return 3
  if (key === 'idle' || key.startsWith('compact:') || key.startsWith('minimal:')) return 0
  if (key.startsWith('peek:') || key.startsWith('hello:')) return 1
  return 2
}

/** The spring for going from one presentation to the next. Pure. */
export function morphSpring(from: string, to: string) {
  return sizeRank(to) < sizeRank(from) ? islandClose : islandOpen
}
