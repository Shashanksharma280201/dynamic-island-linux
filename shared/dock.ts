import type { Rect } from './hitbox'

/** A screen edge, or 'top': centered at the top, below the camera (like a phone's island). */
export type Side = 'left' | 'right' | 'top'

/** Where the island is docked: a screen side and, on the left / right edges,
 * the vertical position of its center as a fraction (0 = top, 1 = bottom) of
 * the work area height (kept while it is at the top, for when it goes back). */
export type Dock = { side: Side; y: number }

export const DEFAULT_DOCK: Dock = { side: 'right', y: 0.3 }

/** Width of the transparent window column the island lives in: the widest
 * panel plus its icon rail (~430px) with room for the drop shadow to fade out
 * before the window edge (it would be cut off in a straight line). */
export const COLUMN_WIDTH = 560

/** Width of the window band at the top center (the panel and rail, centered, plus shadow room). */
export const TOP_WIDTH = 820

/** Dropping the island this close to the top center (px) docks it there. */
export const TOP_ZONE = { height: 160, halfWidth: 0.2 }

/** Gap between the island and the screen edge / top / bottom, in px. */
export const EDGE_MARGIN = 10

/** Validate a stored/IPC dock value, falling back to the default. Pure. */
export function parseDock(raw: any): Dock {
  const side: Side = raw?.side === 'left' || raw?.side === 'right' || raw?.side === 'top' ? raw.side : DEFAULT_DOCK.side
  const y = Number(raw?.y)
  return { side, y: Number.isFinite(y) ? clamp01(y) : DEFAULT_DOCK.y }
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** The window for a side of the work area: a full-height column on an edge,
 * or a centered band at the top. Pure. */
export function columnBounds(workArea: Rect, side: Side, width = side === 'top' ? TOP_WIDTH : COLUMN_WIDTH): Rect {
  const w = Math.min(width, workArea.width)
  const x =
    side === 'left' ? workArea.x : side === 'top' ? workArea.x + Math.round((workArea.width - w) / 2) : workArea.x + workArea.width - w
  return { x, y: workArea.y, width: w, height: workArea.height }
}

/** Where a dragged island lands: the top center if dropped near it, else
 * the nearer edge. Pure. */
export function sideForPoint(screenX: number, screenY: number, workArea: Rect): Side {
  const nearTop = screenY - workArea.y < TOP_ZONE.height
  const nearCenter = Math.abs(screenX - (workArea.x + workArea.width / 2)) < workArea.width * TOP_ZONE.halfWidth
  return nearTop && nearCenter ? 'top' : sideForX(screenX, workArea)
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
