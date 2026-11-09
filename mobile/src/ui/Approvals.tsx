import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { PhoneApproval, PhoneLine } from '../islandTypes'
import type { DropLink } from '../link'
import { themed, useTheme, type Palette } from './theme'
import { Icon, type IconName } from './icons'
import { LEAVE } from './motion'

const toneColor = (C: Palette, t?: PhoneLine['tone']) => (t === 'up' ? C.green : t === 'down' ? C.red : t === 'warn' ? C.orange : C.text)

/** Seconds left on a trade, counted down here from when the view arrived. */
function useCountdown(a: PhoneApproval, seenAt: number): number | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (a.secondsLeft === undefined) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [a.secondsLeft])
  if (a.secondsLeft === undefined) return null
  return Math.max(0, Math.round(a.secondsLeft - (now - seenAt) / 1000))
}

/**
 * Something on your computer waiting for your answer: Claude Code wanting to
 * run a command or edit a file, its question or plan, the island assistant
 * about to act for you, or a trade. Only your tap answers it.
 */
export function ApprovalCard({ a, link, seenAt }: { a: PhoneApproval; link: DropLink; seenAt: number }) {
  const C = useTheme()
  const s = useS()
  const [busy, setBusy] = useState<'' | 'allow' | 'deny' | 'always'>('')
  const [error, setError] = useState('')
  const [answered, setAnswered] = useState<'' | 'allow' | 'deny'>('')
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [open, setOpen] = useState(false)
  const left = useCountdown(a, seenAt)

  const answer = async (decision: 'allow' | 'deny', extra: { always?: boolean; answers?: Record<string, string> } = {}) => {
    setBusy(extra.always ? 'always' : decision)
    setError('')
    void Haptics.impactAsync(decision === 'allow' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
    const r = await link.decide(a.id, decision, extra)
    setBusy('')
    if (r.ok) {
      setAnswered(decision)
      void Haptics.notificationAsync(decision === 'allow' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning)
    } else setError(r.message || 'That didn’t go through.')
  }

  const questions = a.questions ?? []
  const ready = questions.every((q) => (picks[q.question] ?? []).length > 0)
  const answers = Object.fromEntries(questions.map((q) => [q.question, (picks[q.question] ?? []).join(', ')]))
  const glyph: IconName = a.kind === 'trade' ? 'trend' : a.kind === 'agent' ? 'sparkle' : a.kind === 'question' ? 'question' : a.kind === 'plan' ? 'list' : 'terminal'

  return (
    <Animated.View
      exiting={LEAVE}
      style={[s.card, answered && { opacity: 0.5 }]}
    >
      <View style={[s.stripe, { backgroundColor: a.color }]} />
      <View style={s.head}>
        <View style={[s.glyph, { backgroundColor: a.color }]}>
          <Icon name={glyph} size={16} color="#fff" />
        </View>
        <Text style={s.app} numberOfLines={1}>
          {a.app}
          {a.where ? <Text style={s.where}>{`  ·  ${a.where}`}</Text> : null}
        </Text>
        {left !== null && (
          <View style={[s.timer, left <= 10 && { backgroundColor: 'rgba(255,69,58,0.18)' }]}>
            <Text style={[s.timerText, left <= 10 && { color: C.red }]}>{left}s</Text>
          </View>
        )}
      </View>

      <Text style={s.title}>{a.title}</Text>

      {a.kind === 'claude' && !!a.body && (
        <Pressable onPress={() => setOpen(!open)} style={s.code}>
          <Text style={s.codeText} numberOfLines={open ? undefined : 6}>
            {a.body}
          </Text>
        </Pressable>
      )}
      {a.kind === 'plan' && (
        <ScrollView style={s.plan} nestedScrollEnabled>
          <Text style={s.planText}>{a.body}</Text>
        </ScrollView>
      )}
      {(a.kind === 'agent' || a.kind === 'trade') && !!a.body && <Text style={s.body}>{a.body}</Text>}
      {!!a.lines?.length && (
        <View style={s.lines}>
          {a.lines.map((l, i) => (
            <View key={i} style={s.line}>
              <Text style={s.lineLabel}>{l.label}</Text>
              <Text style={[s.lineValue, { color: toneColor(C, l.tone) }]}>{l.value}</Text>
            </View>
          ))}
        </View>
      )}
      {!!a.note && <Text style={s.note}>{a.note}</Text>}

      {questions.map((q) => (
        <View key={q.question} style={{ marginTop: 10 }}>
          {questions.length > 1 && <Text style={s.qText}>{q.question}</Text>}
          <View style={s.options}>
            {q.options.map((o) => {
              const on = (picks[q.question] ?? []).includes(o.label)
              return (
                <Pressable
                  key={o.label}
                  style={[s.option, on && s.optionOn]}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    const cur = picks[q.question] ?? []
                    setPicks({ ...picks, [q.question]: q.multiSelect ? (on ? cur.filter((x) => x !== o.label) : [...cur, o.label]) : [o.label] })
                  }}
                >
                  <Text style={[s.optionText, on && { color: C.onPrimary }]}>{o.label}</Text>
                  {!!o.description && <Text style={[s.optionSub, on && { color: C.onPrimary, opacity: 0.7 }]}>{o.description}</Text>}
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}

      <View style={s.actions}>
        <Pressable disabled={!!busy || !!answered} style={({ pressed }) => [s.btn, s.deny, pressed && s.pressed]} onPress={() => void answer('deny')}>
          {busy === 'deny' ? <ActivityIndicator color={C.text} /> : <Text style={s.denyText}>{a.deny}</Text>}
        </Pressable>
        <Pressable
          disabled={!!busy || !!answered || (a.kind === 'question' && !ready)}
          style={({ pressed }) => [s.btn, s.allow, { backgroundColor: a.kind === 'trade' ? a.color : C.primary }, a.kind === 'question' && !ready && { opacity: 0.4 }, pressed && s.pressed]}
          onPress={() => void answer('allow', a.kind === 'question' ? { answers } : {})}
        >
          {busy === 'allow' ? <ActivityIndicator color="#000" /> : <Text style={s.allowText}>{a.allow}</Text>}
        </Pressable>
      </View>
      {a.canAlways && (
        <Pressable disabled={!!busy || !!answered} style={s.always} onPress={() => void answer('allow', { always: true })}>
          <Text style={s.alwaysText}>{busy === 'always' ? 'Allowing…' : 'Always allow this'}</Text>
        </Pressable>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </Animated.View>
  )
}

const useS = themed((C) => ({
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, paddingLeft: 18, borderWidth: C.dark ? 1 : 0, borderColor: C.line, overflow: 'hidden', ...C.shadow },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  glyph: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  app: { color: C.text2, fontSize: 13, fontWeight: '700', flex: 1 },
  where: { color: C.text3, fontWeight: '600' },
  timer: { backgroundColor: C.fill, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  timerText: { color: C.text2, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  title: { color: C.text, fontSize: 18, fontWeight: '700', marginTop: 10, letterSpacing: -0.2 },
  code: { backgroundColor: C.dark ? 'rgba(0,0,0,0.35)' : C.card2, borderRadius: 12, padding: 12, marginTop: 10 },
  codeText: { color: C.dark ? '#e5e5ea' : C.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  plan: { maxHeight: 220, backgroundColor: C.dark ? 'rgba(0,0,0,0.25)' : C.card2, borderRadius: 12, padding: 12, marginTop: 10 },
  planText: { color: C.text, fontSize: 14, lineHeight: 20 },
  body: { color: C.text2, fontSize: 14, lineHeight: 20, marginTop: 6 },
  lines: { marginTop: 10, backgroundColor: C.dark ? 'rgba(0,0,0,0.25)' : C.card2, borderRadius: 12, paddingVertical: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 7 },
  lineLabel: { color: C.text2, fontSize: 13 },
  lineValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { color: C.text3, fontSize: 13, marginTop: 10, lineHeight: 18 },
  qText: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  options: { gap: 8 },
  option: { backgroundColor: C.fill, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.line },
  optionOn: { backgroundColor: C.primary, borderColor: C.primary },
  optionText: { color: C.text, fontSize: 14, fontWeight: '700' },
  optionSub: { color: C.text3, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  deny: { backgroundColor: C.fill },
  allow: { backgroundColor: C.primary },
  pressed: { opacity: 0.75 },
  denyText: { color: C.text, fontSize: 15, fontWeight: '700' },
  allowText: { color: C.onPrimary, fontSize: 15, fontWeight: '700' },
  always: { alignSelf: 'center', paddingTop: 10 },
  alwaysText: { color: C.text2, fontSize: 13, fontWeight: '700' },
  error: { color: C.red, fontSize: 13, marginTop: 8 },
}))
