import type { Rect } from './hitbox'

export type Side = 'left' | 'right'

/** Where the island is docked: a screen side and the vertical position of its
 * center as a fraction (0 = top, 1 = bottom) of the work area height. */
export type Dock = { side: Side; y: number }

export const DEFAULT_DOCK: Dock = { side: 'right', y: 0.3 }

/** Width of the transparent window column the island lives in: the widest
 * panel plus its icon rail (~430px) with room for the drop shadow to fade out
 * before the window edge (it would be cut off in a straight line). */
export const COLUMN_WIDTH = 560

/** Gap between the island and the screen edge / top / bottom, in px. */
export const EDGE_MARGIN = 10

/** Validate a stored/IPC dock value, falling back to the default. Pure. */
export function parseDock(raw: any): Dock {
  const side: Side = raw?.side === 'left' ? 'left' : raw?.side === 'right' ? 'right' : DEFAULT_DOCK.side
  const y = Number(raw?.y)
  return { side, y: Number.isFinite(y) ? clamp01(y) : DEFAULT_DOCK.y }
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** The window column for a side of the work area. Pure. */
export function columnBounds(workArea: Rect, side: Side, width = COLUMN_WIDTH): Rect {
  const w = Math.min(width, workArea.width)
  return {
    x: side === 'left' ? workArea.x : workArea.x + workArea.width - w,
    y: workArea.y,
    width: w,
    height: workArea.height,
  }
}

/** Which side a screen x coordinate is closer to. Pure. */
export function sideForX(screenX: number, workArea: Rect): Side {
  return screenX < workArea.x + workArea.width / 2 ? 'left' : 'right'
}

/**
 * Top offset for an island of `height` whose center should sit at `anchor`
 * (px from the top of an area `areaHeight` tall), kept fully on screen. Pure.
 */
export function islandTop(anchor: number, height: number, areaHeight: number, margin = EDGE_MARGIN): number {
  const top = anchor - height / 2
  return Math.round(Math.max(margin, Math.min(top, areaHeight - height - margin)))
}
