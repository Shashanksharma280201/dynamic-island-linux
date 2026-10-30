import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

let seq = 0

/**
 * Light at an edge of the phone's screen: a warm white where the computer is,
 * as on the computer's side (the colour around it is the Aurora). Drawn once
 * (an SVG radial gradient) and moved, scaled and faded on the UI thread.
 * `edge`: 0 left, 1 right, 2 top, 3 bottom; `along` 0-1 along it; `level` 0-1.
 */
export function EdgeGlow({ edge, along, level, w, h }: { edge: SharedValue<number>; along: SharedValue<number>; level: SharedValue<number>; w: number; h: number }) {
  const id = useRef(`glow${++seq}`).current
  const size = Math.max(w, h) * 1.1
  const style = useAnimatedStyle(() => {
    const a = Math.min(0.85, Math.max(0.15, along.value))
    const e = edge.value
    const cx = e === 0 ? 0 : e === 1 ? w : a * w
    const cy = e === 2 ? 0 : e === 3 ? h : a * h
    return { opacity: Math.min(0.9, level.value), transform: [{ translateX: cx - size / 2 }, { translateY: cy - size / 2 }, { scale: 0.45 + 0.55 * Math.min(1.2, level.value) }] }
  })
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#fffcf4" stopOpacity="0.78" />
              <Stop offset="0.2" stopColor="#fffbf2" stopOpacity="0.55" />
              <Stop offset="0.48" stopColor="#fff7ec" stopOpacity="0.2" />
              <Stop offset="0.75" stopColor="#fff4e6" stopOpacity="0.05" />
              <Stop offset="1" stopColor="#fff4e6" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={size} height={size} fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  )
}

// The colours: blue, green, yellow, orange, red (and lighter shades of them).
const HUES: [number, number, number][] = [
  [84, 166, 255],
  [92, 214, 120],
  [255, 212, 79],
  [255, 160, 77],
  [255, 107, 107],
]
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
/** The colour at `f` (0 to 1) along blue, green, yellow, orange, red, lightened by `k`. */
function hueAt(f: number, k: number): string {
  const x = Math.min(1, Math.max(0, f)) * (HUES.length - 1)
  const i = Math.min(HUES.length - 2, Math.floor(x))
  const a = HUES[i]
  const b = HUES[i + 1]
  const m = x - i
  return hex(a.map((v, j) => v + (b[j] - v) * m).map((v) => v + (255 - v) * k))
}

const BEADS = 26
/** The size a bead is drawn at; it's scaled from there. */
const BEAD = 220

/**
 * A ribbon of light, as on the computer: soft beads of colour along an arc
 * around the light (blue at one end through green, yellow and orange to red),
 * close enough to melt into one band. While the light is up it ripples
 * gently around it (`level`); `t` from 0 to 1 sends it across the screen as a
 * wave (`out` 1), or draws it in from the far side toward the edge (`out` 0),
 * the beads growing as it spreads and everything fading as it goes.
 */
export function Aurora({ edge, along, level, t, out, w, h }: { edge: SharedValue<number>; along: SharedValue<number>; level: SharedValue<number>; t: SharedValue<number>; out: SharedValue<number>; w: number; h: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {Array.from({ length: BEADS }, (_, i) => (
        <Bead key={i} i={i} edge={edge} along={along} level={level} t={t} out={out} w={w} h={h} />
      ))}
    </View>
  )
}

function Bead({ i, edge, along, level, t, out, w, h }: { i: number; edge: SharedValue<number>; along: SharedValue<number>; level: SharedValue<number>; t: SharedValue<number>; out: SharedValue<number>; w: number; h: number }) {
  const id = useRef(`bead${++seq}`).current
  const f = i / (BEADS - 1)
  const color = hueAt(f, 0.15)
  const style = useAnimatedStyle(() => {
    const smooth = (lo: number, hi: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - lo) / (hi - lo)))
      return k * k * (3 - 2 * k)
    }
    const e0 = edge.value
    const a = Math.min(0.85, Math.max(0.15, along.value))
    const px = e0 === 0 ? 0 : e0 === 1 ? w : a * w
    const py = e0 === 2 ? 0 : e0 === 3 ? h : a * h
    // Into the screen from that edge.
    const nx = e0 === 0 ? 1 : e0 === 1 ? -1 : 0
    const ny = e0 === 2 ? 1 : e0 === 3 ? -1 : 0
    const span = nx !== 0 ? w : h
    const ext = nx !== 0 ? Math.max(py, h - py) : Math.max(px, w - px)
    const u = t.value
    const waving = u > 0 && u < 1
    let R: number
    let size: number
    let alpha: number
    if (waving) {
      const e = out.value ? 1 - Math.pow(1 - u, 3) : 1 - u * u * u
      // Across the screen to the far side (a phone is narrow: not its diagonal).
      R = span * 0.16 + span * 1.05 * e
      size = span * (0.24 + 0.24 * e)
      alpha = 0.55 * smooth(0, 0.14, u) * (1 - smooth(0.55, 1, u))
    } else {
      R = span * (0.2 + 0.05 * level.value)
      size = span * (0.14 + 0.05 * level.value)
      alpha = 0.5 * Math.min(1, level.value)
    }
    // As wide as the screen lets it be, so all its colours show.
    const wide = Math.min(1.25, Math.asin(Math.min(1, (ext * 0.92) / Math.max(1, R))))
    const ang = (f * 2 - 1) * wide
    const dx = nx * Math.cos(ang) - ny * Math.sin(ang)
    const dy = nx * Math.sin(ang) + ny * Math.cos(ang)
    // A ripple runs along it as it travels (and as the light moves).
    const rr = R + span * 0.02 * Math.sin(u * 9 + level.value * 4 + f * 7.5)
    const end = smooth(0, 0.1, f) * smooth(0, 0.1, 1 - f)
    const x = px + dx * rr
    const y = py + dy * rr
    return { opacity: alpha * end, transform: [{ translateX: x - BEAD / 2 }, { translateY: y - BEAD / 2 }, { scale: Math.max(0.01, size / BEAD) }] }
  })
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: BEAD, height: BEAD }, style]}>
      <Svg width={BEAD} height={BEAD}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity="0.8" />
            <Stop offset="0.5" stopColor={color} stopOpacity="0.5" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={BEAD} height={BEAD} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  )
}

/** The whole screen washing white (a file leaving, or arriving). */
export function Wash({ level }: { level: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: level.value }))
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, style]} />
}
