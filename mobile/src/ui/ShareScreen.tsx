import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Text } from './Text'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import Animated from 'react-native-reanimated'
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
import { themed, useTheme } from './theme'
import { useFlick } from './useFlick'
import { APPEAR } from './motion'

/**
 * What another app shared to Island Drop, already lifted: drag it toward your
 * computer and let go (or tap Send), all of it as one drop.
 */
export function ShareScreen({ link, files, onDone }: { link: DropLink; files: SharedFile[]; onDone: () => void }) {
  const C = useTheme()
  const s = useS()
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
        <Text style={s.h1} numberOfLines={2}>
          Send to {link.pairing.name}
        </Text>
        <View style={s.status}>
          <View style={[s.dot, st.phase === 'offline' ? { borderWidth: 1.5, borderColor: statusColor } : { backgroundColor: statusColor }]} />
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
        <Animated.View entering={APPEAR} style={{ position: 'absolute', left: home.x - size / 2, top: home.y - size / 2, opacity: flying || grabbed ? 0 : 1 }}>
          {card}
        </Animated.View>
      </GestureDetector>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, flick.cardStyle]}>
        {card}
      </Animated.View>

      <Animated.View entering={APPEAR} style={[s.caption, { top: home.y + size / 2 + 26 }]} pointerEvents="none">
        <Text style={s.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.sub}>{sizeText(total)} · drag it toward your computer</Text>
      </Animated.View>

      <Wash level={flick.wash} />

      {!sending || sending.phase === 'failed' ? (
        <View style={s.buttons}>
          <Pressable
            style={({ pressed }) => [s.send, pressed && { opacity: 0.8 }]}
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

const useS = themed((C) => ({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg },
  head: { paddingTop: 60, paddingHorizontal: 24 },
  h1: { color: C.text, fontSize: 28, lineHeight: 33, fontWeight: '500', letterSpacing: -0.8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: C.text2, fontSize: 14, flexShrink: 1 },
  card: { borderRadius: 28, overflow: 'hidden', backgroundColor: C.card, boxShadow: C.dark ? '0 16px 40px rgba(0,0,0,0.55)' : '0 16px 40px rgba(30,20,10,0.18)' },
  ghost: { position: 'absolute', borderRadius: 28, backgroundColor: C.card2, transform: [{ rotate: '6deg' }] },
  count: { position: 'absolute', top: 12, right: 12, minWidth: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  countText: { color: C.onPrimary, fontWeight: '500', fontSize: 15 },
  caption: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  name: { color: C.text, fontSize: 18, fontWeight: '500', letterSpacing: -0.2 },
  sub: { color: C.text2, fontSize: 13.5, marginTop: 4 },
  buttons: { position: 'absolute', left: 20, right: 20, bottom: 34, gap: 6 },
  send: { backgroundColor: C.primary, borderRadius: 999, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: C.onPrimary, fontSize: 16, fontWeight: '500' },
  cancel: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: C.text2, fontSize: 15 },
}))
