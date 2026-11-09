/**
 * The island's orb on the phone: which motion each mood has, how fast it
 * goes, its colour and its dots, as on the island (shared/orbs.ts and
 * shared/character.ts there; the app is built on its own, so these are
 * copies, and tests/phoneOrb.test.ts checks they match). Pure.
 */

/** The orb engine's motions (thinking-orbs). */
export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping'

export const ORB_FOR_MOOD: Record<string, OrbState> = {
  idle: 'searching',
  listening: 'listening',
  thinking: 'solving',
  searching: 'searching',
  writing: 'composing',
  working: 'working',
  done: 'searching',
  attention: 'connecting',
  error: 'searching',
  sleeping: 'searching',
  dancing: 'weaving',
}

/** Each orb's own colour (your pick on the island replaces it). */
export const ORB_COLOR: Record<string, string> = { orbit: '#ff8a65', bolt: '#4da3ff', puff: '#ff8cc0' }

/** How each orb's dots are drawn: Orbit as tuned, Bolt finer and denser, Puff fewer and softer. */
export const ORB_DOTS: Record<string, { dots: number; dotSize: number }> = {
  orbit: { dots: 1, dotSize: 1.2 },
  bolt: { dots: 1.45, dotSize: 0.95 },
  puff: { dots: 0.72, dotSize: 1.55 },
}

/** The colour of each mood (the ring around the orb), none at rest. */
export const MOOD_COLOR: Record<string, string | null> = {
  idle: null,
  listening: '#64d2ff',
  thinking: '#bf5af2',
  searching: '#5e5ce6',
  writing: '#0a84ff',
  working: '#0a84ff',
  done: '#30d158',
  attention: '#ff9f0a',
  error: '#ff453a',
  sleeping: null,
  dancing: '#ff375f',
}

export const orbForMood = (mood?: string): OrbState => ORB_FOR_MOOD[mood ?? ''] ?? 'searching'

/** How fast the orb moves in a mood: resting slowly, asleep not at all. */
export function orbSpeed(mood?: string): number {
  return mood === 'sleeping' ? 0 : !mood || mood === 'idle' || mood === 'error' ? 0.25 : mood === 'done' ? 0.6 : 1
}

/** Frames a second: busy ones 24, resting ones 10 (each frame costs battery), asleep none. */
export function orbFps(mood?: string): number {
  const v = orbSpeed(mood)
  return v === 0 ? 0 : v < 1 ? 10 : 24
}

/** Whether the ring turns (at work), breathes (needs you) or sits full (done); none at rest. */
export function ringKind(mood?: string): 'busy' | 'alert' | 'full' | null {
  if (mood === 'listening' || mood === 'thinking' || mood === 'searching' || mood === 'writing' || mood === 'working') return 'busy'
  if (mood === 'attention' || mood === 'error') return 'alert'
  if (mood === 'done' || mood === 'dancing') return 'full'
  return null
}

/** What the orb is doing, in a few words under its name. */
export function moodWords(mood?: string): string {
  switch (mood) {
    case 'listening':
      return 'Listening'
    case 'thinking':
      return 'Thinking'
    case 'searching':
      return 'Looking things up'
    case 'writing':
      return 'Writing'
    case 'working':
      return 'At work'
    case 'done':
      return 'Done'
    case 'attention':
      return 'Needs you'
    case 'error':
      return 'Something went wrong'
    case 'sleeping':
      return 'Asleep'
    default:
      return 'Resting'
  }
}

// ---- Drawing (the engine gives dots and lines; these turn them into a few SVG paths) ----

type Tint = { r: number; g: number; b: number }

/** "#ff9f0a" → its red, green and blue. */
export function parseTint(color: string | undefined): Tint | undefined {
  const hex = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!hex) return undefined
  const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1]
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** The ink: its colour on dark, a deeper shade of it on light (a pale tint is lost on white). */
export function orbInk(color: string | undefined, light: boolean): Tint {
  const t = parseTint(color) ?? (light ? { r: 72, g: 72, b: 78 } : { r: 255, g: 255, b: 255 })
  if (!light) return t
  const k = 0.74
  return { r: Math.round(t.r * k), g: Math.round(t.g * k), b: Math.round(t.b * k) }
}

/** A dot's colour: the ink, fading with its depth `w` toward the page, but only partly (the whole orb stays visible). */
export function inkOf(w: number, alpha: number, tint: Tint, light: boolean): string {
  const f = (v: number) => Math.round(light ? v + (255 - v) * w * 0.45 : v * (1 - w * 0.55))
  return `rgba(${f(tint.r)},${f(tint.g)},${f(tint.b)},${alpha})`
}

const SHADES = 10

/** Dots grouped by shade (ink and alpha rounded to SHADES steps), back to front: one path each. */
export function shadeGroups<D extends { white: number; a?: number }>(dots: D[]): { w: number; a: number; dots: D[] }[] {
  const groups = new Map<number, { w: number; a: number; dots: D[] }>()
  for (const d of dots) {
    const w = Math.round(Math.min(1, Math.max(0, d.white)) * SHADES) / SHADES
    const a = Math.round(Math.min(1, Math.max(0, d.a ?? 1)) * SHADES) / SHADES
    if (a <= 0) continue
    const key = w * 100 + a
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { w, a, dots: [] }))
    g.dots.push(d)
  }
  return [...groups.values()]
}

const n2 = (v: number) => Math.round(v * 100) / 100

/** Circles as one SVG path (two arcs each). */
export function dotsPath(dots: { x: number; y: number; r: number }[]): string {
  let p = ''
  for (const d of dots) {
    const r = n2(Math.max(0.2, d.r))
    p += `M${n2(d.x - r)} ${n2(d.y)}a${r} ${r} 0 1 0 ${n2(2 * r)} 0a${r} ${r} 0 1 0 ${n2(-2 * r)} 0`
  }
  return p
}

// From thinking-orbs (MIT): the dot counts and sizes of a preset, scaled.
const COUNT_PAIRS: [string, string][] = [
  ['latRings', 'lonDensity'],
  ['rings', 'lonDensity'],
  ['lanes', 'segs'],
]
const COUNT_KEYS = ['orbitN', 'ghostN', 'nodeN', 'strandN', 'signals']
const RADIUS_KEYS = ['rBase', 'rDepth', 'rActive', 'rDot', 'ghostR', 'partR', 'partRDepth', 'nodeR', 'nodeRDepth']

export function scaleCounts<O extends object>(opts: O, scale: number): O {
  const out: Record<string, number> = { ...(opts as Record<string, number>) }
  const done = new Set<string>()
  const rt = Math.sqrt(scale)
  for (const [a, b] of COUNT_PAIRS) {
    if (out[a] != null && out[b] != null && !done.has(a) && !done.has(b)) {
      out[a] = Math.max(2, Math.round(out[a] * rt))
      out[b] = Math.max(2, Math.round(out[b] * rt))
      done.add(a)
      done.add(b)
    }
  }
  for (const k of COUNT_KEYS) if (out[k] != null && out[k] !== 0 && !done.has(k)) out[k] = Math.max(1, Math.round(out[k] * scale))
  if (out.iconD != null) out.iconD = Math.max(0.02, out.iconD * scale)
  return out as O
}

export function scaleRadii<O extends object>(opts: O, scale: number): O {
  const out: Record<string, number> = { ...(opts as Record<string, number>) }
  for (const k of RADIUS_KEYS) if (out[k] != null) out[k] = out[k] * scale
  out.rSizeMul = (out.rSizeMul ?? 1) * scale
  return out as O
}

/** Which tuned preset to draw a `size` px orb from, and how much to scale it. */
export function orbBase(size: number): { base: 20 | 32 | 64; scale: number } {
  const base = size <= 26 ? 20 : size <= 46 ? 32 : 64
  return { base, scale: size / base }
}
