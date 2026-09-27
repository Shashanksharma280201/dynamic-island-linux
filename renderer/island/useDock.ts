import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { DockState } from '@shared/types'
import { DEFAULT_DOCK, clamp01, sideForX, type Side } from '@shared/dock'

const DRAG_THRESHOLD = 5

/** Elements that keep their own click / typing behaviour instead of dragging. */
const NO_DRAG = 'button, input, textarea, select, a, .no-drag'

/**
 * Dock position from the main process, plus drag handling: press on the island
 * (not on a control) and move more than a few pixels to drag it along the edge;
 * crossing the middle of the screen moves it to the other edge. On release the
 * new dock is saved. Returns a flag to swallow the click that ends a drag.
 */
export function useDock() {
  const [dock, setDock] = useState<DockState>({
    ...DEFAULT_DOCK,
    workArea: { x: 0, y: 0, width: window.screen.width, height: window.innerHeight },
  })
  const [dragAnchor, setDragAnchor] = useState<number | null>(null)
  const drag = useRef<{
    id: number
    startX: number
    startY: number
    grabOffset: number
    side: Side
    active: boolean
  } | null>(null)
  const swallowClick = useRef(false)

  useEffect(() => window.island.onDock(setDock), [])

  const anchor = dragAnchor ?? dock.y * window.innerHeight

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(NO_DRAG)) return
    drag.current = {
      id: e.pointerId,
      startX: e.screenX,
      startY: e.screenY,
      grabOffset: e.clientY - anchor,
      side: dock.side,
      active: false,
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.active) {
      if (Math.hypot(e.screenX - d.startX, e.screenY - d.startY) < DRAG_THRESHOLD) return
      d.active = true
      // Capture only once it's really a drag, so plain clicks (e.g. on the
      // progress bar) still reach their target.
      e.currentTarget.setPointerCapture(e.pointerId)
      window.island.setDragging(true)
    }
    setDragAnchor(Math.max(0, Math.min(window.innerHeight, e.clientY - d.grabOffset)))
    const side = sideForX(e.screenX, dock.workArea)
    if (side !== d.side) {
      d.side = side
      window.island.previewSide(side)
    }
  }

  const end = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d.active) return
    swallowClick.current = true
    const y = clamp01((e.clientY - d.grabOffset) / window.innerHeight)
    setDock((cur) => ({ ...cur, side: d.side, y }))
    setDragAnchor(null)
    window.island.setDock({ side: d.side, y })
    window.island.setDragging(false)
  }

  /** Call at the start of the island's click handler; true = ignore this click. */
  const consumeDragClick = () => {
    const was = swallowClick.current
    swallowClick.current = false
    return was
  }

  return {
    side: dock.side,
    anchor,
    dragging: dragAnchor !== null,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
    consumeDragClick,
  }
}
