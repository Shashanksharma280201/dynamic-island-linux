import { Animated, StyleSheet, View } from 'react-native'
import type { Side } from '../protocol'

/**
 * Light at the edge of the phone's screen: rings of white and colour around a
 * point on that edge, like the glow the computer shows on its side. `level`
 * (0-1) is how bright.
 */
export function EdgeGlow({ edge, along, level, w, h }: { edge: Side; along: number; level: Animated.Value | Animated.AnimatedInterpolation<number>; w: number; h: number }) {
  const a = Math.min(0.85, Math.max(0.15, along))
  const c = edge === 'left' ? { x: 0, y: a * h } : edge === 'right' ? { x: w, y: a * h } : edge === 'top' ? { x: a * w, y: 0 } : { x: a * w, y: h }
  const rings: [number, string, number][] = [
    [520, '#bf5af2', 0.1],
    [440, '#ffd60a', 0.1],
    [370, '#30d158', 0.11],
    [300, '#64d2ff', 0.14],
    [230, '#ffffff', 0.2],
    [160, '#ffffff', 0.3],
    [90, '#ffffff', 0.5],
  ]
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: level }]}>
      {rings.map(([d, color, o]) => (
        <View key={d} style={{ position: 'absolute', left: c.x - d / 2, top: c.y - d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: color, opacity: o }} />
      ))}
    </Animated.View>
  )
}

/** The whole screen washing white as the file leaves. */
export function Wash({ level }: { level: Animated.Value }) {
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: level }]} />
}
