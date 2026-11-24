import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { PhoneApproval, PhoneLine } from '../islandTypes'
import type { DropLink } from '../link'
import { StatusDot } from './kit'
import { themed, useTheme, type Palette } from './theme'
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
  // How it stands: answered, running out (a trade), or waiting for you.
  const soon = left !== null && left <= 10
  const state = answered ? (answered === 'allow' ? 'Answered' : 'Turned down') : left !== null ? `Needs you · ${left}s left` : 'Needs you'

  return (
    <Animated.View exiting={LEAVE} style={[s.card, answered && { opacity: 0.5 }]}>
      <View style={s.head}>
        <Text style={s.app} numberOfLines={1}>
          {a.app}
        </Text>
        {!!a.where && (
          <Text style={s.where} numberOfLines={1}>
            {a.where}
          </Text>
        )}
      </View>
      <View style={{ marginTop: 10 }}>
        <StatusDot color={answered ? C.text3 : soon ? C.red : C.accent} text={state} />
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
        <View key={q.question} style={{ marginTop: 12 }}>
          {questions.length > 1 && <Text style={s.qText}>{q.question}</Text>}
          <View style={s.options}>
            {q.options.map((o) => {
              const on = (picks[q.question] ?? []).includes(o.label)
              return (
                <Pressable
                  key={o.label}
                  style={[s.option, on && s.optionOn]}
                  accessibilityRole={q.multiSelect ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    const cur = picks[q.question] ?? []
                    setPicks({ ...picks, [q.question]: q.multiSelect ? (on ? cur.filter((x) => x !== o.label) : [...cur, o.label]) : [o.label] })
                  }}
                >
                  <Text style={[s.optionText, on && { color: C.onPrimary }]}>{o.label}</Text>
                  {!!o.description && <Text style={[s.optionSub, on && { color: C.onPrimary, opacity: 0.8 }]}>{o.description}</Text>}
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
          style={({ pressed }) => [s.btn, s.allow, a.kind === 'question' && !ready && { opacity: 0.4 }, pressed && s.pressed]}
          onPress={() => void answer('allow', a.kind === 'question' ? { answers } : {})}
        >
          {busy === 'allow' ? <ActivityIndicator color={C.onPrimary} /> : <Text style={s.allowText}>{a.allow}</Text>}
        </Pressable>
      </View>
      {a.canAlways && (
        <Pressable disabled={!!busy || !!answered} hitSlop={6} style={s.always} onPress={() => void answer('allow', { always: true })}>
          <Text style={s.alwaysText}>{busy === 'always' ? 'Allowing…' : 'Always allow this'}</Text>
        </Pressable>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </Animated.View>
  )
}

const useS = themed((C) => ({
  card: { backgroundColor: C.card, borderRadius: 24, padding: 20, ...C.shadow },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  app: { color: C.text, fontSize: 15.5, fontWeight: '500', flexShrink: 0, maxWidth: '60%' },
  where: { color: C.text2, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  title: { color: C.text, fontSize: 24, lineHeight: 29, fontWeight: '500', letterSpacing: -0.7, marginTop: 3 },
  code: { backgroundColor: C.card2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  codeText: { color: C.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  plan: { maxHeight: 220, backgroundColor: C.card2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  planText: { color: C.text, fontSize: 14, lineHeight: 20 },
  body: { color: C.text2, fontSize: 14.5, lineHeight: 20, marginTop: 6 },
  lines: { marginTop: 14, backgroundColor: C.card2, borderRadius: 14, paddingVertical: 5 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 7 },
  lineLabel: { color: C.text2, fontSize: 14 },
  lineValue: { fontSize: 14.5, fontWeight: '500', fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },
  note: { color: C.text2, fontSize: 13.5, marginTop: 12, lineHeight: 19 },
  qText: { color: C.text, fontSize: 14.5, fontWeight: '500', marginBottom: 8 },
  options: { gap: 8 },
  option: { backgroundColor: C.card2, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 11 },
  optionOn: { backgroundColor: C.primary },
  optionText: { color: C.text, fontSize: 15, fontWeight: '500' },
  optionSub: { color: C.text2, fontSize: 13, marginTop: 2, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  deny: { backgroundColor: C.card2 },
  allow: { backgroundColor: C.primary },
  pressed: { opacity: 0.75 },
  denyText: { color: C.text, fontSize: 16, fontWeight: '500' },
  allowText: { color: C.onPrimary, fontSize: 16, fontWeight: '500' },
  always: { alignSelf: 'center', paddingTop: 12 },
  alwaysText: { color: C.text2, fontSize: 13.5 },
  error: { color: C.red, fontSize: 13, marginTop: 10 },
}))
