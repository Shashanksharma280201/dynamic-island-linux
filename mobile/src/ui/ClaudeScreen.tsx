import { useEffect, useRef } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native'
import { Text } from './Text'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { ClaudeRun, ClaudeUsage, ClaudeView } from '../../../shared/claude'
import type { DropLink } from '../link'
import { LiveDot } from './IslandScreen'
import { Composer, Empty, ErrorLine, Page, SIDE, StatusDot, TAB_ROOM, useAction, useCall, useKeyboard } from './kit'
import { themed, useTheme } from './theme'
import { Icon } from './icons'

const folderOf = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd

/**
 * Talk to Claude Code on your computer, as in the island's Claude tab: type,
 * watch what it does step by step, read its reply, stop it, start over.
 * Anything it asks permission for comes to the Island tab (and a notification).
 */
export function ClaudeScreen({ link, top, bottom }: { link: DropLink; top: number; bottom: number }) {
  const st = useSt()
  const { data: v, error, reload } = useCall<ClaudeView>(link, 'claude.state', [], { topic: 'claude', fromPush: true })
  const act = useAction(link)
  const scroll = useRef<ScrollViewInstance>(null)
  const kb = useKeyboard()
  const run = v?.run && !['done', 'error', 'stopped'].includes(v.run.phase) ? v.run : null
  const turns = v?.turns ?? []

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [turns.length, run?.reply, run?.steps])

  const ready = !!v && (v.assistant.problem === null || v.assistant.provider !== 'claude-code' || !!v.binary)
  const sub = v ? `${v.assistant.label}${v.assistant.provider === 'claude-code' ? ` · ${folderOf(v.cwd)}` : ''}` : 'Connecting…'

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page
        title="Claude"
        sub={sub}
        top={top}
        scroll={false}
        right={
          !!turns.length && (
            <Pressable
              hitSlop={10}
              onPress={() =>
                Alert.alert('Start a new conversation?', 'Claude won’t remember this one.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'New', onPress: () => void act.run('new', 'claude.new').then(() => reload()) },
                ])
              }
              style={({ pressed }) => [st.newBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={st.newText}>New</Text>
            </Pressable>
          )
        }
      >
        {v?.usage && <Usage u={v.usage} />}
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: SIDE, paddingTop: 4, gap: 10 }} keyboardShouldPersistTaps="handled">
          {!v && !error && <Empty busy title="Reaching Claude on your computer…" />}
          {!!error && !v && <Empty title="Claude isn’t reachable" text={error} />}
          {v && !turns.length && !run && (
            <Empty
              title={ready ? 'Ask Claude anything' : 'Claude isn’t set up on the computer'}
              text={ready ? `It works in ${folderOf(v.cwd)} on your computer, like the island’s Claude tab. What it wants permission for comes to the Island tab.` : (v.assistant.problem ?? 'Install Claude Code, or pick an AI in the island’s Settings.')}
            />
          )}
          {turns.map((t, i) => (
            <Animated.View key={`${t.at}-${i}`} style={{ gap: 8 }}>
              <Mine text={t.prompt} />
              <Theirs text={t.reply || (t.ok ? '(no reply)' : 'It didn’t finish.')} failed={!t.ok} />
            </Animated.View>
          ))}
          {run && (
            <Animated.View style={{ gap: 8 }}>
              <Mine text={run.prompt} />
              <Working run={run} />
            </Animated.View>
          )}
          {v?.run && v.run.phase === 'error' && !!v.run.error && <ErrorLine message={v.run.error} />}
        </ScrollView>
        <View style={{ paddingHorizontal: SIDE - 4, paddingBottom: kb ? 8 : bottom + TAB_ROOM, gap: 6 }}>
          <ErrorLine message={act.error} />
          {run ? (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                void act.run('stop', 'claude.stop')
              }}
              style={({ pressed }) => [st.stop, pressed && { opacity: 0.75 }]}
            >
              <View style={st.stopSquare} />
              <Text style={st.stopText}>Stop</Text>
            </Pressable>
          ) : (
            <Composer
              placeholder={turns.length ? 'Reply to Claude…' : 'Ask Claude to do something…'}
              busy={act.busy === 'ask'}
              onSend={async (text) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                return (await act.run('ask', 'claude.ask', text)) !== null
              }}
            />
          )}
        </View>
      </Page>
    </KeyboardAvoidingView>
  )
}

function Mine({ text }: { text: string }) {
  const st = useSt()
  return (
    <View style={st.mine}>
      <Text style={st.mineText} selectable>
        {text}
      </Text>
    </View>
  )
}

function Theirs({ text, failed }: { text: string; failed?: boolean }) {
  const C = useTheme()
  const st = useSt()
  return (
    <View style={st.theirs}>
      {failed && (
        <View style={{ marginBottom: 6 }}>
          <StatusDot color={C.red} text="It stopped before the end" />
        </View>
      )}
      <Text style={st.theirsText} selectable>
        {text}
      </Text>
    </View>
  )
}

const PHASE: Record<string, string> = { starting: 'Starting…', thinking: 'Thinking…', tool: 'Working…', writing: 'Writing…' }

/** What Claude is doing right now: the step, the ones before it, and what it has written so far. */
function Working({ run }: { run: ClaudeRun }) {
  const C = useTheme()
  const st = useSt()
  const trail = (run.trail ?? []).slice(-4)
  return (
    <View style={st.theirs}>
      <View style={st.status}>
        <LiveDot on color={C.green} />
        <Text style={st.statusText} numberOfLines={1}>
          {run.tool?.detail ?? PHASE[run.phase] ?? 'Working…'}
        </Text>
        {run.steps > 0 && <Text style={st.steps}>{run.steps} steps</Text>}
      </View>
      {trail.length > 1 && (
        <View style={{ marginTop: 6, gap: 2 }}>
          {trail.slice(0, -1).map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={12} color={C.text3} />
              <Text style={[st.trail, { flex: 1 }]} numberOfLines={1}>
                {t}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!!(run.reply || run.partial) && (
        <Text style={[st.theirsText, { marginTop: 8 }]} selectable>
          {run.reply || run.partial}
        </Text>
      )}
    </View>
  )
}

/** Your plan's limits: the 5-hour window and the week. */
function Usage({ u }: { u: ClaudeUsage }) {
  const C = useTheme()
  const st = useSt()
  const bars: [string, number | undefined, number | undefined][] = [
    ['5-hour', u.fiveHour?.pct, u.fiveHour?.resetsAt],
    ['Week', u.sevenDay?.pct, u.sevenDay?.resetsAt],
  ]
  const shown = bars.filter(([, p]) => p !== undefined)
  if (!shown.length) return null
  return (
    <View style={st.usage}>
      {shown.map(([label, pct, at]) => {
        const p = Math.min(100, Math.max(0, pct ?? 0))
        // The accent while there's plenty; orange, then red, as it runs out.
        const color = p >= 90 ? C.red : p >= 70 ? C.orange : C.accent
        return (
          <View key={label} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={st.usageLabel}>{label}</Text>
              <Text style={st.usageValue}>{Math.round(p)}%</Text>
            </View>
            <View style={st.usageTrack}>
              <View style={[st.usageFill, { width: `${p}%`, backgroundColor: color }]} />
            </View>
            {!!at && <Text style={st.usageReset}>Resets {new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>}
          </View>
        )
      })}
    </View>
  )
}

const useSt = themed((C) => ({
  newBtn: { backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 18, height: 40, justifyContent: 'center', ...C.shadow },
  newText: { color: C.text, fontSize: 15 },
  mine: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: C.primary, borderRadius: 22, borderBottomRightRadius: 8, paddingHorizontal: 16, paddingVertical: 11 },
  mineText: { color: C.onPrimary, fontSize: 15.5, lineHeight: 22 },
  theirs: { alignSelf: 'flex-start', maxWidth: '94%', backgroundColor: C.card, borderRadius: 22, borderBottomLeftRadius: 8, paddingHorizontal: 16, paddingVertical: 12, ...C.shadow },
  theirsText: { color: C.text, fontSize: 15.5, lineHeight: 23 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: C.text, fontSize: 14.5, fontWeight: '500', flexShrink: 1 },
  steps: { color: C.text2, fontSize: 12.5, flexShrink: 0 },
  trail: { color: C.text2, fontSize: 12.5 },
  stop: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.dark ? 'rgba(255,107,94,0.16)' : 'rgba(229,72,77,0.1)', borderRadius: 999, height: 54 },
  stopSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: C.red },
  stopText: { color: C.red, fontSize: 16, fontWeight: '500' },
  usage: { flexDirection: 'row', gap: 22, marginHorizontal: SIDE, marginBottom: 10, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.card, borderRadius: 24, ...C.shadow },
  usageLabel: { color: C.text2, fontSize: 13.5 },
  usageValue: { color: C.text, fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  usageTrack: { height: 6, borderRadius: 3, backgroundColor: C.accentPale, marginTop: 8, overflow: 'hidden' },
  usageFill: { height: 6, borderRadius: 3 },
  usageReset: { color: C.text3, fontSize: 12, marginTop: 6 },
}))
