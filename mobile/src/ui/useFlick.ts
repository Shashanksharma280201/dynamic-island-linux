import { useCallback, useRef } from 'react'
import { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { EDGES, aim, computerSide, exitPoint, release } from '../gesture'
import type { Side } from '../protocol'

/** Closer than this to an edge and the computer's edge starts to glow. */
const APPROACH_AT = 0.2
const SPRING = { damping: 18, stiffness: 220, mass: 0.9 }

export type FlickEvents = {
  /** Heading for the edge that faces the computer: it lights up there. */
  approach: (side: Side, along: number) => void
  /** Moved away from the edges again. */
  leave: () => void
  /** Let go near the edge (or flicked): it's on its way. */
  send: (side: Side, along: number) => void
  /** Let go anywhere else: it's back where it was. */
  back: () => void
}

/**
 * A file you lift and flick toward your computer, run on the UI thread: the
 * card follows the finger, tilts with it, the edge it heads for lights up,
 * and letting go either throws it out of that edge (with the screen washing
 * white) or springs it home. Events come back to JS.
 */
export function useFlick(w: number, h: number, size: number, events: FlickEvents) {
  const ev = useRef(events)
  ev.current = events
  const onApproach = useCallback((s: Side, a: number) => ev.current.approach(s, a), [])
  const onLeave = useCallback(() => ev.current.leave(), [])
  const onSend = useCallback((s: Side, a: number) => ev.current.send(s, a), [])
  const onBack = useCallback(() => ev.current.back(), [])

  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const homeX = useSharedValue(0)
  const homeY = useSharedValue(0)
  const scale = useSharedValue(1)
  const tilt = useSharedValue(0)
  const shown = useSharedValue(0)
  const level = useSharedValue(0)
  const edge = useSharedValue(1)
  const along = useSharedValue(0.5)
  const wash = useSharedValue(0)
  const approached = useSharedValue(-1)

  /** Picked up at (fx, fy); it came from (hx, hy). */
  const lift = (hx: number, hy: number, fx: number, fy: number) => {
    'worklet'
    homeX.value = hx
    homeY.value = hy
    x.value = hx
    y.value = hy
    x.value = withSpring(fx, SPRING)
    y.value = withSpring(fy, SPRING)
    scale.value = 0.96
    scale.value = withSpring(1.08, { damping: 12, stiffness: 260 })
    shown.value = 1
    approached.value = -1
  }

  const move = (fx: number, fy: number, vx: number) => {
    'worklet'
    x.value = fx
    y.value = fy
    tilt.value = withTiming(Math.max(-1, Math.min(1, vx / 2200)), { duration: 120 })
    const a = aim(fx, fy, w, h)
    if (a) {
      const i = EDGES.indexOf(a.edge)
      edge.value = i
      along.value = a.along
      level.value = withTiming(Math.min(1, a.closeness * 1.15), { duration: 90 })
      if (a.closeness >= APPROACH_AT && approached.value !== i) {
        approached.value = i
        scheduleOnRN(onApproach, computerSide(a.edge), a.along)
      }
    } else {
      level.value = withTiming(0, { duration: 180 })
      if (approached.value !== -1) {
        approached.value = -1
        scheduleOnRN(onLeave)
      }
    }
  }

  /** Let go at (fx, fy) with velocity (px/s) having moved (dx, dy). */
  const end = (fx: number, fy: number, vx: number, vy: number, dx: number, dy: number) => {
    'worklet'
    const r = release(fx, fy, vx / 1000, vy / 1000, dx, dy, w, h)
    if (r) {
      const out = exitPoint(r.edge, fx, fy, w, h, size)
      edge.value = EDGES.indexOf(r.edge)
      along.value = r.along
      x.value = withTiming(out.x, { duration: 280, easing: Easing.in(Easing.cubic) })
      y.value = withTiming(out.y, { duration: 280, easing: Easing.in(Easing.cubic) })
      scale.value = withTiming(0.7, { duration: 280 })
      level.value = withSequence(withTiming(1.2, { duration: 110 }), withTiming(0, { duration: 950, easing: Easing.out(Easing.quad) }))
      wash.value = withDelay(130, withSequence(withTiming(0.9, { duration: 150 }), withTiming(0, { duration: 720, easing: Easing.out(Easing.quad) })))
      shown.value = withDelay(300, withTiming(0, { duration: 1 }))
      scheduleOnRN(onSend, computerSide(r.edge), r.along)
      return
    }
    if (approached.value !== -1) {
      approached.value = -1
      scheduleOnRN(onLeave)
    }
    level.value = withTiming(0, { duration: 220 })
    tilt.value = withTiming(0, { duration: 200 })
    scale.value = withSpring(1, SPRING)
    x.value = withSpring(homeX.value, SPRING)
    y.value = withSpring(homeY.value, SPRING, (done) => {
      if (!done) return
      shown.value = 0
      scheduleOnRN(onBack)
    })
  }

  /** Send without the gesture: a flash of light, as if flicked. */
  const flash = (e: number) => {
    'worklet'
    edge.value = e
    along.value = 0.5
    level.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 900 }))
    wash.value = withSequence(withTiming(0.85, { duration: 160 }), withTiming(0, { duration: 650 }))
  }

  const cardStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateX: x.value - size / 2 }, { translateY: y.value - size / 2 }, { scale: scale.value }, { rotate: `${tilt.value * 9}deg` }],
  }))

  return { lift, move, end, flash, cardStyle, level, edge, along, wash, shown }
}
