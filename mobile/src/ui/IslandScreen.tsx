import { useEffect, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
import type { ClaudeView } from '../../../shared/claude'
import { useActivity } from '../activity'
import { linkMode, linkStatus } from '../linkStatus'
import { moodWords } from '../orb'
import { islandSummary } from '../summary'
import { Btn, DotGauge, GAP, Heading, Hero, RoundBtn, SIDE, Segmented, StatusDot, Tile, useCall } from './kit'
import { Orb } from './Orb'
import { PRESSED } from './motion'
import type { PhoneMedia, PhoneSession, PhoneTrading } from '../islandTypes'
import type { DropLink, Live, LinkState } from '../link'
import { ApprovalCard } from './Approvals'
import type { MoreId } from './MoreScreen'
import type { TabId } from './TabBar'
import { TalkButton } from './TalkButton'
import { TodayBody, useToday } from './TodayScreen'
import { Icon } from './icons'
import { fitSize, themed, useTheme, type Palette } from './theme'

/** A status dot: solid while live, hollow when not. */
export function LiveDot({ on, color }: { on: boolean; color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? color : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: color }} />
}

type Face = 'now' | 'today'
const FACES: [Face, string][] = [
  ['now', 'Now'],
  ['today', 'Today'],
]

/**
 * Your computer's island. Now: how many things are waiting for you, the orb
 * and your coding sessions, each thing to answer, then what's playing, your
 * trades and how much Claude is left. Today: your day there.
 */
export function IslandScreen({ link, live, state, top, active = true, onOpen, onTab, face: first = 'now' }: { link: DropLink; live: Live; state: LinkState; top: number; active?: boolean; onOpen?: (id: MoreId) => void; onTab?: (t: TabId) => void; face?: Face }) {
  const C = useTheme()
  const s = useS()
  const act = useActivity()
  const [refreshing, setRefreshing] = useState(false)
  const [face, setFace] = useState<Face>(first)
  const v = live.view
  const mode = linkMode(state, live, act)
  const offline = mode === 'offline'
  const name = link.pairing.name
  // The orb and what it's doing, as the widget and the lock screen say it.
  const sum = islandSummary(v, mode, name)
  const orb = sum.orb
  const mood = offline ? 'sleeping' : orb.mood
  const waiting = v?.approvals.length ?? 0
  const sessions = v?.sessions ?? []
  const quiet = !!v && !waiting && !v.media && !v.trading && !sessions.some((x) => x.phase === 'working' || x.phase === 'waiting')
  const today = useToday(link, face === 'today' && !offline)
  // How much of Claude's five hours is used (the computer knows; not asked for while it can't be reached).
  const claude = useCall<ClaudeView>(link, 'claude.state', [], { topic: 'claude', fromPush: true, when: !offline })
  // What's on the computer now: only while it can be reached and has said so.
  const here = !offline && !!v
  const usage = here ? claude.data?.usage?.fiveHour : undefined
  const dot = offline ? C.red : mode === 'searching' ? C.orange : C.green
  const agents = sessions.every((x) => x.agent === 'claude') ? 'Claude Code' : 'Coding agents'

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: SIDE, paddingTop: top, paddingBottom: 130, gap: GAP }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={C.text2}
          colors={[C.accent]}
          progressBackgroundColor={C.card}
          onRefresh={async () => {
            setRefreshing(true)
            await Promise.all([link.ping(), link.refresh(), face === 'today' ? today.reload() : null])
            setRefreshing(false)
          }}
        />
      }
    >
      <View style={s.head}>
        <View style={[s.orbButton, offline && { opacity: 0.5 }]}>
          <Orb id={orb.id} color={orb.color} mood={mood} size={28} active={active} ring={false} />
        </View>
        <View style={s.headMid}>
          <StatusDot color={dot} hollow={offline} text={`${linkStatus(mode)}${v?.dnd && !offline ? ' · Do Not Disturb' : ''}`} />
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <RoundBtn icon="gear" label="Settings" onPress={() => onOpen?.('settings')} />
      </View>

      <Segmented items={FACES} value={face} onChange={setFace} style={{ marginTop: 6 }} />

      {face === 'today' ? (
        offline ? (
          <Hero word value="Offline" label={`Can’t reach ${name}`} hint="Your day shows when the link is back." />
        ) : (
          <TodayBody t={today} />
        )
      ) : (
        <>
          {offline ? (
            <View style={{ alignItems: 'center', gap: 14 }}>
              <Hero word value="Offline" label={`Can’t reach ${name}`} hint={state.error || live.error || 'It shows here again as soon as the link is back.'} />
              <Btn label="Try again" icon="refresh" onPress={() => void link.ping()} />
            </View>
          ) : !v ? (
            <Hero word value="Connecting" label={`Looking for ${name}`} />
          ) : (
            <Hero value={String(waiting)} label={waiting ? 'Waiting for you' : 'Nothing needs you'} hint={quiet ? 'What Claude Code asks, trades to approve and the assistant’s questions show up here, and as notifications.' : undefined} />
          )}

          {here && (
            <>
              <View style={s.pair}>
                <Tile top={<Orb id={orb.id} color={orb.color} mood={mood} size={44} active={active} />} label={orb.name} value={moodWords(orb.mood)} />
                <Tile top={<Icon name="terminal" size={26} />} label={agents} value={sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'No sessions'} onPress={onTab ? () => onTab('claude') : undefined} />
              </View>

              {waiting > 0 && (
                <>
                  <Heading>Approvals</Heading>
                  {v.approvals.map((a) => (
                    <ApprovalCard key={a.id} a={a} link={link} seenAt={live.seenAt ?? Date.now()} />
                  ))}
                </>
              )}

              <TalkButton link={link} name={orb.name} />

              {(usage?.pct !== undefined || v.trading) && (
                <View style={s.pair}>
                  {usage?.pct !== undefined && <UsageCard pct={usage.pct} onPress={onTab ? () => onTab('claude') : undefined} />}
                  {v.trading && <TradingCard t={v.trading} onPress={() => onOpen?.('trading')} />}
                </View>
              )}

              {v.media && (
                <Pressable onPress={() => onOpen?.('music')}>
                  <NowPlaying media={v.media} link={link} />
                </Pressable>
              )}

              {sessions.length > 0 && (
                <>
                  <Heading>Sessions</Heading>
                  <Sessions list={sessions} />
                </>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  )
}

/** How much of Claude's five hours is used: the number, in a word how that is, and the level drawn in squares. */
function UsageCard({ pct, onPress }: { pct: number; onPress?: () => void }) {
  const C = useTheme()
  const s = useS()
  const p = Math.min(100, Math.max(0, pct))
  const low = p >= 70
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.metric, pressed && PRESSED]} accessibilityLabel={`Claude, ${Math.round(p)} percent of the five hours used`}>
      <View style={s.metricHead}>
        <Text style={s.metricTitle}>Claude</Text>
        <Text style={s.metricNote} numberOfLines={1}>
          5-hour
        </Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <StatusDot color={p >= 90 ? C.red : low ? C.orange : C.green} text={p >= 90 ? 'Nearly out' : low ? 'Running low' : 'Plenty left'} />
      </View>
      <View style={s.metricValueRow}>
        <Text style={s.metricValue}>{Math.round(p)}</Text>
        <Text style={s.metricUnit}>% used</Text>
      </View>
      <View style={{ flex: 1 }} />
      <DotGauge pct={p} />
    </Pressable>
  )
}

/** Your trading today: up or down, the number, and where it stands. */
function TradingCard({ t, onPress }: { t: PhoneTrading; onPress: () => void }) {
  const C = useTheme()
  const s = useS()
  const [word, color] = t.tone === 'up' ? ['Up today', C.green] : t.tone === 'down' ? ['Down today', C.red] : t.tone === 'warn' ? ['Take a look', C.orange] : ['Flat today', C.text3]
  const [w, setW] = useState(0)
  const size = fitSize(t.text, w, 30)
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.metric, pressed && PRESSED]} accessibilityLabel={`${t.app}, ${t.text}, ${t.detail}`}>
      <View style={s.metricHead}>
        <Text style={s.metricTitle} numberOfLines={1}>
          {t.app}
        </Text>
        <Icon name="chevron" size={14} color={C.text3} />
      </View>
      <View style={{ marginTop: 12 }}>
        <StatusDot color={color} text={word} />
      </View>
      <View style={s.metricValueRow} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Text style={[s.metricValue, { fontSize: size, letterSpacing: -size / 30 }]} numberOfLines={1}>
          {t.text}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <Text style={s.metricDetail} numberOfLines={2}>
        {t.detail}
      </Text>
    </Pressable>
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
    <Animated.View style={s.card}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        {art ? (
          <Image source={art} style={s.art} />
        ) : (
          <View style={[s.art, s.artEmpty]}>
            <Icon name="music" size={24} color={C.text2} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <StatusDot color={media.playing ? C.green : C.text3} hollow={!media.playing} text={media.playing ? 'Now playing' : 'Paused'} />
          <Text style={s.track} numberOfLines={1}>
            {media.title || 'Something'}
          </Text>
          {!!media.artist && (
            <Text style={s.artist} numberOfLines={1}>
              {media.artist}
            </Text>
          )}
        </View>
      </View>
      {frac !== null && (
        <View style={s.track2}>
          <View style={[s.fill, { width: `${frac * 100}%` }]} />
        </View>
      )}
      {media.canControl && (
        <View style={s.controls}>
          <Pressable hitSlop={8} onPress={() => cmd('previous')} style={({ pressed }) => [s.ctl, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel="Previous">
            <SkipIcon back color={C.text} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => cmd('playpause')} style={({ pressed }) => [s.play, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={media.playing ? 'Pause' : 'Play'}>
            <Icon name={media.playing ? 'pause' : 'play'} size={22} color={C.onPrimary} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => cmd('next')} style={({ pressed }) => [s.ctl, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel="Next">
            <SkipIcon color={C.text} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  )
}

/** Skip forward (or back): a triangle and a bar, in line. */
function SkipIcon({ back, color }: { back?: boolean; color: string }) {
  return (
    <View style={back && { transform: [{ scaleX: -1 }] }}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path d="M6 6.5v11l9-5.5z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M18 6.5v11" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    </View>
  )
}

const phaseOf = (C: Palette): Record<string, [string, string]> => ({
  working: ['Working', C.green],
  waiting: ['Needs you', C.accent],
  done: ['Done', C.text3],
  idle: ['Idle', C.text3],
})

/** Each coding session: its project, what it's on, what it changed, and how it stands. */
function Sessions({ list }: { list: PhoneSession[] }) {
  const C = useTheme()
  const s = useS()
  return (
    <Animated.View style={[s.card, { paddingVertical: 8 }]}>
      {list.slice(0, 6).map((x, i) => {
        const [label, color] = phaseOf(C)[x.phase] ?? [x.phase, C.text3]
        const step = x.step ?? x.prompt ?? ''
        return (
          <View key={x.id} style={[s.session, i > 0 && s.sessionLine]}>
            <View style={s.sessionTop}>
              <Text style={s.project} numberOfLines={1}>
                {x.project}
              </Text>
              <StatusDot color={color} hollow={x.phase === 'done' || x.phase === 'idle'} text={label} />
            </View>
            <View style={s.sessionTop}>
              <Text style={s.step} numberOfLines={1}>
                {step}
              </Text>
              {(x.added > 0 || x.removed > 0) && (
                <Text style={s.diff}>
                  +{x.added} −{x.removed}
                </Text>
              )}
            </View>
          </View>
        )
      })}
    </Animated.View>
  )
}

const useS = themed((C) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orbButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...C.shadow },
  headMid: { flex: 1, minWidth: 0, alignItems: 'center' },
  name: { color: C.text, fontSize: 19, fontWeight: '500', letterSpacing: -0.3, marginTop: 1, maxWidth: '100%' },
  pair: { flexDirection: 'row', gap: GAP },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 20, ...C.shadow },
  metric: { flex: 1, minWidth: 0, minHeight: 184, backgroundColor: C.card, borderRadius: 24, padding: 18, ...C.shadow },
  metricHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  metricTitle: { color: C.text, fontSize: 15.5, fontWeight: '500', flexShrink: 1 },
  metricNote: { color: C.text2, fontSize: 13, flexShrink: 1 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2, minHeight: 36 },
  metricValue: { color: C.text, fontSize: 30, lineHeight: 36, fontWeight: '500', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  metricUnit: { color: C.text2, fontSize: 13 },
  metricDetail: { color: C.text2, fontSize: 13, lineHeight: 18 },
  art: { width: 60, height: 60, borderRadius: 18 },
  artEmpty: { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  track: { color: C.text, fontSize: 19, fontWeight: '500', letterSpacing: -0.4, marginTop: 4 },
  artist: { color: C.text2, fontSize: 14.5, marginTop: 1 },
  track2: { height: 4, borderRadius: 2, backgroundColor: C.accentPale, marginTop: 18, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  ctl: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  pressed: PRESSED,
  session: { paddingVertical: 12, gap: 3 },
  sessionLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  sessionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  project: { color: C.text, fontSize: 15.5, fontWeight: '500', flex: 1, minWidth: 0 },
  step: { color: C.text2, fontSize: 13.5, flex: 1, minWidth: 0 },
  diff: { color: C.text2, fontSize: 12.5, fontVariant: ['tabular-nums'] },
}))
