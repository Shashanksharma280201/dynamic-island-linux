import { useEffect, useRef, useState } from 'react'
import { AppState, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { EDGES, computerSide, exitPoint } from '../gesture'
import type { PhoneIncoming } from '../islandTypes'
import type { DropLink } from '../link'
import { notifyReceived } from '../notify'
import { sizeText } from '../protocol'
import { EdgeGlow, Ripple, Wash } from './Glow'
import { C, extOf, kindColor } from './theme'

const SPRING = { damping: 16, stiffness: 150, mass: 1 }

/**
 * Files arriving from the computer, one at a time: the edge that faces the
 * computer lights up, the file comes out of the light into the middle while
 * its bytes arrive, then drops into Files. With the app in the background
 * it's saved quietly and a notification says so.
 */
export function IncomingLayer({ link, onReceived, filesTabX }: { link: DropLink; onReceived: (uri: string, f: PhoneIncoming) => void; filesTabX: number }) {
  const { width: W, height: H } = useWindowDimensions()
  const [queue, setQueue] = useState<PhoneIncoming[]>([])
  const [p, setP] = useState(0)
  const [done, setDone] = useState<'' | 'ok' | 'fail'>('')
  const handled = useRef(new Set<string>())
  const size = Math.min(W * 0.5, 220)

  const x = useSharedValue(-size)
  const y = useSharedValue(H / 2)
  const scale = useSharedValue(0.6)
  const opacity = useSharedValue(0)
  const level = useSharedValue(0)
  const edge = useSharedValue(0)
  const along = useSharedValue(0.5)
  const wash = useSharedValue(0)
  // The wave of colour that leaves the light as the file comes out.
  const ring = useSharedValue(0)
  const ringOut = useSharedValue(1)

  useEffect(
    () =>
      link.onIncoming((f) => {
        if (handled.current.has(f.id)) return
        handled.current.add(f.id)
        setQueue((q) => [...q, f])
      }),
    [link],
  )

  const current = queue[0]
  useEffect(() => {
    if (!current) return
    let cancelled = false
    const quiet = AppState.currentState !== 'active'
    const phoneEdge = computerSide(current.side)
    const from = exitPoint(phoneEdge, phoneEdge === 'left' || phoneEdge === 'right' ? 0 : W / 2, H * 0.42, W, H, size)
    const centre = { x: W / 2, y: H * 0.42 }
    setP(0)
    setDone('')
    if (!quiet) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      edge.value = EDGES.indexOf(phoneEdge)
      along.value = 0.42
      level.value = withTiming(0.9, { duration: 480, easing: Easing.out(Easing.quad) })
      wash.value = withSequence(withTiming(0.12, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) }))
      ringOut.value = 1
      ring.value = 0
      ring.value = withDelay(150, withTiming(1, { duration: 1600, easing: Easing.linear }))
      x.value = from.x
      y.value = from.y
      scale.value = 0.55
      opacity.value = withTiming(1, { duration: 200 })
      x.value = withDelay(120, withSpring(centre.x, SPRING))
      y.value = withDelay(120, withSpring(centre.y, SPRING))
      scale.value = withDelay(120, withSpring(1, SPRING))
    }
    void link.receive(current, (v) => !cancelled && setP(v)).then((r) => {
      if (cancelled) return
      if (quiet) notifyReceived(current, link.pairing.name, r.ok, r.message)
      if (r.ok && r.uri) onReceived(r.uri, current)
      const next = () => setQueue((q) => q.slice(1))
      if (quiet) return next()
      setDone(r.ok ? 'ok' : 'fail')
      void Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error)
      level.value = withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })
      if (r.ok) {
        scale.value = withSequence(withSpring(1.08, { damping: 8, stiffness: 300 }), withDelay(450, withTiming(0.12, { duration: 520, easing: Easing.in(Easing.cubic) })))
        x.value = withDelay(650, withTiming(filesTabX, { duration: 520, easing: Easing.in(Easing.cubic) }))
        y.value = withDelay(650, withTiming(H - 40, { duration: 520, easing: Easing.in(Easing.cubic) }))
        opacity.value = withDelay(1050, withTiming(0, { duration: 160 }))
        setTimeout(next, 1300)
      } else {
        x.value = withSequence(withTiming(centre.x - 12, { duration: 60 }), withTiming(centre.x + 12, { duration: 60 }), withTiming(centre.x, { duration: 60 }))
        opacity.value = withDelay(1400, withTiming(0, { duration: 300 }))
        setTimeout(next, 1800)
      }
    })
    return () => {
      cancelled = true
    }
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value - size / 2 }, { translateY: y.value - size / 2 }, { scale: scale.value }],
  }))

  if (!current) return null
  const isPhoto = current.kind === 'image' && !!current.thumb
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <EdgeGlow edge={edge} along={along} level={level} w={W} h={H} />
      <Ripple edge={edge} along={along} t={ring} out={ringOut} w={W} h={H} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size }, cardStyle]}>
        <View style={[s.card, { width: size, height: size }]}>
          {isPhoto ? (
            <Image source={{ uri: current.thumb }} style={{ width: size, height: size }} />
          ) : (
            <View style={[s.tile, { backgroundColor: kindColor(current.name) }]}>
              <Text style={s.tileText}>{extOf(current.name)}</Text>
            </View>
          )}
          {done === 'ok' && (
            <View style={s.check}>
              <Text style={s.checkText}>✓</Text>
            </View>
          )}
        </View>
        <View style={s.caption}>
          <Text style={s.name} numberOfLines={1}>
            {current.name}
          </Text>
          <Text style={s.sub}>{done === 'fail' ? 'Didn’t arrive' : done === 'ok' ? `Saved · ${sizeText(current.size)}` : `From ${link.pairing.name} · ${Math.round(p * 100)}%`}</Text>
          {!done && (
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.max(4, p * 100)}%` }]} />
            </View>
          )}
        </View>
      </Animated.View>
      <Wash level={wash} />
    </View>
  )
}

const s = StyleSheet.create({
  card: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: C.card, elevation: 24, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  tile: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  tileText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  check: { position: 'absolute', right: 10, top: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  caption: { alignItems: 'center', marginTop: 12 },
  name: { color: C.text, fontSize: 15, fontWeight: '700' },
  sub: { color: C.text2, fontSize: 13, marginTop: 3 },
  track: { width: 140, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#fff' },
})
