import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

let seq = 0

/**
 * Light at an edge of the phone's screen: white where the computer is, a ring
 * of colour around it, as on the computer's side. Drawn once (an SVG radial
 * gradient) and moved, scaled and faded on the UI thread.
 * `edge`: 0 left, 1 right, 2 top, 3 bottom; `along` 0-1 along it; `level` 0-1.
 */
export function EdgeGlow({ edge, along, level, w, h }: { edge: SharedValue<number>; along: SharedValue<number>; level: SharedValue<number>; w: number; h: number }) {
  const id = useRef(`glow${++seq}`).current
  const size = Math.max(w, h) * 1.6
  const style = useAnimatedStyle(() => {
    const a = Math.min(0.85, Math.max(0.15, along.value))
    const e = edge.value
    const cx = e === 0 ? 0 : e === 1 ? w : a * w
    const cy = e === 2 ? 0 : e === 3 ? h : a * h
    return { opacity: Math.min(0.9, level.value), transform: [{ translateX: cx - size / 2 }, { translateY: cy - size / 2 }, { scale: 0.5 + 0.5 * Math.min(1.2, level.value) }] }
  })
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.78" />
              <Stop offset="0.1" stopColor="#ffffff" stopOpacity="0.64" />
              <Stop offset="0.22" stopColor="#e6f5ff" stopOpacity="0.38" />
              <Stop offset="0.32" stopColor="#8ce1ff" stopOpacity="0.24" />
              <Stop offset="0.41" stopColor="#78ffbe" stopOpacity="0.19" />
              <Stop offset="0.5" stopColor="#ffe278" stopOpacity="0.16" />
              <Stop offset="0.59" stopColor="#ff8c96" stopOpacity="0.13" />
              <Stop offset="0.69" stopColor="#ce78ff" stopOpacity="0.09" />
              <Stop offset="1" stopColor="#7a6eff" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={size} height={size} fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  )
}

/**
 * The wave, as on the computer: a ring of colour (white inside to violet
 * outside) that grows out of the light at an edge across the whole screen,
 * or closes in on it, fading as it goes. Drawn once, scaled on the UI thread.
 * `t` runs 0 to 1 (outside that, nothing shows); `out` is 1 outward, 0 inward.
 */
export function Ripple({ edge, along, t, out, w, h }: { edge: SharedValue<number>; along: SharedValue<number>; t: SharedValue<number>; out: SharedValue<number>; w: number; h: number }) {
  const id = useRef(`ripple${++seq}`).current
  const far = Math.hypot(w, h) * 1.15
  const size = far * 2
  const style = useAnimatedStyle(() => {
    const u = t.value
    if (u <= 0 || u >= 1) return { opacity: 0, transform: [{ translateX: -size }, { translateY: -size }, { scale: 0.01 }] }
    const a = Math.min(0.85, Math.max(0.15, along.value))
    const e = edge.value
    const cx = e === 0 ? 0 : e === 1 ? w : a * w
    const cy = e === 2 ? 0 : e === 3 ? h : a * h
    const smooth = (lo: number, hi: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - lo) / (hi - lo)))
      return k * k * (3 - 2 * k)
    }
    const r0 = 0.1 * Math.min(w, h)
    // Out: quick off the edge, slowing as it spreads. In: slow, then quick into the light.
    const R = out.value ? r0 + (far - r0) * (1 - Math.pow(1 - u, 3)) : far - (far - r0) * u * u * u
    return { opacity: smooth(0, 0.12, u) * (1 - smooth(0.6, 1, u)), transform: [{ translateX: cx - size / 2 }, { translateY: cy - size / 2 }, { scale: Math.max(0.01, R / far) }] }
  })
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="0.52" stopColor="#ffffff" stopOpacity="0.1" />
              <Stop offset="0.61" stopColor="#8ce1ff" stopOpacity="0.17" />
              <Stop offset="0.71" stopColor="#78ffbe" stopOpacity="0.17" />
              <Stop offset="0.8" stopColor="#ffe278" stopOpacity="0.16" />
              <Stop offset="0.88" stopColor="#ff8c96" stopOpacity="0.14" />
              <Stop offset="0.95" stopColor="#ce78ff" stopOpacity="0.11" />
              <Stop offset="1" stopColor="#7a6eff" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={size} height={size} fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  )
}

/** The whole screen washing white (a file leaving, or arriving). */
export function Wash({ level }: { level: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: level.value }))
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, style]} />
}
