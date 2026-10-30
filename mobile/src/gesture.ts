import type { Side } from './protocol'

/**
 * Where a file you're dragging is heading. Hold your phone next to the
 * computer and flick the file toward it: toward the phone's left edge means
 * the computer is on your left, so the file comes in at the computer's right
 * edge. Pure.
 */

/** How close to an edge counts as "heading out", as a share of the screen. */
const ZONE_X = 0.24
const ZONE_Y = 0.16
/** Let go this close (0-1, 1 = at the edge) and it's sent. */
export const SEND_AT = 0.55
/** Or flicked at least this fast (px/ms) toward an edge, this far from where it started. */
const FLICK_SPEED = 0.9
const FLICK_TRAVEL = 50

export type Aim = { edge: Side; closeness: number; along: number }

/** The edge the finger is nearest to, and how close (0 far, 1 at it); null if it's in the middle. */
export function aim(x: number, y: number, w: number, h: number): Aim | null {
  'worklet'
  const options: Aim[] = [
    { edge: 'left', closeness: 1 - x / (w * ZONE_X), along: y / h },
    { edge: 'right', closeness: 1 - (w - x) / (w * ZONE_X), along: y / h },
    { edge: 'top', closeness: 1 - y / (h * ZONE_Y), along: x / w },
    { edge: 'bottom', closeness: 1 - (h - y) / (h * ZONE_Y), along: x / w },
  ]
  const best = options.reduce((a, b) => (b.closeness > a.closeness ? b : a))
  if (best.closeness <= 0) return null
  return { edge: best.edge, closeness: Math.min(1, best.closeness), along: Math.min(1, Math.max(0, best.along)) }
}

/** Let go at (x, y) moving at (vx, vy) px/ms, having moved (dx, dy): the edge it's sent out of, or null. */
export function release(x: number, y: number, vx: number, vy: number, dx: number, dy: number, w: number, h: number): Aim | null {
  'worklet'
  const a = aim(x, y, w, h)
  if (a && a.closeness >= SEND_AT) return a
  const speed = Math.hypot(vx, vy)
  if (speed < FLICK_SPEED) return null
  const edge: Side = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'top' : 'bottom'
  const travel = edge === 'left' ? -dx : edge === 'right' ? dx : edge === 'top' ? -dy : dy
  if (travel < FLICK_TRAVEL) return null
  return { edge, closeness: 1, along: edge === 'left' || edge === 'right' ? Math.min(1, Math.max(0, y / h)) : Math.min(1, Math.max(0, x / w)) }
}

/** The computer's edge the file comes in at: the opposite one. */
export function computerSide(phoneEdge: Side): Side {
  'worklet'
  return phoneEdge === 'left' ? 'right' : phoneEdge === 'right' ? 'left' : phoneEdge === 'top' ? 'bottom' : 'top'
}

/** The edges as numbers, for the UI thread: 0 left, 1 right, 2 top, 3 bottom. */
export const EDGES: Side[] = ['left', 'right', 'top', 'bottom']

/** Where to fly the file out of the screen: past the edge. */
export function exitPoint(edge: Side, x: number, y: number, w: number, h: number, size: number): { x: number; y: number } {
  'worklet'
  if (edge === 'left') return { x: -size * 1.4, y }
  if (edge === 'right') return { x: w + size * 1.4, y }
  if (edge === 'top') return { x, y: -size * 1.4 }
  return { x, y: h + size * 1.4 }
}
