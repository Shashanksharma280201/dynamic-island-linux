import { getSvgPath } from 'figma-squircle'

/**
 * SVG path `d` for a superellipse-cornered ("squircle") rounded rectangle —
 * the iOS continuous-corner look that plain CSS border-radius cannot produce.
 * Radius is clamped to half the smaller side so it never overshoots.
 */
export function squirclePath(
  width: number,
  height: number,
  radius: number,
  smoothing = 0.6,
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  return getSvgPath({
    width,
    height,
    cornerRadius: r,
    cornerSmoothing: smoothing,
  })
}
