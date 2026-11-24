/**
 * The arc of the volume dial: a shallow bow across the card, a level from 0
 * to 1 along it. Pure, so it can be tested.
 */

export type Arc = {
  /** The circle the bow is part of: its middle and how big it is. */
  cx: number
  cy: number
  r: number
  /** Half the angle the bow spans, either side of straight up. */
  half: number
}

/**
 * The bow for a space `width` across: `inset` in from each side, rising
 * `rise` from its ends to its top, the top at `top`.
 */
export function arcOf(width: number, inset: number, rise: number, top: number): Arc {
  const chord = Math.max(1, width - inset * 2)
  const s = Math.max(1, rise)
  const r = (chord * chord) / (8 * s) + s / 2
  return { cx: width / 2, cy: top + r, r, half: Math.asin(Math.min(1, chord / 2 / r)) }
}

/** Where a level (0 at the left end, 1 at the right) is on the bow, `out` beyond it. */
export function arcPoint(a: Arc, t: number, out = 0): { x: number; y: number } {
  const th = (Math.min(1, Math.max(0, t)) * 2 - 1) * a.half
  return { x: a.cx + (a.r + out) * Math.sin(th), y: a.cy - (a.r + out) * Math.cos(th) }
}

/** The level under a finger at `x`: 0 at the bow's left end, 1 at its right, held at the ends. */
export function arcValue(a: Arc, x: number): number {
  const s = Math.max(-1, Math.min(1, (x - a.cx) / a.r))
  return Math.max(0, Math.min(1, (Math.asin(s) / a.half + 1) / 2))
}

/** The bow from one level to another, as an SVG path. */
export function arcPath(a: Arc, from: number, to: number): string {
  const p = arcPoint(a, from)
  const q = arcPoint(a, to)
  const n = (v: number) => Math.round(v * 100) / 100
  return `M${n(p.x)} ${n(p.y)}A${n(a.r)} ${n(a.r)} 0 0 1 ${n(q.x)} ${n(q.y)}`
}
