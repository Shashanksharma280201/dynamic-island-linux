import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Easing, FlatList, Image, Linking, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import * as Haptics from 'expo-haptics'
import { File } from 'expo-file-system'
import { addFiles, loadTray, recentMedia, removeFromTray, thumbOf, whenText, type Item } from '../files'
import { aim, computerSide, exitPoint, release, type Aim } from '../gesture'
import type { DropLink, LinkState } from '../link'
import { newDropId, sizeText, type Side } from '../protocol'
import { EdgeGlow, Wash } from './Glow'
import { C, extOf, kindColor } from './theme'

type Lifted = { item: Item; home: { x: number; y: number }; size: number }
type Sending = { name: string; item: Item; p: number; phase: 'sending' | 'sent' | 'failed'; message?: string }

const GAP = 10
const PAD = 16
/** Closer than this to an edge and the computer's edge starts to glow. */
const APPROACH_AT = 0.2

/**
 * Your photos and files. Hold one and it lifts under your finger; move it
 * toward the edge of the phone that faces your computer and both screens
 * light up there; let go near the edge (or flick it) and it flies across.
 */
export function HomeScreen({ link, onUnpair }: { link: DropLink; onUnpair: () => void }) {
  const { width: W, height: H } = useWindowDimensions()
  const [st, setSt] = useState<LinkState>(link.state)
  const [tab, setTab] = useState<'photos' | 'files'>('photos')
  const [media, setMedia] = useState<{ items: Item[]; allowed: boolean; canAsk: boolean } | null>(null)
  const [tray, setTray] = useState<Item[]>(() => loadTray())
  const [lifted, setLifted] = useState<Lifted | null>(null)
  const [aimed, setAimed] = useState<Aim | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [sending, setSending] = useState<Sending | null>(null)

  const liftedRef = useRef<Lifted | null>(null)
  liftedRef.current = lifted
  const drag = useRef({ id: '', approached: '' as '' | Side, along: 0.5, carrying: false, granted: false, thumb: undefined as Promise<string | undefined> | undefined })
  const lastSide = useRef<Side>('right')
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
  const scale = useRef(new Animated.Value(1)).current
  const tilt = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0)).current
  const wash = useRef(new Animated.Value(0)).current

  useEffect(() => link.subscribe(setSt), [link])
  useEffect(() => {
    void link.find()
  }, [link])
  const loadMedia = () => void recentMedia().then(setMedia, () => setMedia({ items: [], allowed: false, canAsk: false }))
  useEffect(loadMedia, [])

  const tile = (W - PAD * 2 - GAP) / 2

  // ---- Lifting, carrying, letting go ----

  const lift = (item: Item, at: { x: number; y: number }) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const size = tile * 0.82
    drag.current = { id: newDropId(), approached: '', along: 0.5, carrying: true, granted: false, thumb: thumbOf(item) }
    pos.setValue(at)
    scale.setValue(1)
    Animated.spring(scale, { toValue: 1.08, useNativeDriver: false, friction: 6 }).start()
    setSelected(null)
    setLifted({ item, home: at, size })
  }

  const fileInfo = (item: Item) => {
    const size = item.size || safeSize(item.uri)
    return { name: item.name, size }
  }

  const approach = async (a: Aim) => {
    const l = liftedRef.current
    if (!l) return
    const side = computerSide(a.edge)
    if (drag.current.approached === side) return
    drag.current.approached = side
    drag.current.along = a.along
    void Haptics.selectionAsync()
    const thumb = await Promise.race([drag.current.thumb, new Promise<undefined>((r) => setTimeout(r, 450))])
    await link.approach(drag.current.id, side, a.along, [fileInfo(l.item)], thumb)
  }

  const putBack = () => {
    const l = liftedRef.current
    if (!l || !drag.current.carrying) return
    drag.current.carrying = false
    if (drag.current.approached) void link.cancel(drag.current.id)
    drag.current.approached = ''
    setAimed(null)
    Animated.parallel([
      Animated.spring(pos, { toValue: l.home, useNativeDriver: false, friction: 7 }),
      Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 260, useNativeDriver: false }),
      Animated.timing(tilt, { toValue: 0, duration: 220, useNativeDriver: false }),
    ]).start(() => setLifted(null))
  }

  const sendOut = (a: Aim, at: { x: number; y: number }) => {
    const l = liftedRef.current
    if (!l || !drag.current.carrying) return
    drag.current.carrying = false
    const side = computerSide(a.edge)
    lastSide.current = side
    setAimed(a)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const out = exitPoint(a.edge, at.x, at.y, W, H, l.size)
    Animated.parallel([
      Animated.timing(pos, { toValue: out, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
      Animated.timing(scale, { toValue: 0.75, duration: 300, useNativeDriver: false }),
      Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 120, useNativeDriver: false }), Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: false })]),
      Animated.sequence([
        Animated.delay(140),
        Animated.timing(wash, { toValue: 0.9, duration: 160, useNativeDriver: false }),
        Animated.timing(wash, { toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]),
    ]).start(() => {
      setLifted(null)
      setAimed(null)
      tilt.setValue(0)
    })
    void deliver(l.item, drag.current.id, side, a.along, drag.current.approached !== side, drag.current.thumb)
  }

  /** Make sure the computer knows which edge, then send the bytes. */
  const deliver = async (item: Item, id: string, side: Side, along: number, needsApproach: boolean, thumb?: Promise<string | undefined>) => {
    const info = fileInfo(item)
    setSending({ name: item.name, item, p: 0, phase: 'sending' })
    if (needsApproach) await link.approach(id, side, along, [info], await Promise.race([thumb ?? Promise.resolve(undefined), new Promise<undefined>((r) => setTimeout(r, 450))]))
    const r = await link.send(id, 0, { uri: item.uri, ...info }, (p) => setSending((s) => (s && s.item.key === item.key && s.phase === 'sending' ? { ...s, p } : s)))
    setSending({ name: r.name ?? item.name, item, p: 1, phase: r.ok ? 'sent' : 'failed', message: r.ok ? undefined : r.message })
    if (!r.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }

  /** Tap, then Send: no gesture needed (it comes in at the side you used last). */
  const sendSelected = (item: Item) => {
    setSelected(null)
    wash.setValue(0)
    Animated.sequence([Animated.timing(wash, { toValue: 0.85, duration: 160, useNativeDriver: false }), Animated.timing(wash, { toValue: 0, duration: 650, useNativeDriver: false })]).start()
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    void deliver(item, newDropId(), lastSide.current, 0.5, true, thumbOf(item))
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => drag.current.carrying,
        onMoveShouldSetPanResponderCapture: () => drag.current.carrying,
        onPanResponderGrant: () => {
          drag.current.granted = true
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          pos.setValue({ x: g.moveX, y: g.moveY })
          tilt.setValue(Math.max(-1, Math.min(1, g.vx * 0.6)))
          const a = aim(g.moveX, g.moveY, W, H)
          setAimed((prev) => (prev?.edge === a?.edge && Math.abs((prev?.closeness ?? 0) - (a?.closeness ?? 0)) < 0.04 ? prev : a))
          glow.setValue(a ? Math.min(1, a.closeness * 1.1) : 0)
          if (a && a.closeness >= APPROACH_AT) void approach(a)
          else if (!a && drag.current.approached) {
            void link.cancel(drag.current.id)
            drag.current.approached = ''
          }
        },
        onPanResponderRelease: (_e, g) => {
          const r = release(g.moveX, g.moveY, g.vx, g.vy, g.dx, g.dy, W, H)
          if (r) sendOut(r, { x: g.moveX, y: g.moveY })
          else putBack()
        },
        onPanResponderTerminate: () => putBack(),
      }),
    [W, H, link], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ---- The screen ----

  const items = tab === 'photos' ? (media?.items ?? []) : tray
  const sel = selected ? items.find((i) => i.key === selected) : null
  const statusColor = st.phase === 'ready' ? C.green : st.phase === 'finding' ? C.orange : C.red
  const statusText = st.phase === 'ready' ? link.pairing.name : st.phase === 'finding' ? `Looking for ${link.pairing.name}…` : `Can’t reach ${link.pairing.name}`

  return (
    <View style={s.wrap} {...pan.panHandlers}>
      <FlatList
        data={tab === 'files' ? [ADD, ...items] : items}
        keyExtractor={(i) => i.key}
        numColumns={2}
        scrollEnabled={!lifted}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 140, gap: GAP }}
        ListHeaderComponent={
          <View style={{ marginBottom: 6 }}>
            <View style={s.top}>
              <Text style={s.h1}>Island Drop</Text>
              <Pressable
                hitSlop={10}
                onPress={() =>
                  Alert.alert('Unpair this phone?', `It won’t send to ${link.pairing.name} until you scan its QR again.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Unpair', style: 'destructive', onPress: onUnpair },
                  ])
                }
              >
                <Text style={s.unpair}>Unpair</Text>
              </Pressable>
            </View>
            <Pressable style={s.status} onPress={() => void link.find()}>
              <View style={[s.dot, { backgroundColor: statusColor }]} />
              <Text style={s.statusText} numberOfLines={1}>
                {statusText}
              </Text>
              {st.phase === 'finding' && <ActivityIndicator size="small" color={C.text3} />}
            </Pressable>
            {st.phase === 'offline' && !!st.error && <Text style={s.error}>{st.error}</Text>}
            <Text style={s.hint}>Hold a file, then flick it toward your computer.</Text>
            <View style={s.tabs}>
              {(['photos', 'files'] as const).map((t) => (
                <Pressable key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)}>
                  <Text style={[s.tabText, tab === t && { color: '#000' }]}>{t === 'photos' ? 'Photos' : 'Files'}</Text>
                </Pressable>
              ))}
            </View>
            {tab === 'photos' && media && !media.allowed && (
              <View style={s.notice}>
                <Text style={s.noticeText}>Island Drop needs to see your photos to list them here.</Text>
                <Pressable style={s.small} onPress={() => (media.canAsk ? loadMedia() : void Linking.openSettings())}>
                  <Text style={s.smallText}>{media.canAsk ? 'Allow photos' : 'Open settings'}</Text>
                </Pressable>
              </View>
            )}
            {tab === 'photos' && !media && <ActivityIndicator style={{ marginTop: 20 }} color={C.text3} />}
          </View>
        }
        renderItem={({ item }) =>
          item.key === ADD.key ? (
            <Pressable
              style={[s.add, { width: tile, height: tile + 44 }]}
              onPress={() => void addFiles(tray).then(setTray, (e) => Alert.alert('Couldn’t add that', String(e?.message ?? e)))}
            >
              <Text style={s.addPlus}>+</Text>
              <Text style={s.addText}>Add files</Text>
            </Pressable>
          ) : (
            <Tile
              item={item}
              size={tile}
              hidden={lifted?.item.key === item.key}
              selected={selected === item.key}
              onPress={() => setSelected(selected === item.key ? null : item.key)}
              onLongPress={(at) => lift(item, at)}
              onPressOut={() => {
                // Held, then let go without moving: put it back. (When the finger
                // moves on, the screen takes the touch over just after this.)
                setTimeout(() => {
                  if (liftedRef.current?.item.key === item.key && drag.current.carrying && !drag.current.granted) putBack()
                }, 80)
              }}
              onRemove={tab === 'files' ? () => setTray(removeFromTray(tray, item.key)) : undefined}
            />
          )
        }
      />

      {aimed && <EdgeGlow edge={aimed.edge} along={aimed.along} level={glow} w={W} h={H} />}

      {lifted && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.liftedCard,
            {
              width: lifted.size,
              height: lifted.size,
              left: -lifted.size / 2,
              top: -lifted.size / 2,
              transform: [
                { translateX: pos.x },
                { translateY: pos.y },
                { scale },
                { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }) },
              ],
            },
          ]}
        >
          <Face item={lifted.item} size={lifted.size} />
        </Animated.View>
      )}

      <Wash level={wash} />

      {sel && !lifted && (
        <View style={s.bar}>
          <Pressable style={({ pressed }) => [s.sendBtn, pressed && { opacity: 0.85 }]} onPress={() => sendSelected(sel)}>
            <Text style={s.sendText} numberOfLines={1}>
              Send to {link.pairing.name}
            </Text>
          </Pressable>
        </View>
      )}

      {sending && !sel && (
        <Pressable style={s.bar} onPress={() => sending.phase !== 'sending' && setSending(null)}>
          <View style={s.pill}>
            <View style={[s.pillMark, { backgroundColor: sending.phase === 'failed' ? C.red : sending.phase === 'sent' ? C.green : 'rgba(255,255,255,0.14)' }]}>
              {sending.phase === 'sending' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.pillMarkText}>{sending.phase === 'sent' ? '✓' : '!'}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.pillTitle} numberOfLines={1}>
                {sending.phase === 'sending' ? `Sending ${sending.name}` : sending.phase === 'sent' ? `Sent to ${link.pairing.name}` : 'Didn’t send'}
              </Text>
              {sending.phase === 'sending' ? (
                <View style={s.track}>
                  <View style={[s.fill, { width: `${Math.round(Math.max(0.03, sending.p) * 100)}%` }]} />
                </View>
              ) : (
                <Text style={s.pillSub} numberOfLines={2}>
                  {sending.phase === 'sent' ? sending.name : sending.message}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      )}
    </View>
  )
}

const ADD: Item = { key: '__add', uri: '', name: '', size: 0, kind: 'file', when: 0 }

function safeSize(uri: string): number {
  try {
    return new File(uri).size ?? 0
  } catch {
    return 0
  }
}

/** A photo, or a coloured tile with the file's type. */
function Face({ item, size }: { item: Item; size: number }) {
  if (item.kind === 'photo') return <Image source={{ uri: item.uri }} style={{ width: size, height: size }} resizeMode="cover" />
  return (
    <View style={[s.typeTile, { width: size, height: size, backgroundColor: kindColor(item.name) }]}>
      {item.kind === 'video' && <Text style={s.play}>▶</Text>}
      <Text style={s.typeText}>{extOf(item.name)}</Text>
    </View>
  )
}

function Tile({
  item,
  size,
  hidden,
  selected,
  onPress,
  onLongPress,
  onPressOut,
  onRemove,
}: {
  item: Item
  size: number
  hidden: boolean
  selected: boolean
  onPress: () => void
  onLongPress: (at: { x: number; y: number }) => void
  onPressOut: () => void
  onRemove?: () => void
}) {
  return (
    <Pressable
      style={{ width: size, opacity: hidden ? 0.25 : 1 }}
      delayLongPress={260}
      onPress={onPress}
      onLongPress={(e) => onLongPress({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      onPressOut={onPressOut}
    >
      <View style={[s.face, selected && s.faceOn]}>
        <Face item={item} size={size} />
      </View>
      <View style={s.meta}>
        <Text style={s.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          {item.size ? `${sizeText(item.size)} · ` : ''}
          {whenText(item.when)}
        </Text>
      </View>
      {onRemove && selected && (
        <Pressable style={s.remove} hitSlop={8} onPress={onRemove}>
          <Text style={s.removeText}>Remove</Text>
        </Pressable>
      )}
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: C.text, fontSize: 30, fontWeight: '800' },
  unpair: { color: C.text3, fontSize: 14, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: C.text2, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  error: { color: C.red, fontSize: 13, marginTop: 6, lineHeight: 18 },
  hint: { color: C.text3, fontSize: 13, marginTop: 10 },
  tabs: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 3, marginTop: 14, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: C.text2, fontSize: 14, fontWeight: '700' },
  notice: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 6, gap: 10 },
  noticeText: { color: C.text2, fontSize: 14, lineHeight: 19 },
  small: { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  smallText: { color: '#000', fontWeight: '700', fontSize: 13 },
  face: { borderRadius: 16, overflow: 'hidden', backgroundColor: C.card },
  faceOn: { borderWidth: 2, borderColor: '#fff' },
  meta: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 2 },
  name: { color: C.text, fontSize: 13, fontWeight: '600' },
  sub: { color: C.text3, fontSize: 11, marginTop: 1 },
  typeTile: { justifyContent: 'flex-end', padding: 14 },
  typeText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  play: { position: 'absolute', top: 12, right: 14, color: 'rgba(255,255,255,0.9)', fontSize: 18 },
  add: { borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  addPlus: { color: C.text, fontSize: 34, fontWeight: '300' },
  addText: { color: C.text2, fontSize: 13, fontWeight: '600', marginTop: 2 },
  remove: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  removeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  liftedCard: {
    position: 'absolute',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  bar: { position: 'absolute', left: 16, right: 16, bottom: 34 },
  sendBtn: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  sendText: { color: '#000', fontSize: 16, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(30,33,40,0.97)', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: C.line },
  pillMark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pillMarkText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  pillTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  pillSub: { color: C.text2, fontSize: 12, marginTop: 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 7, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#fff' },
})
