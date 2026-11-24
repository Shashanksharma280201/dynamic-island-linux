import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text, TextInput } from './Text'
import Animated from 'react-native-reanimated'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import type { SpCollection, SpDevice, SpHome, SpSearch, SpTrack, SpotifyView } from '../../../shared/spotify'
import type { SystemState } from '../../../shared/types'
import { arcOf, arcPath, arcPoint, arcValue } from '../dial'
import type { PhoneCharacter, PhoneMedia } from '../islandTypes'
import type { DropLink, Live } from '../link'
import { Btn, Card, Empty, ErrorLine, Heading, Kicker, Page, Row, StatusDot, useAction, useCall } from './kit'
import { Orb } from './Orb'
import { PRESSED } from './motion'
import { themed, useTheme } from './theme'
import { Icon } from './icons'

/**
 * What's playing, with the computer's volume on a dial, and Spotify on your
 * computer: search, your playlists, play anything, pick where it plays.
 */
export function MusicScreen({ link, live, top, onBack }: { link: DropLink; live: Live; top: number; onBack: () => void }) {
  const C = useTheme()
  const st = useSt()
  const sp = useCall<SpotifyView>(link, 'spotify.state', [], { topic: 'spotify', fromPush: true })
  const ready = sp.data?.status === 'ready'
  const home = useCall<SpHome>(link, 'spotify.home', [], { when: ready })
  const [q, setQ] = useState('')
  const [found, setFound] = useState<SpSearch | null>(null)
  const [devices, setDevices] = useState<SpDevice[] | null>(null)
  const act = useAction(link)

  const play = async (o: { contextUri?: string; trackUri?: string }, key: string, deviceId?: string) => {
    void Haptics.selectionAsync()
    const r = await act.run<{ ok?: true; needsDevice?: true }>(key, 'spotify.play', o, deviceId)
    if (r?.needsDevice) {
      const d = await act.run<SpDevice[]>('devices', 'spotify.devices')
      setDevices(d ?? [])
    }
  }
  const search = async () => {
    if (!q.trim()) return setFound(null)
    setFound(await act.run<SpSearch>('search', 'spotify.search', q.trim()))
  }
  const where = sp.data?.player?.device?.name ?? link.pairing.name

  return (
    <Page title="Music" top={top} onBack={onBack} onRefresh={async () => Promise.all([sp.reload(), home.reload()])}>
      {live.view?.media && <Playing media={live.view.media} link={link} where={where} orb={live.view.character} />}
      {sp.data && !ready && (
        <Card>
          <Kicker>Spotify</Kicker>
          <Text style={st.p}>{sp.data.status === 'needs-client' || sp.data.status === 'signed-out' ? 'Sign in to Spotify in the island’s Music tab on your computer, and you can search and play from here.' : (sp.data.error ?? 'Spotify is getting ready…')}</Text>
        </Card>
      )}
      {ready && (
        <>
          <View style={st.searchRow}>
            <TextInput style={st.search} placeholder="Songs, artists, playlists" placeholderTextColor={C.text3} value={q} onChangeText={setQ} onSubmitEditing={() => void search()} returnKeyType="search" />
            <Pressable onPress={() => void search()} disabled={act.busy === 'search'} accessibilityRole="button" accessibilityLabel="Search" style={({ pressed }) => [st.searchBtn, act.busy === 'search' && { opacity: 0.6 }, pressed && PRESSED]}>
              <Text style={st.searchText}>Search</Text>
            </Pressable>
          </View>
          <ErrorLine message={act.error} />
          {devices && (
            <Card>
              <Kicker>Play on</Kicker>
              {!devices.length && <Text style={st.p}>No Spotify device is open. Open Spotify on your computer or phone, then try again.</Text>}
              {devices.map((d, i) => (
                <Row
                  key={d.id}
                  title={d.name}
                  sub={d.type}
                  last={i === devices.length - 1}
                  right={d.active ? <StatusDot color={C.green} text="Playing here" /> : undefined}
                  onPress={async () => {
                    await act.run('transfer', 'spotify.transfer', d.id)
                    setDevices(null)
                  }}
                />
              ))}
            </Card>
          )}
          {found ? (
            <Results found={found} play={play} busy={act.busy} />
          ) : (
            home.data && (
              <>
                {!!home.data.playlists.length && <Shelf title="Your playlists" items={home.data.playlists} play={play} />}
                {!!home.data.recent.length && <Shelf title="Recently played" items={home.data.recent} play={play} />}
                {!!home.data.recentTracks.length && (
                  <>
                    <Heading>Recent songs</Heading>
                    <Card style={st.list}>
                      {home.data.recentTracks.slice(0, 8).map((t, i, a) => (
                        <TrackRow key={`${t.uri}-${i}`} t={t} last={i === a.length - 1} onPress={() => void play({ trackUri: t.uri }, t.uri)} />
                      ))}
                    </Card>
                  </>
                )}
              </>
            )
          )}
          <Btn
            label="Where it plays"
            style={{ marginTop: 6 }}
            onPress={async () => {
              setDevices((await act.run<SpDevice[]>('devices', 'spotify.devices')) ?? [])
            }}
          />
        </>
      )}
      {!sp.data && !sp.error && !live.view?.media && <Empty busy title="Looking at what’s playing…" />}
    </Page>
  )
}

/**
 * What's playing, large: the cover (or the orb, when there's none), the song,
 * the computer's volume on a dial you drag, and back, play and next.
 */
function Playing({ media, link, where, orb }: { media: PhoneMedia; link: DropLink; where: string; orb?: PhoneCharacter }) {
  const C = useTheme()
  const st = useSt()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!media.playing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [media.playing])
  // The computer's volume, looked at again every few seconds while this is open.
  const sys = useCall<SystemState>(link, 'system.read', [], { poll: 4000 })
  const act = useAction(link)
  const pos = media.position !== undefined ? media.position + (media.playing && media.positionAt ? (now - media.positionAt) / 1000 : 0) : undefined
  const frac = pos !== undefined && media.length ? Math.min(1, Math.max(0, pos / media.length)) : null
  const art = media.art ? link.imageSource(media.art) : null
  const cmd = (c: 'playpause' | 'next' | 'previous') => {
    void Haptics.selectionAsync()
    void link.media(c)
  }
  const setVolume = (v: number) => {
    if (sys.data) sys.setData({ ...sys.data, volume: v, muted: false })
    void act.run('volume', 'system.cmd', { type: 'volume', value: v })
  }
  return (
    <View style={st.playing}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="playing-wash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.accentPale} stopOpacity={1} />
            <Stop offset="0.62" stopColor={C.card} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#playing-wash)" />
      </Svg>
      <View style={st.chip}>
        <StatusDot color={media.playing ? C.green : C.text3} hollow={!media.playing} text={where} />
      </View>
      {art ? (
        <Image source={art} style={st.bigArt} />
      ) : (
        <View style={st.orbWell}>
          <Orb id={orb?.id} color={orb?.color} mood={media.playing ? 'dancing' : 'idle'} size={132} ring={false} />
        </View>
      )}
      <Text style={st.nowLabel}>{media.playing ? 'Now playing' : 'Paused'}</Text>
      <Text style={st.nowTitle} numberOfLines={2}>
        {media.title || 'Something'}
      </Text>
      {!!media.artist && (
        <Text style={st.nowArtist} numberOfLines={1}>
          {media.artist}
        </Text>
      )}
      {frac !== null && (
        <View style={st.progress}>
          <View style={[st.progressFill, { width: `${frac * 100}%` }]} />
        </View>
      )}
      {sys.data && <Dial value={sys.data.muted ? 0 : sys.data.volume} label={sys.data.muted ? 'Muted' : 'Volume'} onChange={setVolume} />}
      {media.canControl && (
        <View style={st.nowControls}>
          <Pressable hitSlop={8} onPress={() => cmd('previous')} style={({ pressed }) => [st.side, pressed && PRESSED]} accessibilityRole="button" accessibilityLabel="Previous">
            <Skip back color={C.text} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => cmd('playpause')} style={({ pressed }) => [st.play, pressed && PRESSED]} accessibilityRole="button" accessibilityLabel={media.playing ? 'Pause' : 'Play'}>
            <Icon name={media.playing ? 'pause' : 'play'} size={24} color={C.onPrimary} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => cmd('next')} style={({ pressed }) => [st.side, pressed && PRESSED]} accessibilityRole="button" accessibilityLabel="Next">
            <Skip color={C.text} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

/** Skip forward (or back): a triangle and a bar, in line. */
function Skip({ back, color }: { back?: boolean; color: string }) {
  return (
    <View style={back && { transform: [{ scaleX: -1 }] }}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path d="M6 6.5v11l9-5.5z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M18 6.5v11" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    </View>
  )
}

const TICKS = 40
const DIAL_H = 150

/**
 * A level from 0 to 100 on a shallow arc: ticks along it, lit up to the
 * level, a knob you drag (or tap anywhere along it), and the number large
 * underneath. `onChange` when let go, and now and then while dragging.
 */
function Dial({ value, label, onChange }: { value: number; label: string; onChange: (v: number) => void }) {
  const C = useTheme()
  const st = useSt()
  const [w, setW] = useState(0)
  const [shown, setShown] = useState(value)
  const held = useRef(false)
  useEffect(() => {
    if (!held.current) setShown(value)
  }, [value])
  const arc = arcOf(Math.max(1, w), 14, 44, 30)
  const last = useRef(0)
  const tell = (x: number, done: boolean) => {
    const v = Math.round(arcValue(arc, x) * 100)
    held.current = !done
    setShown(v)
    const t = Date.now()
    if (done || t - last.current > 180) {
      last.current = t
      onChange(v)
    }
  }
  const pan = usePanGesture({
    minDistance: 0,
    onActivate: (e) => {
      'worklet'
      scheduleOnRN(tell, e.x, false)
    },
    onUpdate: (e) => {
      'worklet'
      scheduleOnRN(tell, e.x, false)
    },
    onDeactivate: (e) => {
      'worklet'
      scheduleOnRN(tell, e.x, true)
    },
  })
  const t = shown / 100
  const knob = arcPoint(arc, t)
  return (
    <GestureDetector gesture={pan}>
      <View style={st.dial} onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: shown }}>
        {w > 0 && (
          <Svg width={w} height={DIAL_H}>
            {Array.from({ length: TICKS + 1 }, (_, i) => {
              const at = i / TICKS
              const long = i % 5 === 0
              const a = arcPoint(arc, at, 9)
              const b = arcPoint(arc, at, long ? 21 : 16)
              return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={at <= t + 0.0001 ? C.accent : C.text3} strokeOpacity={at <= t + 0.0001 ? 1 : 0.55} strokeWidth={1.4} strokeLinecap="round" />
            })}
            <Path d={arcPath(arc, 0, 1)} stroke={C.accentPale} strokeWidth={3} strokeLinecap="round" fill="none" />
            {t > 0 && <Path d={arcPath(arc, 0, t)} stroke={C.accent} strokeWidth={3} strokeLinecap="round" fill="none" />}
            <Circle cx={knob.x} cy={knob.y} r={12} fill={C.accent} opacity={0.18} />
            <Circle cx={knob.x} cy={knob.y} r={8.5} fill="#ffffff" stroke={C.accent} strokeWidth={2.5} />
          </Svg>
        )}
        <View style={st.dialRead} pointerEvents="none">
          <Text style={st.dialValue}>{shown}</Text>
          <Text style={st.dialLabel}>{label}</Text>
        </View>
      </View>
    </GestureDetector>
  )
}

function Results({ found, play, busy }: { found: SpSearch; play: (o: { contextUri?: string; trackUri?: string }, key: string) => void; busy: string }) {
  const st = useSt()
  const none = !found.tracks.length && !found.playlists.length && !found.albums.length && !found.artists.length
  if (none) return <Empty title="Nothing found" />
  return (
    <Animated.View style={{ gap: 10 }}>
      {!!found.tracks.length && (
        <>
          <Heading>Songs</Heading>
          <Card style={st.list}>
            {found.tracks.slice(0, 10).map((t, i, a) => (
              <TrackRow key={t.uri} t={t} last={i === a.length - 1} busy={busy === t.uri} onPress={() => play({ trackUri: t.uri }, t.uri)} />
            ))}
          </Card>
        </>
      )}
      {!!found.artists.length && <Shelf title="Artists" items={found.artists} play={play} round />}
      {!!found.albums.length && <Shelf title="Albums" items={found.albums} play={play} />}
      {!!found.playlists.length && <Shelf title="Playlists" items={found.playlists} play={play} />}
    </Animated.View>
  )
}

function TrackRow({ t, onPress, last, busy }: { t: SpTrack; onPress: () => void; last?: boolean; busy?: boolean }) {
  const C = useTheme()
  const st = useSt()
  return (
    <Row
      title={t.name}
      sub={t.artists}
      last={last}
      onPress={onPress}
      left={
        t.image ? (
          <Image source={{ uri: t.image }} style={st.cover} />
        ) : (
          <View style={[st.cover, st.empty]}>
            <Icon name="music" size={18} color={C.text2} />
          </View>
        )
      }
      right={
        <View style={[st.rowPlay, busy && { backgroundColor: C.accent }]}>
          <Icon name="play" size={13} color={busy ? C.onPrimary : C.text} />
        </View>
      }
    />
  )
}

/** Playlists, albums or artists side by side; tap one to play it. */
function Shelf({ title, items, play, round }: { title: string; items: SpCollection[]; play: (o: { contextUri?: string }, key: string) => void; round?: boolean }) {
  const C = useTheme()
  const st = useSt()
  return (
    <View>
      <Heading>{title}</Heading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.shelf} contentContainerStyle={st.shelfIn}>
        {items.slice(0, 16).map((c) => (
          <Animated.View key={c.uri}>
            <Pressable onPress={() => play({ contextUri: c.uri }, c.uri)} style={({ pressed }) => [{ width: 132 }, pressed && { opacity: 0.7 }]}>
              {c.image ? (
                <Image source={{ uri: c.image }} style={[st.tile, round && { borderRadius: 66 }]} />
              ) : (
                <View style={[st.tile, st.tileEmpty, round && { borderRadius: 66 }]}>
                  <Icon name={c.kind === 'liked' ? 'sparkle' : 'music'} size={30} color={C.text2} />
                </View>
              )}
              <Text style={st.tileTitle} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={st.tileSub} numberOfLines={1}>
                {c.subtitle}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  )
}

const useSt = themed((C) => ({
  p: { color: C.text2, fontSize: 14, lineHeight: 20 },
  playing: { borderRadius: 32, overflow: 'hidden', backgroundColor: C.card, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, alignItems: 'center', ...C.shadow },
  chip: { alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, height: 32, justifyContent: 'center', maxWidth: '100%' },
  bigArt: { width: 176, height: 176, borderRadius: 28, marginTop: 14 },
  orbWell: { width: 176, height: 176, borderRadius: 88, marginTop: 14, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...C.shadow },
  nowLabel: { color: C.text2, fontSize: 15, marginTop: 20 },
  nowTitle: { color: C.text, fontSize: 28, lineHeight: 32, fontWeight: '500', letterSpacing: -0.9, textAlign: 'center', marginTop: 2 },
  nowArtist: { color: C.text2, fontSize: 16, marginTop: 4, textAlign: 'center' },
  progress: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: C.accentPale, marginTop: 18, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: C.accent },
  dial: { alignSelf: 'stretch', height: DIAL_H, marginTop: 14 },
  dialRead: { position: 'absolute', left: 0, right: 0, top: 50, alignItems: 'center' },
  dialValue: { color: C.text, fontSize: 64, lineHeight: 68, fontWeight: '500', letterSpacing: -2.8, fontVariant: ['tabular-nums'] },
  dialLabel: { color: C.text2, fontSize: 13.5, marginTop: -2 },
  nowControls: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  side: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.card, borderRadius: 27, padding: 6, ...C.shadow },
  search: { flex: 1, minWidth: 0, paddingHorizontal: 14, height: 42, color: C.text, fontSize: 15.5 },
  searchBtn: { backgroundColor: C.primary, borderRadius: 21, paddingHorizontal: 18, height: 42, alignItems: 'center', justifyContent: 'center' },
  searchText: { color: C.onPrimary, fontSize: 15, fontWeight: '500' },
  list: { paddingVertical: 6, paddingHorizontal: 18 },
  cover: { width: 44, height: 44, borderRadius: 12 },
  empty: { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  rowPlay: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  // The shelf runs to the screen's edges; its tiles start in line with the cards.
  shelf: { marginHorizontal: -20, marginTop: 8 },
  shelfIn: { gap: 10, paddingHorizontal: 20 },
  tile: { width: 132, height: 132, borderRadius: 24 },
  tileEmpty: { backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { color: C.text, fontSize: 14.5, fontWeight: '500', marginTop: 8, paddingHorizontal: 4 },
  tileSub: { color: C.text2, fontSize: 13, marginTop: 1, paddingHorizontal: 4 },
}))
