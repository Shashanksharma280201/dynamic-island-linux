import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { FlatList, GestureDetector, usePanGesture, useTapGesture, useExclusiveGestures } from 'react-native-gesture-handler'
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import { addFiles, loadTray, recentMedia, removeFromTray, thumbOf, whenText, type Item } from '../files'
import { EDGES, computerSide } from '../gesture'
import type { DropLink } from '../link'
import { newDropId, sizeText, type Side } from '../protocol'
import { forgetReceived, openReceived, type Received } from '../received'
import { sendAll, setSideUsed, sideUsed, sizeOf } from '../send'
import { Face } from './Face'
import { Aurora, EdgeGlow, Wash } from './Glow'
import { SendPill, type Sending } from './SendPill'
import { C } from './theme'
import { useFlick } from './useFlick'

const GAP = 10
const PAD = 16
type Tab = 'photos' | 'files' | 'received'

/**
 * Your photos, the files you added, and what the computer sent. Hold one and
 * it lifts under your finger; move it toward the edge that faces your
 * computer and both screens light up there; let go near the edge (or flick)
 * and it flies across. Tap one to send it with a button instead.
 */
export function FilesScreen({ link, received, setReceived, top }: { link: DropLink; received: Received[]; setReceived: (r: Received[]) => void; top: number }) {
  const { width: W, height: H } = useWindowDimensions()
  const [tab, setTab] = useState<Tab>('photos')
  const [media, setMedia] = useState<{ items: Item[]; allowed: boolean; canAsk: boolean } | null>(null)
  const [tray, setTray] = useState<Item[]>(() => loadTray())
  const [lifted, setLifted] = useState<Item | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [sending, setSending] = useState<Sending | null>(null)
  const drag = useRef({ id: '', approached: '' as '' | Side, thumb: undefined as Promise<string | undefined> | undefined })
  const tile = (W - PAD * 2 - GAP) / 2
  const card = tile * 0.84

  const loadMedia = () => void recentMedia().then(setMedia, () => setMedia({ items: [], allowed: false, canAsk: false }))
  useEffect(loadMedia, [])

  const info = (item: Item) => ({ name: item.name, size: sizeOf(item) })

  const deliver = async (item: Item, id: string, side: Side, along: number, approach: boolean, thumb?: Promise<string | undefined>) => {
    setSending({ key: id, name: item.name, p: 0, phase: 'sending' })
    const r = await sendAll(link, id, [item], side, along, { approach, thumb, onProgress: (p) => setSending((s) => (s && s.key === id && s.phase === 'sending' ? { ...s, p } : s)) })
    setSending({ key: id, name: r.name ?? item.name, p: 1, phase: r.ok ? 'sent' : 'failed', message: r.ok ? undefined : r.message })
    if (!r.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }

  const flick = useFlick(W, H, card, {
    approach: (side, along) => {
      const item = lifted
      if (!item) return
      drag.current.approached = side
      void Haptics.selectionAsync()
      void (async () => {
        const thumb = await Promise.race([drag.current.thumb ?? Promise.resolve(undefined), new Promise<undefined>((r) => setTimeout(r, 450))])
        await link.approach(drag.current.id, side, along, [info(item)], thumb)
      })()
    },
    leave: () => {
      if (drag.current.approached) void link.cancel(drag.current.id)
      drag.current.approached = ''
    },
    send: (side, along) => {
      const item = lifted
      if (!item) return
      setSideUsed(side)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      void deliver(item, drag.current.id, side, along, drag.current.approached !== side, drag.current.thumb)
      setTimeout(() => setLifted(null), 320)
    },
    back: () => setLifted(null),
  })

  const onLift = (item: Item) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    drag.current = { id: newDropId(), approached: '', thumb: thumbOf(item) }
    setSelected(null)
    setLifted(item)
  }

  const sendSelected = (item: Item) => {
    setSelected(null)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const side = sideUsed()
    flick.flash(EDGES.indexOf(computerSide(side)))
    void deliver(item, newDropId(), side, 0.5, true, thumbOf(item))
  }

  const items: Item[] = tab === 'photos' ? (media?.items ?? []) : tab === 'files' ? tray : received
  const data = tab === 'files' ? [ADD, ...items] : items
  const sel = selected ? items.find((i) => i.key === selected) : null

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={(i: Item) => i.key}
        numColumns={2}
        scrollEnabled={!lifted}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: top + 8, paddingBottom: 170, gap: GAP }}
        ListHeaderComponent={
          <View style={{ marginBottom: 6 }}>
            <Text style={s.h1}>Files</Text>
            <Text style={s.hint}>Hold one, then flick it toward {link.pairing.name}.</Text>
            <Segments tab={tab} setTab={setTab} counts={{ received: received.length }} />
            {tab === 'photos' && media && !media.allowed && (
              <View style={s.notice}>
                <Text style={s.noticeText}>Island Drop needs to see your photos to list them here.</Text>
                <Pressable style={s.small} onPress={() => (media.canAsk ? loadMedia() : void Linking.openSettings())}>
                  <Text style={s.smallText}>{media.canAsk ? 'Allow photos' : 'Open settings'}</Text>
                </Pressable>
              </View>
            )}
            {tab === 'photos' && !media && <ActivityIndicator style={{ marginTop: 20 }} color={C.text3} />}
            {tab === 'received' && !received.length && <Text style={s.empty}>Files your computer sends show up here. Send one from its tray menu, or drag a file to the edge of its screen where your phone is.</Text>}
          </View>
        }
        renderItem={({ item }: { item: Item }) =>
          item.key === ADD.key ? (
            <Pressable style={[s.add, { width: tile, height: tile + 44 }]} onPress={() => void addFiles(tray).then(setTray, (e) => Alert.alert('Couldn’t add that', String(e?.message ?? e)))}>
              <Text style={s.addPlus}>+</Text>
              <Text style={s.addText}>Add files</Text>
            </Pressable>
          ) : (
            <Tile
              item={item}
              size={tile}
              hidden={lifted?.key === item.key}
              selected={selected === item.key}
              from={(item as Received).from}
              onTap={() => setSelected(selected === item.key ? null : item.key)}
              onLift={onLift}
              flick={flick}
              onRemove={tab === 'files' ? () => setTray(removeFromTray(tray, item.key)) : tab === 'received' ? () => setReceived(forgetReceived(received, item.key)) : undefined}
              onOpen={tab === 'received' ? () => void openReceived(item as Received) : undefined}
            />
          )
        }
      />

      <EdgeGlow edge={flick.edge} along={flick.along} level={flick.level} w={W} h={H} />
      <Aurora edge={flick.edge} along={flick.along} level={flick.level} t={flick.ring} out={flick.ringOut} w={W} h={H} />
      <Animated.View pointerEvents="none" style={[s.liftedCard, { width: card, height: card }, flick.cardStyle]}>
        {lifted && <Face item={lifted} size={card} />}
      </Animated.View>
      <Wash level={flick.wash} />

      {sel && !lifted && (
        <Animated.View entering={FadeIn.duration(160)} style={s.bar}>
          <Pressable style={({ pressed }) => [s.sendBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => sendSelected(sel)}>
            <Text style={s.sendText} numberOfLines={1}>
              Send to {link.pairing.name}
            </Text>
          </Pressable>
        </Animated.View>
      )}
      {sending && !sel && <SendPill sending={sending} to={link.pairing.name} onDismiss={() => setSending(null)} />}
    </View>
  )
}

const ADD: Item = { key: '__add', uri: '', name: '', size: 0, kind: 'file', when: 0 }

function Segments({ tab, setTab, counts }: { tab: Tab; setTab: (t: Tab) => void; counts: { received: number } }) {
  const tabs: [Tab, string][] = [
    ['photos', 'Photos'],
    ['files', 'Files'],
    ['received', counts.received ? `Received · ${counts.received}` : 'Received'],
  ]
  const [w, setW] = useState(0)
  const i = tabs.findIndex(([t]) => t === tab)
  const x = useSharedValue(0)
  useEffect(() => {
    x.value = withTiming(i * (w / tabs.length), { duration: 220 })
  }, [i, w]) // eslint-disable-line react-hooks/exhaustive-deps
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  return (
    <View style={s.tabs} onLayout={(e) => setW(e.nativeEvent.layout.width - 6)}>
      {w > 0 && <Animated.View style={[s.tabPill, { width: w / tabs.length }, pill]} />}
      {tabs.map(([t, label]) => (
        <Pressable key={t} style={s.tab} onPress={() => setTab(t)}>
          <Text style={[s.tabText, tab === t && { color: '#000' }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function Tile({
  item,
  size,
  hidden,
  selected,
  from,
  onTap,
  onLift,
  flick,
  onRemove,
  onOpen,
}: {
  item: Item
  size: number
  hidden: boolean
  selected: boolean
  from?: string
  onTap: () => void
  onLift: (item: Item) => void
  flick: ReturnType<typeof useFlick>
  onRemove?: () => void
  onOpen?: () => void
}) {
  const lift = (it: Item) => onLift(it)
  const pan = usePanGesture({
    activateAfterLongPress: 240,
    onActivate: (e) => {
      'worklet'
      flick.lift(e.absoluteX - e.x + size / 2, e.absoluteY - e.y + size / 2, e.absoluteX, e.absoluteY)
      scheduleOnRN(lift, item)
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
  const tap = useTapGesture({
    onActivate: () => {
      'worklet'
      scheduleOnRN(onTap)
    },
  })
  const gesture = useExclusiveGestures(pan, tap)
  return (
    <Animated.View layout={LinearTransition.duration(200)} style={{ width: size, opacity: hidden ? 0.2 : 1 }}>
      <GestureDetector gesture={gesture}>
        <View>
          <View style={[s.face, selected && s.faceOn]}>
            <Face item={item} size={size} />
          </View>
          <View style={s.meta}>
            <Text style={s.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={s.sub} numberOfLines={1}>
              {item.size ? `${sizeText(item.size)} · ` : ''}
              {from ? `from ${from} · ` : ''}
              {whenText(item.when)}
            </Text>
          </View>
        </View>
      </GestureDetector>
      {selected && (onRemove || onOpen) && (
        <View style={s.tileActions}>
          {onOpen && (
            <Pressable style={s.chip} hitSlop={6} onPress={onOpen}>
              <Text style={s.chipText}>Open</Text>
            </Pressable>
          )}
          {onRemove && (
            <Pressable style={s.chip} hitSlop={6} onPress={onRemove}>
              <Text style={s.chipText}>Remove</Text>
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  h1: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  hint: { color: C.text3, fontSize: 13, marginTop: 4 },
  empty: { color: C.text3, fontSize: 14, lineHeight: 20, marginTop: 18 },
  tabs: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 3, marginTop: 14, marginBottom: 8 },
  tabPill: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 9, backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabText: { color: C.text2, fontSize: 13, fontWeight: '700' },
  notice: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 6, gap: 10 },
  noticeText: { color: C.text2, fontSize: 14, lineHeight: 19 },
  small: { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  smallText: { color: '#000', fontWeight: '700', fontSize: 13 },
  face: { borderRadius: 18, overflow: 'hidden', backgroundColor: C.card },
  faceOn: { borderWidth: 2, borderColor: '#fff' },
  meta: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 2 },
  name: { color: C.text, fontSize: 13, fontWeight: '600' },
  sub: { color: C.text3, fontSize: 11, marginTop: 1 },
  add: { borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  addPlus: { color: C.text, fontSize: 34, fontWeight: '300' },
  addText: { color: C.text2, fontSize: 13, fontWeight: '600', marginTop: 2 },
  tileActions: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6 },
  chip: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  liftedCard: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  bar: { position: 'absolute', left: 16, right: 16, bottom: 100 },
  sendBtn: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  sendText: { color: '#000', fontSize: 16, fontWeight: '800' },
})
