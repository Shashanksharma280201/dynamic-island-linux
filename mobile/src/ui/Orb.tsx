import { useEffect, useMemo, useState } from 'react'
import { AppState, View } from 'react-native'
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'
import { MODE_FRAMES, resolvePreset } from 'thinking-orbs/engine'
import { MOOD_COLOR, ORB_COLOR, ORB_DOTS, dotsPath, inkOf, orbBase, orbFps, orbForMood, orbInk, orbSpeed, ringKind, scaleCounts, scaleRadii, shadeGroups } from '../orb'
import { useTheme } from './theme'

type Frame = { dots: { x: number; y: number; r: number; white: number; a?: number }[]; lines: { x1: number; y1: number; x2: number; y2: number; w: number; white: number; a?: number }[] }

/**
 * The island's orb, as on the computer: the same dotted motion for what it's
 * doing, in its colour, with the mood's ring around it. Drawn a few times a
 * second at most, and not at all while the app is in the background or the
 * orb is off screen (`active` false).
 */
export function Orb({ id = 'orbit', color, mood = 'idle', size = 56, active = true, ring = true }: { id?: string; color?: string; mood?: string; size?: number; active?: boolean; ring?: boolean }) {
  const C = useTheme()
  const ringColor = ring ? MOOD_COLOR[mood] : null
  const kind = ringColor ? ringKind(mood) : null
  // With a ring, the orb sits inside it; on its own it fills the space.
  const orbSize = Math.round(kind ? size * 0.82 : size)
  const ink = useMemo(() => orbInk(color ?? ORB_COLOR[id] ?? ORB_COLOR.orbit, !C.dark), [color, id, C.dark])
  const draw = useMemo(() => {
    const { base, scale } = orbBase(orbSize)
    const { mode, speed, opts: preset } = resolvePreset(orbForMood(mood), base)
    const { dots, dotSize } = ORB_DOTS[id] ?? ORB_DOTS.orbit
    const grow = scale > 1 ? scale : 1
    let opts = scaleCounts(preset, Math.max(0.1, dots * Math.sqrt(grow)))
    const bold = orbSize <= 24 ? 1.55 : orbSize <= 32 ? 1.3 : 1.1
    opts = scaleRadii(opts, Math.max(0.1, dotSize * bold * Math.pow(scale, 0.6)))
    // Every dot at full strength (the globe otherwise dims the ones its scan isn't on).
    if (typeof (opts as { dimBase?: number }).dimBase === 'number') opts = { ...opts, dimBase: Math.max((opts as { dimBase: number }).dimBase, 0.85) } as typeof opts
    const frame = MODE_FRAMES[mode]
    return { at: (t: number) => frame(orbSize, t, opts) as Frame, speed }
  }, [mood, id, orbSize])

  const [t, setT] = useState(() => (Date.now() / 1000) * draw.speed * orbSpeed(mood))
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'))
    return () => sub.remove()
  }, [])
  const fps = orbFps(mood)
  useEffect(() => {
    if (!active || !foreground || fps === 0) return
    const every = 1000 / fps
    const v = draw.speed * orbSpeed(mood)
    let last = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      setT((x) => x + dt * v)
    }, every)
    return () => clearInterval(timer)
  }, [active, foreground, fps, draw, mood])

  const frame = useMemo(() => draw.at(t), [draw, t])
  const light = !C.dark
  const off = (size - orbSize) / 2
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`The orb, ${mood}`}>
      {kind && <Ring size={size} color={ringColor!} kind={kind} active={active && foreground} />}
      <Svg width={orbSize} height={orbSize} style={{ position: 'absolute', left: off, top: off }}>
        {frame.lines.map((l, i) => ((l.a ?? 1) < 0.02 ? null : <Path key={`l${i}`} d={`M${l.x1} ${l.y1}L${l.x2} ${l.y2}`} stroke={inkOf(Math.min(1, Math.max(0, l.white)), l.a ?? 1, ink, light)} strokeWidth={l.w} />))}
        {shadeGroups(frame.dots).map((g, i) => (
          <Path key={`d${i}`} d={dotsPath(g.dots)} fill={inkOf(g.w, g.a, ink, light)} />
        ))}
      </Svg>
    </View>
  )
}

/** The mood's ring: an arc turning while it works, breathing when it needs you, full when done. */
function Ring({ size, color, kind, active }: { size: number; color: string; kind: 'busy' | 'alert' | 'full'; active: boolean }) {
  const spin = useSharedValue(0)
  const glow = useSharedValue(1)
  useEffect(() => {
    if (!active) return
    if (kind === 'busy') spin.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1)
    if (kind === 'alert') glow.value = withRepeat(withSequence(withTiming(0.35, { duration: 800 }), withTiming(1, { duration: 800 })), -1)
    return () => {
      cancelAnimation(spin)
      cancelAnimation(glow)
    }
  }, [active, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }], opacity: glow.value }))
  const r = size / 2 - 1.5
  const c = 2 * Math.PI * r
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={kind === 'busy' ? 0.18 : 0.9} strokeWidth={2} fill="none" />
        {kind === 'busy' && <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray={`${c * 0.28} ${c}`} />}
      </Svg>
    </Animated.View>
  )
}
