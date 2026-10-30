import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import * as Haptics from 'expo-haptics'
import type { SharedFile } from '../../modules/share-intake'
import { kindOf, thumbOf, type Item } from '../files'
import { aim, computerSide, exitPoint, release, type Aim } from '../gesture'
import type { DropLink, LinkState } from '../link'
import { newDropId, sizeText, type Side } from '../protocol'
import { sendAll, setSideUsed, sideUsed } from '../send'
import { Face } from './Face'
import { EdgeGlow, Wash } from './Glow'
import { SendPill, type Sending } from './SendPill'
import { C } from './theme'

const APPROACH_AT = 0.2

/**
 * What another app shared to Island Drop, already lifted: flick it toward
 * your computer (or tap Send) and it goes, all of it as one drop.
 */
export function ShareScreen({ link, files, onDone }: { link: DropLink; files: SharedFile[]; onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions()
  const [st, setSt] = useState<LinkState>(link.state)
  const [aimed, setAimed] = useState<Aim | null>(null)
  const [sending, setSending] = useState<Sending | null>(null)
  const items = useMemo<Item[]>(() => files.map((f, i) => ({ key: `s-${i}-${f.name}`, uri: f.uri, name: f.name, size: f.size, kind: kindOf(f.name), when: Date.now() })), [files])
  const size = Math.min(W * 0.62, 280)
  const home = { x: W / 2, y: H * 0.45 }
  const id = useRef(newDropId()).current
  const approached = useRef<'' | Side>('')
  const busy = useRef(false)
  const pos = useRef(new Animated.ValueXY(home)).current
  const scale = useRef(new Animated.Value(0.6)).current
  const glow = useRef(new Animated.Value(0)).current
  const wash = useRef(new Animated.Value(0)).current
  const thumb = useMemo(() => thumbOf(items[0]), [items])
  const total = items.reduce((n, i) => n + i.size, 0)
  const title = items.length === 1 ? items[0].name : `${items.length} files`

  useEffect(() => link.subscribe(setSt), [link])
  useEffect(() => {
    void link.find()
    Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 6 }).start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (side: Side, along: number, approach: boolean) => {
    if (busy.current) return
    busy.current = true
    setSideUsed(side)
    setSending({ key: id, name: title, p: 0, phase: 'sending' })
    const r = await sendAll(link, id, items, side, along, { approach, thumb, onProgress: (p) => setSending((s) => (s && s.phase === 'sending' ? { ...s, p } : s)) })
    setSending({ key: id, name: r.ok ? title : title, p: 1, phase: r.ok ? 'sent' : 'failed', message: r.ok ? undefined : r.message })
    if (r.ok) setTimeout(onDone, 1500)
    else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      busy.current = false
      pos.setValue(home)
      Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 6 }).start()
    }
  }

  const flyOut = (a: Aim, at: { x: number; y: number }) => {
    const side = computerSide(a.edge)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    Animated.parallel([
      Animated.timing(pos, { toValue: exitPoint(a.edge, at.x, at.y, W, H, size), duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
      Animated.timing(scale, { toValue: 0.75, duration: 300, useNativeDriver: false }),
      Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 120, useNativeDriver: false }), Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: false })]),
      Animated.sequence([
        Animated.delay(140),
        Animated.timing(wash, { toValue: 0.9, duration: 160, useNativeDriver: false }),
        Animated.timing(wash, { toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]),
    ]).start(() => setAimed(null))
    void go(side, a.along, approached.current !== side)
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !busy.current,
        onPanResponderGrant: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          Animated.spring(scale, { toValue: 1.06, useNativeDriver: false, friction: 6 }).start()
        },
        onPanResponderMove: (_e, g) => {
          pos.setValue({ x: g.moveX, y: g.moveY })
          const a = aim(g.moveX, g.moveY, W, H)
          setAimed((prev) => (prev?.edge === a?.edge && Math.abs((prev?.closeness ?? 0) - (a?.closeness ?? 0)) < 0.04 ? prev : a))
          glow.setValue(a ? Math.min(1, a.closeness * 1.1) : 0)
          if (a && a.closeness >= APPROACH_AT) {
            const side = computerSide(a.edge)
            if (approached.current !== side) {
              approached.current = side
              void Haptics.selectionAsync()
              void thumb.then((t) =>
                link.approach(
                  id,
                  side,
                  a.along,
                  items.map((i) => ({ name: i.name, size: i.size })),
                  t,
                ),
              )
            }
          } else if (!a && approached.current) {
            approached.current = ''
            void link.cancel(id)
          }
        },
        onPanResponderRelease: (_e, g) => {
          const r = release(g.moveX, g.moveY, g.vx, g.vy, g.dx, g.dy, W, H)
          if (r) return flyOut(r, { x: g.moveX, y: g.moveY })
          if (approached.current) void link.cancel(id)
          approached.current = ''
          setAimed(null)
          Animated.parallel([
            Animated.spring(pos, { toValue: home, useNativeDriver: false, friction: 7 }),
            Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 6 }),
            Animated.timing(glow, { toValue: 0, duration: 260, useNativeDriver: false }),
          ]).start()
        },
      }),
    [W, H, link], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const statusColor = st.phase === 'ready' ? C.green : st.phase === 'finding' ? C.orange : C.red

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

      {aimed && <EdgeGlow edge={aimed.edge} along={aimed.along} level={glow} w={W} h={H} />}

      {items.length > 1 && (
        <View pointerEvents="none" style={[s.ghost, { width: size, height: size, left: home.x - size / 2 + 14, top: home.y - size / 2 - 10, transform: [{ rotate: '6deg' }] }]} />
      )}
      <Animated.View
        {...pan.panHandlers}
        style={[s.card, { width: size, height: size, left: -size / 2, top: -size / 2, transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }] }]}
      >
        <Face item={items[0]} size={size} />
        {items.length > 1 && (
          <View style={s.count}>
            <Text style={s.countText}>{items.length}</Text>
          </View>
        )}
      </Animated.View>

      <View style={[s.caption, { top: home.y + size / 2 + 26 }]} pointerEvents="none">
        <Text style={s.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.sub}>{sizeText(total)} · flick it toward your computer</Text>
      </View>

      <Wash level={wash} />

      {!sending || sending.phase === 'failed' ? (
        <View style={s.buttons}>
          <Pressable style={({ pressed }) => [s.send, pressed && { opacity: 0.85 }]} onPress={() => !busy.current && void go(sideUsed(), 0.5, true)}>
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
  card: {
    position: 'absolute',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  ghost: { position: 'absolute', borderRadius: 22, backgroundColor: C.card2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
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
