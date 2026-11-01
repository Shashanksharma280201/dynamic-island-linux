import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import type { SharedFile } from '../../modules/share-intake'
import { kindOf, thumbOf, type Item } from '../files'
import { EDGES, computerSide } from '../gesture'
import type { DropLink, LinkState } from '../link'
import { newDropId, sizeText, type Side } from '../protocol'
import { sendAll, setSideUsed, sideUsed } from '../send'
import { Face } from './Face'
import { Aurora, EdgeGlow, Wash } from './Glow'
import { SendPill, type Sending } from './SendPill'
import { C } from './theme'
import { useFlick } from './useFlick'

/**
 * What another app shared to Island Drop, already lifted: drag it toward your
 * computer and let go (or tap Send), all of it as one drop.
 */
export function ShareScreen({ link, files, onDone }: { link: DropLink; files: SharedFile[]; onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions()
  const [st, setSt] = useState<LinkState>(link.state)
  const [sending, setSending] = useState<Sending | null>(null)
  const [flying, setFlying] = useState(false)
  const [grabbed, setGrabbed] = useState(false)
  const items = useMemo<Item[]>(() => files.map((f, i) => ({ key: `s-${i}-${f.name}`, uri: f.uri, name: f.name, size: f.size, kind: kindOf(f.name), when: Date.now() })), [files])
  const size = Math.min(W * 0.62, 280)
  const home = { x: W / 2, y: H * 0.45 }
  const id = useRef(newDropId()).current
  const approached = useRef<'' | Side>('')
  const busy = useRef(false)
  const thumb = useMemo(() => thumbOf(items[0]), [items])
  const total = items.reduce((n, i) => n + i.size, 0)
  const title = items.length === 1 ? items[0].name : `${items.length} files`
  const infos = items.map((i) => ({ name: i.name, size: i.size }))

  useEffect(() => link.subscribe(setSt), [link])
  useEffect(() => {
    void link.find()
  }, [link])

  const go = async (side: Side, along: number, approach: boolean) => {
    if (busy.current) return
    busy.current = true
    setSideUsed(side)
    setSending({ key: id, name: title, p: 0, phase: 'sending' })
    const r = await sendAll(link, id, items, side, along, { approach, thumb, onProgress: (p) => setSending((s) => (s && s.phase === 'sending' ? { ...s, p } : s)) })
    setSending({ key: id, name: title, p: 1, phase: r.ok ? 'sent' : 'failed', message: r.ok ? undefined : r.message })
    if (r.ok) setTimeout(onDone, 1400)
    else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      busy.current = false
      setFlying(false)
    }
  }

  const flick = useFlick(W, H, size, {
    approach: (side, along) => {
      approached.current = side
      void Haptics.selectionAsync()
      void thumb.then((t) => link.approach(id, side, along, infos, t))
    },
    leave: () => {
      if (approached.current) void link.cancel(id)
      approached.current = ''
    },
    send: (side, along) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setFlying(true)
      void go(side, along, approached.current !== side)
    },
    back: () => setGrabbed(false),
  })

  const grab = () => {
    setGrabbed(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }
  const pan = usePanGesture({
    enabled: !sending || sending.phase === 'failed',
    onActivate: (e) => {
      'worklet'
      flick.lift(home.x, home.y, e.absoluteX, e.absoluteY)
      scheduleOnRN(grab)
    },
    onUpdate: (e) => {
      'worklet'
      flick.move(e.absoluteX, e.absoluteY, e.velocityX)
    },
    onDeactivate: (e) => {
      'worklet'
      flick.end(e.absoluteX, e.absoluteY, e.velocityX, e.velocityY, e.translationX, e.translationY)
    },
  })

  const statusColor = st.phase === 'ready' ? C.green : st.phase === 'finding' ? C.orange : C.red
  const card = (
    <View style={[s.card, { width: size, height: size }]}>
      <Face item={items[0]} size={size} />
      {items.length > 1 && (
        <View style={s.count}>
          <Text style={s.countText}>{items.length}</Text>
        </View>
      )}
    </View>
  )

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.h1}>Send to {link.pairing.name}</Text>
        <View style={s.status}>
          <View style={[s.dot, { backgroundColor: statusColor }]} />
          <Text style={s.statusText} numberOfLines={2}>
            {st.phase === 'ready' ? 'Ready' : st.phase === 'finding' ? 'Looking for it…' : (st.error ?? 'Can’t reach it')}
          </Text>
        </View>
      </View>

      <EdgeGlow edge={flick.edge} along={flick.along} level={flick.level} w={W} h={H} />
      <Aurora edge={flick.edge} along={flick.along} level={flick.level} t={flick.ring} out={flick.ringOut} w={W} h={H} />

      {items.length > 1 && !flying && !grabbed && <View pointerEvents="none" style={[s.ghost, { width: size, height: size, left: home.x - size / 2 + 14, top: home.y - size / 2 - 10 }]} />}
      {/* At rest it sits in the middle; once grabbed, the flick moves its copy. */}
      <GestureDetector gesture={pan}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={{ position: 'absolute', left: home.x - size / 2, top: home.y - size / 2, opacity: flying || grabbed ? 0 : 1 }}>
          {card}
        </Animated.View>
      </GestureDetector>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, flick.cardStyle]}>
        {card}
      </Animated.View>

      <Animated.View entering={FadeIn.delay(200)} style={[s.caption, { top: home.y + size / 2 + 26 }]} pointerEvents="none">
        <Text style={s.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.sub}>{sizeText(total)} · drag it toward your computer</Text>
      </Animated.View>

      <Wash level={flick.wash} />

      {!sending || sending.phase === 'failed' ? (
        <View style={s.buttons}>
          <Pressable
            style={({ pressed }) => [s.send, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={() => {
              if (busy.current) return
              const side = sideUsed()
              flick.flash(EDGES.indexOf(computerSide(side)))
              setFlying(true)
              void go(side, 0.5, true)
            }}
          >
            <Text style={s.sendText}>Send</Text>
          </Pressable>
          <Pressable style={s.cancel} onPress={onDone}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {sending && <SendPill sending={sending} to={link.pairing.name} onDismiss={() => setSending(null)} />}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg },
  head: { paddingTop: 60, paddingHorizontal: 22 },
  h1: { color: C.text, fontSize: 26, fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: C.text2, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  card: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', elevation: 24, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  ghost: { position: 'absolute', borderRadius: 22, backgroundColor: C.card2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', transform: [{ rotate: '6deg' }] },
  count: { position: 'absolute', top: 10, right: 10, minWidth: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText: { color: '#000', fontWeight: '800', fontSize: 15 },
  caption: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  name: { color: C.text, fontSize: 16, fontWeight: '700' },
  sub: { color: C.text3, fontSize: 13, marginTop: 4 },
  buttons: { position: 'absolute', left: 16, right: 16, bottom: 34, gap: 8 },
  send: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  sendText: { color: '#000', fontSize: 16, fontWeight: '800' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: C.text2, fontSize: 15, fontWeight: '600' },
})
