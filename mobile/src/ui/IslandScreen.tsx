import { useEffect, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { PhoneMedia, PhoneSession, PhoneTrading } from '../islandTypes'
import type { DropLink, Live } from '../link'
import { ApprovalCard } from './Approvals'
import { C } from './theme'

/** A dot that breathes while things are live. */
export function LiveDot({ on, color }: { on: boolean; color: string }) {
  const p = useSharedValue(1)
  useEffect(() => {
    p.value = on ? withRepeat(withSequence(withTiming(0.35, { duration: 900 }), withTiming(1, { duration: 900 })), -1) : withTiming(1)
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: p.value }))
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />
}

/** Your computer's island: what's waiting for you, what's playing, your trades and sessions. */
export function IslandScreen({ link, live, top }: { link: DropLink; live: Live; top: number }) {
  const [refreshing, setRefreshing] = useState(false)
  const v = live.view
  const color = live.phase === 'live' ? C.green : live.phase === 'connecting' ? C.orange : C.red
  const status = live.phase === 'live' ? 'Live' : live.phase === 'connecting' ? 'Connecting…' : live.phase === 'off' ? 'Not connected' : 'Can’t reach it'
  const quiet = v && !v.approvals.length && !v.media && !v.trading && !v.sessions.some((x) => x.phase === 'working' || x.phase === 'waiting')

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingTop: top + 8, paddingBottom: 120, gap: 14 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor="#fff"
          onRefresh={async () => {
            setRefreshing(true)
            await link.refresh()
            setRefreshing(false)
          }}
        />
      }
    >
      <View>
        <Text style={s.h1} numberOfLines={1}>
          {link.pairing.name}
        </Text>
        <View style={s.status}>
          <LiveDot on={live.phase === 'live'} color={color} />
          <Text style={s.statusText}>{status}</Text>
          {v?.dnd && <Text style={s.dnd}>Do Not Disturb</Text>}
        </View>
        {live.phase === 'offline' && !!live.error && <Text style={s.error}>{live.error}</Text>}
      </View>

      {!!v?.approvals.length && (
        <Animated.View layout={LinearTransition} style={{ gap: 12 }}>
          <Text style={s.section}>Waiting for you</Text>
          {v.approvals.map((a) => (
            <ApprovalCard key={a.id} a={a} link={link} seenAt={live.seenAt ?? Date.now()} />
          ))}
        </Animated.View>
      )}

      {v?.media && <NowPlaying media={v.media} link={link} />}
      {v?.trading && <Trading t={v.trading} />}
      {!!v?.sessions.length && <Sessions list={v.sessions} />}

      {quiet && (
        <Animated.View entering={FadeIn.duration(400)} style={s.quiet}>
          <Text style={s.quietTitle}>All quiet</Text>
          <Text style={s.quietText}>When Claude Code asks for permission, a trade needs your OK, or the assistant wants to act for you, it shows up here and as a notification, ready to answer.</Text>
        </Animated.View>
      )}
    </ScrollView>
  )
}

function NowPlaying({ media, link }: { media: PhoneMedia; link: DropLink }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!media.playing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [media.playing])
  const pos = media.position !== undefined ? media.position + (media.playing && media.positionAt ? (now - media.positionAt) / 1000 : 0) : undefined
  const frac = pos !== undefined && media.length ? Math.min(1, Math.max(0, pos / media.length)) : null
  const art = media.art ? link.imageSource(media.art) : null
  const cmd = (c: 'playpause' | 'next' | 'previous') => {
    void Haptics.selectionAsync()
    void link.media(c)
  }
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} layout={LinearTransition} style={s.card}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        {art ? <Image source={art} style={s.art} /> : <View style={[s.art, { backgroundColor: C.card2 }]} />}
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Now playing</Text>
          <Text style={s.track} numberOfLines={1}>
            {media.title || 'Something'}
          </Text>
          <Text style={s.artist} numberOfLines={1}>
            {media.artist}
          </Text>
        </View>
      </View>
      {frac !== null && (
        <View style={s.track2}>
          <View style={[s.fill, { width: `${frac * 100}%` }]} />
        </View>
      )}
      {media.canControl && (
        <View style={s.controls}>
          <Pressable hitSlop={10} onPress={() => cmd('previous')} style={({ pressed }) => [s.ctl, pressed && s.pressed]}>
            <Text style={s.ctlText}>⏮</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={() => cmd('playpause')} style={({ pressed }) => [s.play, pressed && s.pressed]}>
            <Text style={s.playText}>{media.playing ? '❚❚' : '▶'}</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={() => cmd('next')} style={({ pressed }) => [s.ctl, pressed && s.pressed]}>
            <Text style={s.ctlText}>⏭</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  )
}

function Trading({ t }: { t: PhoneTrading }) {
  const tone = t.tone === 'up' ? C.green : t.tone === 'down' ? C.red : t.tone === 'warn' ? C.orange : C.text
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} layout={LinearTransition} style={s.card}>
      <Text style={s.kicker}>{t.app}</Text>
      <Text style={[s.pnl, { color: tone }]}>{t.text}</Text>
      <Text style={s.artist}>{t.detail}</Text>
    </Animated.View>
  )
}

const PHASE: Record<string, [string, string]> = {
  working: ['Working', C.blue],
  waiting: ['Needs you', C.orange],
  done: ['Done', C.green],
  idle: ['Idle', C.text3],
}

function Sessions({ list }: { list: PhoneSession[] }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} layout={LinearTransition} style={s.card}>
      <Text style={s.kicker}>Claude Code</Text>
      {list.slice(0, 6).map((x) => {
        const [label, color] = PHASE[x.phase] ?? [x.phase, C.text3]
        return (
          <View key={x.id} style={s.session}>
            <View style={{ flex: 1 }}>
              <Text style={s.project} numberOfLines={1}>
                {x.project}
              </Text>
              <Text style={s.step} numberOfLines={1}>
                {x.step ?? x.prompt ?? ''}
              </Text>
            </View>
            {(x.added > 0 || x.removed > 0) && (
              <Text style={s.diff}>
                <Text style={{ color: C.green }}>+{x.added}</Text> <Text style={{ color: C.red }}>−{x.removed}</Text>
              </Text>
            )}
            <View style={[s.phase, { backgroundColor: `${color}22` }]}>
              {x.phase === 'working' && <LiveDot on color={color} />}
              <Text style={[s.phaseText, { color }]}>{label}</Text>
            </View>
          </View>
        )
      })}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  h1: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusText: { color: C.text2, fontSize: 14, fontWeight: '600' },
  dnd: { color: C.violet, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  error: { color: C.red, fontSize: 13, marginTop: 6, lineHeight: 18 },
  section: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C.line },
  art: { width: 64, height: 64, borderRadius: 12 },
  kicker: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  track: { color: C.text, fontSize: 17, fontWeight: '800', marginTop: 3 },
  artist: { color: C.text2, fontSize: 14, marginTop: 2 },
  track2: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 14, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#fff', borderRadius: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34, marginTop: 14 },
  ctl: { padding: 6 },
  ctlText: { color: C.text, fontSize: 22 },
  play: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#000', fontSize: 18, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.92 }], opacity: 0.85 },
  pnl: { fontSize: 32, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  session: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, marginTop: 6 },
  project: { color: C.text, fontSize: 15, fontWeight: '700' },
  step: { color: C.text3, fontSize: 12, marginTop: 2 },
  diff: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  phase: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  phaseText: { fontSize: 12, fontWeight: '800' },
  quiet: { backgroundColor: C.card, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: C.line },
  quietTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  quietText: { color: C.text2, fontSize: 14, lineHeight: 20, marginTop: 6 },
})
