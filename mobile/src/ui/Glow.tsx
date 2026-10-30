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
    return { opacity: Math.min(1, level.value), transform: [{ translateX: cx - size / 2 }, { translateY: cy - size / 2 }, { scale: 0.5 + 0.5 * Math.min(1.2, level.value) }] }
  })
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
              <Stop offset="0.1" stopColor="#ffffff" stopOpacity="0.92" />
              <Stop offset="0.22" stopColor="#e6f5ff" stopOpacity="0.6" />
              <Stop offset="0.32" stopColor="#8ce1ff" stopOpacity="0.4" />
              <Stop offset="0.41" stopColor="#78ffbe" stopOpacity="0.32" />
              <Stop offset="0.5" stopColor="#ffe278" stopOpacity="0.27" />
              <Stop offset="0.59" stopColor="#ff8c96" stopOpacity="0.22" />
              <Stop offset="0.69" stopColor="#ce78ff" stopOpacity="0.16" />
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
