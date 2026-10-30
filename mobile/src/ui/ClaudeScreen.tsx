import { useEffect, useRef } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { ClaudeRun, ClaudeUsage, ClaudeView } from '../../../shared/claude'
import type { DropLink } from '../link'
import { LiveDot } from './IslandScreen'
import { Composer, Empty, ErrorLine, Page, TAB_ROOM, useAction, useCall, useKeyboard } from './kit'
import { C } from './theme'

const folderOf = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd

/**
 * Talk to Claude Code on your computer, as in the island's Claude tab: type,
 * watch what it does step by step, read its reply, stop it, start over.
 * Anything it asks permission for comes to the Island tab (and a notification).
 */
export function ClaudeScreen({ link, top, bottom }: { link: DropLink; top: number; bottom: number }) {
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
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10 }} keyboardShouldPersistTaps="handled">
          {!v && !error && <Empty busy title="Reaching Claude on your computer…" />}
          {!!error && !v && <Empty title="Claude isn’t reachable" text={error} />}
          {v && !turns.length && !run && (
            <Empty
              title={ready ? 'Ask Claude anything' : 'Claude isn’t set up on the computer'}
              text={ready ? `It works in ${folderOf(v.cwd)} on your computer, like the island’s Claude tab. What it wants permission for comes to the Island tab.` : (v.assistant.problem ?? 'Install Claude Code, or pick an AI in the island’s Settings.')}
            />
          )}
          {turns.map((t, i) => (
            <Animated.View key={`${t.at}-${i}`} entering={FadeInDown.springify().damping(18)} layout={LinearTransition} style={{ gap: 8 }}>
              <Mine text={t.prompt} />
              <Theirs text={t.reply || (t.ok ? '(no reply)' : 'It didn’t finish.')} failed={!t.ok} />
            </Animated.View>
          ))}
          {run && (
            <Animated.View entering={FadeIn} layout={LinearTransition} style={{ gap: 8 }}>
              <Mine text={run.prompt} />
              <Working run={run} />
            </Animated.View>
          )}
          {v?.run && v.run.phase === 'error' && !!v.run.error && <ErrorLine message={v.run.error} />}
        </ScrollView>
        <View style={{ paddingHorizontal: 12, paddingBottom: kb ? 8 : bottom + TAB_ROOM, gap: 6 }}>
          <ErrorLine message={act.error} />
          {run ? (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                void act.run('stop', 'claude.stop')
              }}
              style={({ pressed }) => [st.stop, pressed && { transform: [{ scale: 0.97 }] }]}
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
  return (
    <View style={st.mine}>
      <Text style={st.mineText} selectable>
        {text}
      </Text>
    </View>
  )
}

function Theirs({ text, failed }: { text: string; failed?: boolean }) {
  return (
    <View style={[st.theirs, failed && { borderColor: 'rgba(255,69,58,0.35)' }]}>
      <Text style={st.theirsText} selectable>
        {text}
      </Text>
    </View>
  )
}

const PHASE: Record<string, string> = { starting: 'Starting…', thinking: 'Thinking…', tool: 'Working…', writing: 'Writing…' }

/** What Claude is doing right now: the step, the ones before it, and what it has written so far. */
function Working({ run }: { run: ClaudeRun }) {
  const trail = (run.trail ?? []).slice(-4)
  return (
    <View style={st.theirs}>
      <View style={st.status}>
        <LiveDot on color={C.orange} />
        <Text style={st.statusText} numberOfLines={1}>
          {run.tool?.detail ?? PHASE[run.phase] ?? 'Working…'}
        </Text>
        {run.steps > 0 && <Text style={st.steps}>{run.steps} steps</Text>}
      </View>
      {trail.length > 1 && (
        <View style={{ marginTop: 6, gap: 2 }}>
          {trail.slice(0, -1).map((t, i) => (
            <Text key={i} style={st.trail} numberOfLines={1}>
              ✓ {t}
            </Text>
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
        const color = p >= 90 ? C.red : p >= 70 ? C.orange : C.green
        return (
          <View key={label} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={st.usageLabel}>{label}</Text>
              <Text style={[st.usageLabel, { color }]}>{Math.round(p)}%</Text>
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

const st = StyleSheet.create({
  newBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  newText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mine: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: '#d97757', borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  mineText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  theirs: { alignSelf: 'flex-start', maxWidth: '94%', backgroundColor: C.card, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.line },
  theirsText: { color: C.text, fontSize: 15, lineHeight: 22 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: C.text2, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  steps: { color: C.text3, fontSize: 12, fontWeight: '700' },
  trail: { color: C.text3, fontSize: 12 },
  stop: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,69,58,0.16)', borderRadius: 22, height: 52 },
  stopSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: C.red },
  stopText: { color: C.red, fontSize: 16, fontWeight: '800' },
  usage: { flexDirection: 'row', gap: 16, marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  usageLabel: { color: C.text2, fontSize: 12, fontWeight: '700' },
  usageTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 6, overflow: 'hidden' },
  usageFill: { height: 5, borderRadius: 3 },
  usageReset: { color: C.text3, fontSize: 11, marginTop: 4 },
})
