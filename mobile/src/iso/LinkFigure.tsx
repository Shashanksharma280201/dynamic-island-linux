import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../ui/theme'
import { Parts } from './draw'
import { CAPSULE_RUN, LAMP, LAPTOP_GLASS, NEEDLE, PHONE_GLASS, VIEW, backParts, capsuleParts, frontParts, needleAngle, needlePath } from './linkGeometry'

import type { LinkMode } from '../linkTypes'

export type { LinkMode } from '../linkTypes'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' })

/** The lamp's colour for each mode (from the figure's own palette). */
function lampColor(mode: LinkMode, t: ReturnType<typeof useTheme>['iso']): string {
  return mode === 'offline' ? t.red : mode === 'searching' ? t.amber : mode === 'live' ? t.green : t.blue
}

/**
 * Fig. 1, the link: your computer and phone on one bench, a glass tube
 * between them. A capsule runs along it while files go (toward the computer
 * when you send, toward the phone when it sends), the lamp is green when they
 * can reach each other (amber while looking, red when they can't), and the
 * gauge reads the round trip. Tap it to test the link. Built with Anatomy's
 * isometric kit; its motion stops when it isn't on screen.
 */
export function LinkFigure({
  mode,
  ms,
  title,
  readout,
  hint = 'Tap to test',
  active = true,
  onTest,
}: {
  mode: LinkMode
  /** The last round trip, in ms. */
  ms?: number
  title: string
  readout: string
  hint?: string
  /** On screen and the app in front: animate. */
  active?: boolean
  onTest?: () => void
}) {
  const C = useTheme()
  const t = C.iso
  const back = useMemo(() => backParts(), [])
  const capsule = useMemo(() => capsuleParts(), [])
  const front = useMemo(() => frontParts(), [])
  const [width, setWidth] = useState(0)
  const [still, setStill] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setStill)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill)
    return () => sub.remove()
  }, [])

  // One clock for the capsule's run (0 to 1, looping while files go), the lamp and the needle.
  const run = useSharedValue(0)
  const lamp = useSharedValue(1)
  const angle = useSharedValue(needleAngle(ms ?? 0))
  const hop = useSharedValue(0)
  const k = width / VIEW.width

  useEffect(() => {
    const moving = active && !still
    cancelAnimation(run)
    cancelAnimation(lamp)
    if (moving && (mode === 'sending' || mode === 'receiving')) {
      run.value = 0
      run.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) }), -1, false)
    } else run.value = withTiming(0, { duration: 300 })
    if (moving && mode === 'searching') {
      lamp.value = withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0.25, { duration: 750 })), -1, false)
    } else lamp.value = withTiming(mode === 'offline' ? 0.85 : 1, { duration: 300 })
  }, [mode, active, still]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cancelAnimation(angle)
    if (active && !still && mode === 'searching') {
      angle.value = withRepeat(withSequence(withTiming(needleAngle(240), { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(needleAngle(10), { duration: 1400, easing: Easing.inOut(Easing.sin) })), -1, false)
    } else {
      const target = needleAngle(mode === 'offline' || ms == null ? 0 : ms)
      angle.value = still ? target : withSpring(target, { damping: 9, stiffness: 120 })
    }
  }, [mode, ms, active, still]) // eslint-disable-line react-hooks/exhaustive-deps

  const lampColorNow = lampColor(mode, t)

  const capsuleStyle = useAnimatedStyle(() => {
    // Sending: from the phone's end to the computer's; receiving: back.
    const p = run.value
    const u = mode === 'receiving' ? 1 - p : mode === 'sending' ? p : hop.value
    const fade = mode === 'sending' || mode === 'receiving' ? Math.min(1, p * 8, (1 - p) * 8) : 1
    return {
      opacity: (mode === 'offline' ? 0.45 : 1) * fade,
      transform: [{ translateX: CAPSULE_RUN[0] * u * k }, { translateY: CAPSULE_RUN[1] * u * k }],
    }
  }, [mode, k])
  const laptopGlow = useAnimatedStyle(() => {
    const p = run.value
    return { opacity: mode === 'sending' ? Math.max(0, (p - 0.75) / 0.25) * 0.9 : mode === 'live' ? 0.18 : 0 }
  }, [mode])
  const phoneGlow = useAnimatedStyle(() => {
    const p = run.value
    return { opacity: mode === 'receiving' ? Math.max(0, (p - 0.75) / 0.25) * 0.9 : mode === 'live' ? 0.18 : 0 }
  }, [mode])
  const lampStyle = useAnimatedStyle(() => ({ opacity: lamp.value }))
  const needleProps = useAnimatedProps(() => ({ d: needlePath(angle.value, NEEDLE.pivot, NEEDLE.ux, NEEDLE.uy, NEEDLE.length, NEEDLE.tail) }))

  const test = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    // A quick run there and back, so you see it go.
    if (mode === 'live' && !still) hop.value = withSequence(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.cubic) }), withTiming(0, { duration: 650, easing: Easing.inOut(Easing.cubic) }))
    onTest?.()
  }

  const h = width * (VIEW.height / VIEW.width)
  const box = `0 0 ${VIEW.width} ${VIEW.height}`
  const layer = { position: 'absolute' as const, left: 0, top: 0, width, height: h }
  return (
    <Pressable
      onPress={test}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${readout}`}
      accessibilityHint="Tests the connection to your computer"
      style={({ pressed }) => [s.plate, { backgroundColor: t.paper, borderColor: C.line }, C.shadow, pressed && { opacity: 0.94 }]}
    >
      <View style={s.corners}>
        <Text style={[s.corner, { color: C.text2, fontFamily: MONO }]}>Fig. 1</Text>
        <Text style={[s.corner, s.caps, { color: C.text3, fontFamily: MONO }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={{ height: h || 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <>
            <Svg style={layer} viewBox={box}>
              <Parts parts={back} t={t} />
            </Svg>
            <Animated.View style={[layer, laptopGlow]} pointerEvents="none">
              <Svg width={width} height={h} viewBox={box}>
                <Path d={LAPTOP_GLASS} fill={t.blue} opacity={0.55} />
              </Svg>
            </Animated.View>
            <Animated.View style={[layer, capsuleStyle]} pointerEvents="none">
              <Svg width={width} height={h} viewBox={box}>
                <Parts parts={capsule.body} t={t} />
                <Path d={capsule.band} fill={lampColorNow} />
              </Svg>
            </Animated.View>
            <Svg style={layer} viewBox={box}>
              <Parts parts={front} t={t} />
            </Svg>
            <Animated.View style={[layer, phoneGlow]} pointerEvents="none">
              <Svg width={width} height={h} viewBox={box}>
                <Path d={PHONE_GLASS} fill={t.green} opacity={0.55} />
              </Svg>
            </Animated.View>
            <Svg style={layer} viewBox={box} pointerEvents="none">
              <AnimatedPath animatedProps={needleProps} stroke={t.red} strokeWidth={1.1} strokeLinecap="round" fill="none" />
              <Circle cx={NEEDLE.pivot[0]} cy={NEEDLE.pivot[1]} r={1.6} fill={t.hi} />
            </Svg>
            <Animated.View style={[layer, lampStyle]} pointerEvents="none">
              <Svg width={width} height={h} viewBox={box}>
                <Defs>
                  <RadialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={lampColorNow} stopOpacity={C.dark ? 0.55 : 0.35} />
                    <Stop offset="1" stopColor={lampColorNow} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={LAMP.center[0]} cy={LAMP.center[1]} r={LAMP.glowR} fill="url(#lampGlow)" />
                <G>
                  <Path d={LAMP.body.fill} fill={lampColorNow} />
                  <Path d={LAMP.body.top} fill="#ffffff" opacity={0.35} />
                  <Path d={LAMP.body.outline} stroke={t.hi} strokeWidth={0.7} fill="none" />
                </G>
              </Svg>
            </Animated.View>
          </>
        )}
      </View>
      <View style={s.corners}>
        <Text style={[s.corner, s.caps, { color: C.text3, fontFamily: MONO }]}>{hint}</Text>
        <Text style={[s.corner, { color: C.text, fontFamily: MONO, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
          {readout}
        </Text>
      </View>
      {/* Which way the files are going, for the screen reader's sake too. */}
      <Text style={s.hidden}>{mode === 'sending' ? 'Sending to your computer' : mode === 'receiving' ? 'Receiving from your computer' : ''}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  plate: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden' },
  corners: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  corner: { fontSize: 10.5, letterSpacing: 0.4 },
  caps: { textTransform: 'uppercase', letterSpacing: 1.1, flexShrink: 1 },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
})
