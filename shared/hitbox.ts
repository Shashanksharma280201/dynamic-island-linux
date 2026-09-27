export type Rect = { x: number; y: number; width: number; height: number }

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height
}

/**
 * Convert a rect reported by the renderer (CSS px, relative to the window) into
 * physical screen pixels, which is what X11 QueryPointer returns. `win` is the
 * window's bounds in DIP; `scale` is the display's scale factor. `pad` grows
 * the rect (in CSS px) so the edge doesn't flicker. Pure.
 */
export function toPhysicalRect(rect: Rect, win: { x: number; y: number }, scale: number, pad = 0): Rect {
  return {
    x: (win.x + rect.x - pad) * scale,
    y: (win.y + rect.y - pad) * scale,
    width: (rect.width + pad * 2) * scale,
    height: (rect.height + pad * 2) * scale,
  }
}

/** Validate an untrusted rect from IPC. Pure. */
export function isRect(r: any): r is Rect {
  return (
    !!r &&
    ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))
  )
}
