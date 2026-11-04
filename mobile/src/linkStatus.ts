import type { Activity } from './activity'
import type { LinkMode, LinkState, Live } from './linkTypes'
import { routeName } from './protocol'
import { ago } from './words'

/** What the link is doing, for the figure and the status line. Pure. */
export function linkMode(state: LinkState, live: Live, act: Activity): LinkMode {
  if (act) return act.kind
  if (state.phase === 'finding') return 'searching'
  if (state.phase === 'offline') return 'offline'
  if (live.phase === 'live') return 'live'
  return live.phase === 'offline' ? 'offline' : 'searching'
}

/** The figure's readout: the route and the round trip, or what's happening. Pure. */
export function linkReadout(mode: LinkMode, state: LinkState, live: Live, act: Activity, now = Date.now()): string {
  if (act) return `${act.label.length > 22 ? `${act.label.slice(0, 21)}…` : act.label} · ${Math.round(act.progress * 100)}%`
  if (mode === 'searching') return state.scanning ? 'Searching this Wi-Fi…' : 'Looking for it…'
  if (mode === 'offline') return live.seenAt ? `Offline · seen ${ago(live.seenAt, now)}` : 'Offline'
  return `${state.route ? routeName(state.route) : 'Connected'}${state.ms != null ? ` · ${state.ms} ms` : ''}`
}

/** The status line under the computer's name. Pure. */
export function linkStatus(mode: LinkMode): string {
  return mode === 'live' ? 'Connected' : mode === 'searching' ? 'Connecting…' : mode === 'offline' ? 'Can’t reach it' : mode === 'sending' ? 'Sending' : 'Receiving'
}

