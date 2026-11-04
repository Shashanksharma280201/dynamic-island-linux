import type { PhoneView } from './islandTypes'
import type { Route } from './protocol'

/** The link's types, apart from the link itself (no React Native here, so they can be shared and tested). */

/** The island's live view on this phone. */
export type Live = { phase: 'off' | 'connecting' | 'live' | 'offline'; view?: PhoneView; seenAt?: number; error?: string }

export type Phase = 'finding' | 'ready' | 'offline'
/**
 * How the link is: looking for the computer, found (where, by which route,
 * how quick the last round trip was), or not reachable and why. `scanning`
 * while it looks for the computer across this Wi-Fi (its address changed).
 */
export type LinkState = { phase: Phase; error?: string; url?: string; route?: Route; ms?: number; checkedAt?: number; scanning?: boolean }

/** What the link is doing now, as the link figure shows it. */
export type LinkMode = 'searching' | 'live' | 'sending' | 'receiving' | 'offline'
