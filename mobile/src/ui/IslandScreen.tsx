import { useEffect, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
import { useActivity } from '../activity'
import { linkMode, linkReadout, linkStatus } from '../linkStatus'
import { LinkFigure, type LinkMode } from '../iso/LinkFigure'
import type { PhoneMedia, PhoneSession, PhoneTrading } from '../islandTypes'
import type { DropLink, Live, LinkState } from '../link'
import { routeName } from '../protocol'
import { ApprovalCard } from './Approvals'
import { Icon } from './icons'
import { themed, useTheme, type Palette } from './theme'

/** A dot that breathes while things are live. */
export function LiveDot({ on, color }: { on: boolean; color: string }) {
  const p = useSharedValue(1)
  useEffect(() => {
    p.value = on ? withRepeat(withSequence(withTiming(0.35, { duration: 900 }), withTiming(1, { duration: 900 })), -1) : withTiming(1)
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: p.value }))
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />
}

/** Your computer's island: the link to it, what's waiting for you, what's playing, your trades and sessions. */
export function IslandScreen({ link, live, state, top, active = true, onOpen }: { link: DropLink; live: Live; state: LinkState; top: number; active?: boolean; onOpen?: (id: 'trading' | 'music') => void }) {
  const C = useTheme()
  const s = useS()
  const act = useActivity()
  const [refreshing, setRefreshing] = useState(false)
  const v = live.view
  const mode = linkMode(state, live, act)
  const color = mode === 'offline' ? C.red : mode === 'searching' ? C.orange : C.green
  const quiet = v && !v.approvals.length && !v.media && !v.trading && !v.sessions.some((x) => x.phase === 'working' || x.phase === 'waiting')

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingTop: top + 4, paddingBottom: 120, gap: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={C.text2}
          colors={[C.accent]}
          progressBackgroundColor={C.card}
          onRefresh={async () => {
            setRefreshing(true)
            await Promise.all([link.ping(), link.refresh()])
            setRefreshing(false)
          }}
        />
      }
    >
      <View style={s.head}>
        <Text style={s.eyebrow}>Your computer</Text>
        <Text style={s.h1} numberOfLines={1}>
          {link.pairing.name}
        </Text>
        <View style={s.status}>
          <View style={[s.pill, { backgroundColor: `${color}1f` }]}>
            <LiveDot on={mode !== 'offline'} color={color} />
            <Text style={[s.pillText, { color }]}>{linkStatus(mode)}</Text>
          </View>
          {v?.dnd && (
            <View style={[s.pill, { backgroundColor: `${C.violet}1f` }]}>
              <Icon name="moon" size={13} color={C.violet} />
              <Text style={[s.pillText, { color: C.violet }]}>Do Not Disturb</Text>
            </View>
          )}
        </View>
      </View>

      <LinkFigure
        mode={mode}
        ms={state.ms}
        title={state.route ? `Link · ${routeName(state.route)}` : 'Link'}
        readout={linkReadout(mode, state, live, act)}
        hint={mode === 'offline' ? 'Tap to try again' : 'Tap to test'}
        active={active}
        onTest={() => void link.ping()}
      />
      {mode === 'offline' && !!(state.error || live.error) && (
        <View style={s.problem}>
          <Icon name="info" size={18} color={C.red} />
          <Text style={s.problemText}>{state.error || live.error}</Text>
        </View>
      )}

      {!!v?.approvals.length && (
        <Animated.View layout={LinearTransition} style={{ gap: 12 }}>
          <Text style={s.section}>Waiting for you · {v.approvals.length}</Text>
          {v.approvals.map((a) => (
            <ApprovalCard key={a.id} a={a} link={link} seenAt={live.seenAt ?? Date.now()} />
          ))}
        </Animated.View>
      )}

      {v?.media && (
        <Pressable onPress={() => onOpen?.('music')}>
          <NowPlaying media={v.media} link={link} />
        </Pressable>
      )}
      {v?.trading && (
        <Pressable onPress={() => onOpen?.('trading')} style={({ pressed }) => pressed && { transform: [{ scale: 0.985 }] }}>
          <Trading t={v.trading} />
        </Pressable>
      )}
      {!!v?.sessions.length && <Sessions list={v.sessions} />}

      {quiet && (
        <Animated.View entering={FadeIn.duration(400)} style={s.quiet}>
          <View style={s.quietIcon}>
            <Icon name="check" size={20} color={C.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.quietTitle}>Nothing needs you</Text>
            <Text style={s.quietText}>Permission requests from Claude Code, trades to approve and the assistant’s questions show up here and as notifications.</Text>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  )
}

export function NowPlaying({ media, link }: { media: PhoneMedia; link: DropLink }) {
  const C = useTheme()
  const s = useS()
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
          <Pressable hitSlop={10} onPress={() => cmd('previous')} style={({ pressed }) => [s.ctl, pressed && s.pressed]} accessibilityLabel="Previous">
            <SkipIcon back color={C.text} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => cmd('playpause')} style={({ pressed }) => [s.play, pressed && s.pressed]} accessibilityLabel={media.playing ? 'Pause' : 'Play'}>
            <Icon name={media.playing ? 'pause' : 'play'} size={22} color={C.onPrimary} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => cmd('next')} style={({ pressed }) => [s.ctl, pressed && s.pressed]} accessibilityLabel="Next">
            <SkipIcon color={C.text} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  )
}

function Trading({ t }: { t: PhoneTrading }) {
  const C = useTheme()
  const s = useS()
  const tone = t.tone === 'up' ? C.green : t.tone === 'down' ? C.red : t.tone === 'warn' ? C.orange : C.text
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} layout={LinearTransition} style={s.card}>
      <Text style={s.kicker}>{t.app}</Text>
      <Text style={[s.pnl, { color: tone }]}>{t.text}</Text>
      <Text style={s.artist}>{t.detail}</Text>
    </Animated.View>
  )
}

/** Skip forward (or back): two triangles and a bar. */
function SkipIcon({ back, color }: { back?: boolean; color: string }) {
  return (
    <View style={back && { transform: [{ scaleX: -1 }] }}>
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path d="M4 6.5v11l7-5.5zM11.5 6.5v11l7-5.5z" fill={color} />
        <Path d="M20 6.5v11" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  )
}

const phaseOf = (C: Palette): Record<string, [string, string]> => ({
  working: ['Working', C.blue],
  waiting: ['Needs you', C.orange],
  done: ['Done', C.green],
  idle: ['Idle', C.text3],
})

function Sessions({ list }: { list: PhoneSession[] }) {
  const C = useTheme()
  const s = useS()
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} layout={LinearTransition} style={s.card}>
      <Text style={s.kicker}>Claude Code</Text>
      {list.slice(0, 6).map((x) => {
        const [label, color] = phaseOf(C)[x.phase] ?? [x.phase, C.text3]
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

const useS = themed((C) => ({
  head: { paddingHorizontal: 4, paddingTop: 4 },
  eyebrow: { color: C.text3, fontSize: 13, fontWeight: '600' },
  h1: { color: C.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 13, fontWeight: '600' },
  problem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: C.dark ? 'rgba(255,69,58,0.1)' : 'rgba(229,52,43,0.07)', borderRadius: 14, padding: 12 },
  problemText: { color: C.text, fontSize: 13.5, lineHeight: 19, flex: 1 },
  section: { color: C.text2, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: C.dark ? 1 : 0, borderColor: C.line, ...C.shadow },
  art: { width: 64, height: 64, borderRadius: 12 },
  kicker: { color: C.text3, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  track: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 3 },
  artist: { color: C.text2, fontSize: 14, marginTop: 2 },
  track2: { height: 4, borderRadius: 2, backgroundColor: C.fill, marginTop: 14, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: C.text, borderRadius: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 14 },
  ctl: { padding: 6 },
  play: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.92 }], opacity: 0.85 },
  pnl: { fontSize: 30, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  session: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, marginTop: 6 },
  project: { color: C.text, fontSize: 15, fontWeight: '600' },
  step: { color: C.text3, fontSize: 12.5, marginTop: 2 },
  diff: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  phase: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  phaseText: { fontSize: 12, fontWeight: '600' },
  quiet: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: C.dark ? 1 : 0, borderColor: C.line, ...C.shadow },
  quietIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${C.green}22`, alignItems: 'center', justifyContent: 'center' },
  quietTitle: { color: C.text, fontSize: 16, fontWeight: '600' },
  quietText: { color: C.text2, fontSize: 13.5, lineHeight: 19, marginTop: 3 },
}))
