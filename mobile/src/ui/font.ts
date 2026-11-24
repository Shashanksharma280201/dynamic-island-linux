/**
 * The app's typeface and its sizes (no React here, so it can be tested on
 * its own). Inter Tight, a family for each weight: a font the app brings has
 * no weights of its own on Android. Loaded in App.tsx; the app's `Text`
 * (./Text) picks the family from a style's `fontWeight`.
 */
export const FONT = { regular: 'InterTight_400Regular', medium: 'InterTight_500Medium', semibold: 'InterTight_600SemiBold' } as const

/**
 * The family for a weight as a style writes it. The look sets its order by
 * size, not weight, so everything sits a step lighter than it says: 700 and
 * up is semibold, 500 and 600 medium, the rest regular. Pure.
 */
export function fontOf(weight?: string | number | null): string {
  const n = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight) || 400
  return n >= 700 ? FONT.semibold : n >= 500 ? FONT.medium : FONT.regular
}

/**
 * The largest size (up to `max`) at which a figure fits on one line `width`
 * wide: long amounts get smaller, never cut. Pure.
 */
export function fitSize(text: string, width: number, max: number, min = 14): number {
  if (!width || !text) return max
  // A figure's characters average a little over half its size across (digits more, commas and stops less).
  return Math.max(min, Math.min(max, Math.floor(width / (text.length * 0.57))))
}
