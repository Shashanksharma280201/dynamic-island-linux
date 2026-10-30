import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { SpCollection, SpDevice, SpHome, SpSearch, SpTrack, SpotifyView } from '../../../shared/spotify'
import type { DropLink, Live } from '../link'
import { NowPlaying } from './IslandScreen'
import { Btn, Card, Empty, ErrorLine, Kicker, Page, Row, useAction, useCall } from './kit'
import { C } from './theme'

const SPOTIFY = '#1db954'

/** What's playing, and Spotify on your computer: search, your playlists, play anything, pick where it plays. */
export function MusicScreen({ link, live, top, onBack }: { link: DropLink; live: Live; top: number; onBack: () => void }) {
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

  return (
    <Page title="Music" sub={sp.data?.player?.device ? `Playing on ${sp.data.player.device.name}` : undefined} top={top} onBack={onBack} onRefresh={async () => Promise.all([sp.reload(), home.reload()])}>
      {live.view?.media && <NowPlaying media={live.view.media} link={link} />}
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
            <Btn small kind="accent" label="Search" busy={act.busy === 'search'} onPress={() => void search()} />
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
                  right={d.active ? <Text style={{ color: SPOTIFY, fontWeight: '800' }}>Active</Text> : undefined}
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
                  <Card>
                    <Kicker>Recent songs</Kicker>
                    {home.data.recentTracks.slice(0, 8).map((t, i, a) => (
                      <TrackRow key={`${t.uri}-${i}`} t={t} last={i === a.length - 1} onPress={() => void play({ trackUri: t.uri }, t.uri)} />
                    ))}
                  </Card>
                )}
              </>
            )
          )}
          <Btn
            label="Where it plays"
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

function Results({ found, play, busy }: { found: SpSearch; play: (o: { contextUri?: string; trackUri?: string }, key: string) => void; busy: string }) {
  const none = !found.tracks.length && !found.playlists.length && !found.albums.length && !found.artists.length
  if (none) return <Empty title="Nothing found" />
  return (
    <Animated.View entering={FadeIn} style={{ gap: 12 }}>
      {!!found.tracks.length && (
        <Card>
          <Kicker>Songs</Kicker>
          {found.tracks.slice(0, 10).map((t, i, a) => (
            <TrackRow key={t.uri} t={t} last={i === a.length - 1} busy={busy === t.uri} onPress={() => play({ trackUri: t.uri }, t.uri)} />
          ))}
        </Card>
      )}
      {!!found.artists.length && <Shelf title="Artists" items={found.artists} play={play} round />}
      {!!found.albums.length && <Shelf title="Albums" items={found.albums} play={play} />}
      {!!found.playlists.length && <Shelf title="Playlists" items={found.playlists} play={play} />}
    </Animated.View>
  )
}

function TrackRow({ t, onPress, last, busy }: { t: SpTrack; onPress: () => void; last?: boolean; busy?: boolean }) {
  return (
    <Row
      title={t.name}
      sub={t.artists}
      last={last}
      onPress={onPress}
      left={t.image ? <Image source={{ uri: t.image }} style={st.cover} /> : <View style={[st.cover, { backgroundColor: C.card2 }]} />}
      right={<Text style={{ color: busy ? SPOTIFY : C.text3, fontSize: 18 }}>▶</Text>}
    />
  )
}

/** Playlists, albums or artists side by side; tap one to play it. */
function Shelf({ title, items, play, round }: { title: string; items: SpCollection[]; play: (o: { contextUri?: string }, key: string) => void; round?: boolean }) {
  return (
    <View>
      <Text style={st.section}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {items.slice(0, 16).map((c, i) => (
          <Animated.View key={c.uri} entering={FadeInDown.delay(Math.min(i, 8) * 30).springify().damping(18)}>
            <Pressable onPress={() => play({ contextUri: c.uri }, c.uri)} style={({ pressed }) => [{ width: 120 }, pressed && { transform: [{ scale: 0.96 }] }]}>
              {c.image ? <Image source={{ uri: c.image }} style={[st.tile, round && { borderRadius: 60 }]} /> : <View style={[st.tile, { backgroundColor: C.card2 }, round && { borderRadius: 60 }]} />}
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

const st = StyleSheet.create({
  p: { color: C.text2, fontSize: 14, lineHeight: 20 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  search: { flex: 1, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.line },
  cover: { width: 42, height: 42, borderRadius: 6 },
  section: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  tile: { width: 120, height: 120, borderRadius: 12 },
  tileTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  tileSub: { color: C.text3, fontSize: 12, marginTop: 1 },
})
