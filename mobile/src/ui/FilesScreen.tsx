import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, View, useWindowDimensions } from 'react-native'
import { Text } from './Text'
import { FlatList, GestureDetector, usePanGesture, useTapGesture, useExclusiveGestures } from 'react-native-gesture-handler'
import Animated from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import { addFiles, addFolder, loadTray, recentMedia, removeFromTray, thumbOf, whenText, type Item } from '../files'
import { EDGES, computerSide } from '../gesture'
import type { DropLink } from '../link'
import { newDropId, sizeText, type Side } from '../protocol'
import { forgetReceived, openReceived, type Received } from '../received'
import { filesOf, sendAll, setSideUsed, sideUsed } from '../send'
import { Face } from './Face'
import { FolderSheet } from './FolderSheet'
import { Aurora, EdgeGlow, Wash } from './Glow'
import { Segmented } from './kit'
import { SendPill, type Sending } from './SendPill'
import { themed, useTheme } from './theme'
import { useFlick } from './useFlick'
import { Icon } from './icons'

const GAP = 10
const PAD = 20
type Tab = 'photos' | 'files' | 'received'

/**
 * Your photos, the files you added, and what the computer sent. Hold one and
 * it lifts under your finger; move it toward the edge that faces your
 * computer and both screens light up there; let go near the edge (or flick)
 * and it flies across. Tap one to send it with a button instead.
 */
export function FilesScreen({ link, received, setReceived, top }: { link: DropLink; received: Received[]; setReceived: (r: Received[]) => void; top: number }) {
  const C = useTheme()
  const s = useS()
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

  // What the computer is told is coming: the file, or every file of a folder (in its folders).
  const infos = (item: Item) => filesOf([item]).map((f) => (f.dir ? { name: f.name, size: f.size, dir: f.dir } : { name: f.name, size: f.size }))

  const deliver = async (item: Item, id: string, side: Side, along: number, approach: boolean, thumb?: Promise<string | undefined>) => {
    setSending({ key: id, name: item.name, p: 0, phase: 'sending' })
    const r = await sendAll(link, id, filesOf([item]), side, along, { approach, thumb, onProgress: (p) => setSending((s) => (s && s.key === id && s.phase === 'sending' ? { ...s, p } : s)) })
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
        await link.approach(drag.current.id, side, along, infos(item), thumb)
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

  const [folder, setFolder] = useState<Item | null>(null)
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
            <Segmented
              items={[
                ['photos', 'Photos'],
                ['files', 'Files'],
                ['received', received.length ? `Received · ${received.length}` : 'Received'],
              ]}
              value={tab}
              onChange={setTab}
              style={{ marginTop: 16, marginBottom: 10 }}
            />
            {tab === 'photos' && media && !media.allowed && (
              <View style={s.notice}>
                <View style={s.noticeIcon}>
                  <Icon name="photo" size={26} color={C.text2} />
                </View>
                <Text style={s.noticeTitle}>Your photos, ready to send</Text>
                <Text style={s.noticeText}>Allow Island Drop to see your photos and they appear here, newest first, to flick to {link.pairing.name}.</Text>
                <Pressable style={({ pressed }) => [s.small, pressed && { opacity: 0.8 }]} onPress={() => (media.canAsk ? loadMedia() : void Linking.openSettings())}>
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
            <Pressable
              style={[s.add, { width: tile, height: tile + 44 }]}
              onPress={() => {
                const failed = (e: any) => Alert.alert('Couldn’t add that', String(e?.message ?? e))
                Alert.alert('Add to send', 'Files of any kind, or a whole folder (sent with everything in it).', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'A folder', onPress: () => void addFolder(tray).then(setTray, failed) },
                  { text: 'Files', onPress: () => void addFiles(tray).then(setTray, failed) },
                ])
              }}
            >
              <View style={s.addRound}>
                <Icon name="plus" size={20} />
              </View>
              <Text style={s.addText}>Files or a folder</Text>
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
              onOpen={tab === 'received' ? () => (item.kind === 'folder' ? setFolder(item) : void openReceived(item as Received)) : undefined}
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
        <Animated.View style={s.bar}>
          <Pressable style={({ pressed }) => [s.sendBtn, pressed && { opacity: 0.8 }]} onPress={() => sendSelected(sel)}>
            <Text style={s.sendText} numberOfLines={1}>
              Send to {link.pairing.name}
            </Text>
          </Pressable>
        </Animated.View>
      )}
      {sending && !sel && <SendPill sending={sending} to={link.pairing.name} onDismiss={() => setSending(null)} />}
      {folder && <FolderSheet folder={folder} onClose={() => setFolder(null)} />}
    </View>
  )
}

const ADD: Item = { key: '__add', uri: '', name: '', size: 0, kind: 'file', when: 0 }

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
  const s = useS()
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
    <Animated.View style={{ width: size, opacity: hidden ? 0.2 : 1 }}>
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
              {item.kind === 'folder' ? `${item.count ?? 0} ${item.count === 1 ? 'file' : 'files'} · ` : ''}
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

const useS = themed((C) => ({
  h1: { color: C.text, fontSize: 32, fontWeight: '500', letterSpacing: -1 },
  hint: { color: C.text2, fontSize: 13.5, marginTop: 3 },
  empty: { color: C.text2, fontSize: 14, lineHeight: 20, marginTop: 18, textAlign: 'center', paddingHorizontal: 12 },
  notice: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 44, gap: 8 },
  noticeIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginBottom: 6, ...C.shadow },
  noticeTitle: { color: C.text, fontSize: 20, fontWeight: '500', letterSpacing: -0.3, textAlign: 'center' },
  noticeText: { color: C.text2, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  small: { backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 22, height: 46, justifyContent: 'center', marginTop: 10 },
  smallText: { color: C.onPrimary, fontWeight: '500', fontSize: 15 },
  face: { borderRadius: 24, overflow: 'hidden', backgroundColor: C.card },
  faceOn: { borderWidth: 2.5, borderColor: C.accent },
  meta: { paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4 },
  name: { color: C.text, fontSize: 14, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 12, marginTop: 1 },
  add: { borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 10 },
  addRound: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...C.shadow },
  addText: { color: C.text2, fontSize: 14 },
  tileActions: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6 },
  // On a picture: a white pill, whatever the theme.
  chip: { backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: 13, height: 32, justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.22)' },
  chipText: { color: '#1d1d1d', fontSize: 13, fontWeight: '500' },
  liftedCard: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.12)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
  },
  bar: { position: 'absolute', left: PAD, right: PAD, bottom: 96 },
  sendBtn: { backgroundColor: C.primary, borderRadius: 999, minHeight: 54, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', ...C.shadow },
  sendText: { color: C.onPrimary, fontSize: 16, fontWeight: '500' },
}))
