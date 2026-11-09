import { useEffect, useRef, useState } from 'react'
import { AppState, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { EDGES, computerSide, exitPoint } from '../gesture'
import type { PhoneIncoming } from '../islandTypes'
import type { DropLink } from '../link'
import { setActivity } from '../activity'
import { notifyBatch, notifyReceived } from '../notify'
import { sizeText } from '../protocol'
import { Aurora, EdgeGlow, Wash } from './Glow'
import { extOf, kindColor, themed, useTheme } from './theme'
import { Icon } from './icons'

const SPRING = { damping: 16, stiffness: 150, mass: 1 }

/**
 * Files arriving from the computer, one at a time: the edge that faces the
 * computer lights up, the file comes out of the light into the middle while
 * its bytes arrive, then drops into Files. Files sent together (a folder)
 * come out once and stay while the rest arrive, counting them. With the app
 * in the background they're saved quietly and a notification says so.
 */
export function IncomingLayer({ link, onReceived, filesTabX }: { link: DropLink; onReceived: (uri: string, f: PhoneIncoming, folder?: { uri: string; name: string }) => void; filesTabX: number }) {
  const s = useS()
  const { width: W, height: H } = useWindowDimensions()
  const [queue, setQueue] = useState<PhoneIncoming[]>([])
  const queueRef = useRef(queue)
  queueRef.current = queue
  const [p, setP] = useState(0)
  const [done, setDone] = useState<'' | 'ok' | 'fail'>('')
  const handled = useRef(new Set<string>())
  // The files sent together that are arriving now: which, whether the card is up, how it's going.
  const batch = useRef<{ id: string; shown: boolean; ok: number; failed: number; bytes: number } | null>(null)
  const [tally, setTally] = useState({ ok: 0, failed: 0, bytes: 0 })
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
    const together = current.batch
    const same = !!together && batch.current?.id === together.id
    if (!same) batch.current = { id: together?.id ?? current.id, shown: false, ok: 0, failed: 0, bytes: 0 }
    const b = batch.current!
    setP(0)
    setDone('')
    setTally({ ok: b.ok, failed: b.failed, bytes: b.bytes })
    if (!quiet && b.shown) {
      // Already out: a little nod for each file that comes in.
      scale.value = withSequence(withTiming(1.035, { duration: 120 }), withSpring(1, SPRING))
    } else if (!quiet) {
      b.shown = true
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
    const label = together ? together.title : current.name
    const tell = (v: number) => setActivity({ kind: 'receiving', label: together ? `${label} · ${together.i + 1} of ${together.n}` : label, progress: together ? (together.i + v) / together.n : v })
    tell(0)
    void link.receive(current, (v) => {
      if (cancelled) return
      setP(v)
      tell(v)
    }).then((r) => {
      if (cancelled) return
      if (r.ok && r.uri) onReceived(r.uri, current, r.folder)
      if (r.ok) b.ok++
      else b.failed++
      if (r.ok) b.bytes += current.size
      setTally({ ok: b.ok, failed: b.failed, bytes: b.bytes })
      const next = () => setQueue((q) => q.slice(1))
      // More of these still to come: on to the next, the card staying where it is.
      const more = !!together && together.i < together.n - 1 && queueRef.current.slice(1).some((q) => q.batch?.id === together.id)
      if (more) return next()
      setActivity(null)
      batch.current = null
      if (quiet) {
        if (together) notifyBatch(together.title, together.n, b.failed, b.bytes, link.pairing.name)
        else notifyReceived(current, link.pairing.name, r.ok, r.message)
      }
      if (quiet || !b.shown) return next()
      const ok = b.failed === 0
      setDone(ok ? 'ok' : 'fail')
      void Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error)
      level.value = withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })
      if (ok) {
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
  const together = current.batch
  const isPhoto = !together && current.kind === 'image' && !!current.thumb
  const folder = !!together && !!current.dir
  const progress = together ? (together.i + p) / together.n : p
  const sub =
    done === 'fail'
      ? together && tally.ok
        ? `${tally.failed} of ${together.n} didn’t arrive`
        : 'Didn’t arrive'
      : done === 'ok'
        ? `Saved · ${together ? `${together.n} files · ` : ''}${sizeText(together ? tally.bytes : current.size)}`
        : together
          ? `From ${link.pairing.name} · ${together.i + 1} of ${together.n}`
          : `From ${link.pairing.name} · ${Math.round(p * 100)}%`
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <EdgeGlow edge={edge} along={along} level={level} w={W} h={H} />
      <Aurora edge={edge} along={along} level={level} t={ring} out={ringOut} w={W} h={H} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size }, cardStyle]}>
        <View style={[s.card, { width: size, height: size }]}>
          {isPhoto ? (
            <Image source={{ uri: current.thumb }} style={{ width: size, height: size }} />
          ) : folder ? (
            <View style={[s.tile, { backgroundColor: '#0a84ff' }]}>
              <View style={s.folderTab} />
              <Text style={s.tileText}>{together!.n}</Text>
              <Text style={s.tileSub}>files</Text>
            </View>
          ) : together ? (
            <View style={[s.tile, { backgroundColor: kindColor(current.name) }]}>
              <Text style={s.tileSub}>{together.i + 1} of {together.n}</Text>
              <Text style={s.tileText}>{extOf(current.name)}</Text>
            </View>
          ) : (
            <View style={[s.tile, { backgroundColor: kindColor(current.name) }]}>
              <Text style={s.tileText}>{extOf(current.name)}</Text>
            </View>
          )}
          {done === 'ok' && (
            <View style={s.check}>
              <Icon name="check" size={16} color="#fff" />
            </View>
          )}
        </View>
        <View style={s.caption}>
          <Text style={s.name} numberOfLines={1}>
            {together ? together.title : current.name}
          </Text>
          {!!together && !done && (
            <Text style={s.sub} numberOfLines={1}>
              {current.dir ? `${current.dir}/` : ''}
              {current.name}
            </Text>
          )}
          <Text style={s.sub}>{sub}</Text>
          {!done && (
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
            </View>
          )}
        </View>
      </Animated.View>
      <Wash level={wash} />
    </View>
  )
}

const useS = themed((C) => ({
  card: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.dark ? 'rgba(255,255,255,0.45)' : C.lineStrong, backgroundColor: C.card, elevation: 24, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  tile: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  tileText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  tileSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '700' },
  folderTab: { position: 'absolute', top: 16, left: 16, width: 42, height: 11, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.45)' },
  check: { position: 'absolute', right: 10, top: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  caption: { alignItems: 'center', marginTop: 12 },
  name: { color: C.text, fontSize: 15, fontWeight: '700' },
  sub: { color: C.text2, fontSize: 13, marginTop: 3 },
  track: { width: 140, height: 4, borderRadius: 2, backgroundColor: C.fill, marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: C.accent },
}))
