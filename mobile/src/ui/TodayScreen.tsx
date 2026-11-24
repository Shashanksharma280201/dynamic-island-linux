import { useState } from 'react'
import { View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { Text } from './Text'
import type { OsAnswer, TodayView } from '../../../shared/os'
import type { DropLink } from '../link'
import { dayColumns, dayPeaks, type DayColumn } from '../dayChart'
import { Btn, Card, Composer, Empty, ErrorLine, Heading, Hero, Page, Row, useAction, useCall } from './kit'
import { themed, useTheme } from './theme'
import { answerLine, clock, dayTitle } from '../words'

/** What a timeline entry came from, in a word. */
const FROM: Record<string, string> = { git: 'Git', github: 'GitHub', shell: 'Terminal', calendar: 'Calendar', screen: 'Screen', codex: 'Codex', gemini: 'Gemini', whatsapp: 'WhatsApp', mail: 'Mail', note: 'Note', session: 'Claude' }

/** Your day from the computer, and asking about your days. Shared by the Island tab's Today and the Today screen. */
export function useToday(link: DropLink, when = true) {
  const { data: v, error, reload } = useCall<TodayView>(link, 'today.view', [], { poll: 60_000, when })
  const act = useAction(link)
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState<OsAnswer | null>(null)
  const ask = async (q: string, o: { consent?: boolean; prefer?: 'cloud' } = {}) => {
    const question = q.trim()
    if (!question) return
    setAsked(question)
    setAnswer(null)
    const a = await act.run<OsAnswer>('ask', 'today.ask', question, o)
    if (a) setAnswer(a)
  }
  return { v, error, reload, act, asked, answer, setAnswer, ask }
}
export type Today = ReturnType<typeof useToday>

/**
 * Today, on the phone: how much happened, your day by the hour, ask about
 * your days (answered on the computer, with numbered sources), what's next
 * on the calendar, and the day as a list.
 */
export function TodayBody({ t }: { t: Today }) {
  const st = useSt()
  const { v, error, act, asked, answer } = t
  const hours = v?.timeline ?? []
  const total = hours.reduce((n, h) => n + h.entries.length, 0)
  const entries = hours.flatMap((h) => h.entries.slice(0, 6)).reverse()
  return (
    <>
      {v && <Hero value={String(total)} label={total === 1 ? 'Thing today' : total ? 'Things today' : v.any ? 'Nothing yet today' : 'Your day fills in here'} hint={!total && !v.any ? 'Turn on sources in the island’s Settings, under Sources (or the second brain).' : undefined} />}
      {!v && !error && <Empty busy title="Asking the computer…" />}
      {total > 0 && <DayDots hours={hours.map((h) => ({ hour: h.hour, count: h.entries.length }))} now={new Date().getHours()} />}
      <Composer placeholder="What did I do last week?" send="Ask" busy={act.busy === 'ask'} onSend={(q) => void t.ask(q)} />
      <ErrorLine message={error || act.error} />
      {!!asked && answer && (
        <Card style={{ gap: 8 }}>
          <Text style={st.asked}>{asked}</Text>
          {answer.ok ? (
            <>
              <Text style={st.answer}>{answer.text}</Text>
              {answer.cites?.map((c) => (
                <Text key={c.n} style={st.cite} numberOfLines={1}>
                  [{c.n}] {c.title} · {c.kind}
                </Text>
              ))}
              {!!answer.meta.model && (
                <View style={st.metaRow}>
                  <Text style={st.meta}>{answerLine(answer.meta)}</Text>
                  {answer.meta.where === 'local' && <Btn small label="Ask cloud" busy={act.busy === 'ask'} onPress={() => void t.ask(asked, { prefer: 'cloud', consent: true })} />}
                </View>
              )}
            </>
          ) : 'needsConsent' in answer ? (
            <>
              <Text style={st.answer}>This computer can’t answer that. Ask {answer.needsConsent}? Your question and the matching notes go to it.</Text>
              <View style={st.metaRow}>
                <Btn small kind="primary" label="Ask it" onPress={() => void t.ask(asked, { consent: true })} />
                <Btn small label="Not now" onPress={() => t.setAnswer(null)} />
              </View>
            </>
          ) : (
            <Text style={st.error}>{answer.error}</Text>
          )}
        </Card>
      )}
      {!!v?.upcoming.length && (
        <>
          <Heading>What’s next</Heading>
          <Card style={st.list}>
            {v.upcoming.slice(0, 5).map((e, i, a) => (
              <Row key={`${e.start}-${i}`} title={e.title} sub={e.where} right={e.allDay ? 'All day' : clock(e.start)} last={i === a.length - 1} />
            ))}
          </Card>
        </>
      )}
      {!!entries.length && (
        <>
          <Heading>Your day</Heading>
          <Card style={st.list}>
            {entries.slice(0, 30).map((e, i, a) => (
              <Row key={`${e.at}-${i}`} title={e.title} sub={[FROM[e.source] ?? e.source, e.project].filter(Boolean).join(' · ')} right={clock(e.at)} last={i === a.length - 1} />
            ))}
          </Card>
        </>
      )}
    </>
  )
}

export function TodayScreen({ link, top, onBack }: { link: DropLink; top: number; onBack: () => void }) {
  const t = useToday(link)
  return (
    <Page title="Today" sub={t.v?.date ? dayTitle(t.v.date) : undefined} top={top} onBack={onBack} onRefresh={t.reload}>
      <TodayBody t={t} />
    </Page>
  )
}

/** An hour as the app writes the time: "09:00", "17:00". */
const hourText = (h: number) => `${String(h).padStart(2, '0')}:00`

/**
 * The day by the hour, drawn in small squares: a column for each hour, a
 * square for each thing in it (or for every few, on a full day), the busiest
 * hours named with their count. Hours with nothing keep a pale square, so
 * the day's length shows; hours still to come are paler.
 */
function DayDots({ hours, now }: { hours: { hour: number; count: number }[]; now: number }) {
  const C = useTheme()
  const st = useSt()
  const [w, setW] = useState(0)
  const cols: DayColumn[] = dayColumns(hours, now)
  const n = cols.length
  const gap = n > 16 ? 4 : n > 12 ? 6 : 7
  const cell = w ? Math.max(6, Math.min(26, Math.floor((w - (n - 1) * gap) / n))) : 0
  const pitch = cell + gap
  const tall = Math.max(1, ...cols.map((c) => c.cells))
  const LABEL = 24
  const h = LABEL + (tall + 1) * pitch - gap
  const left = w ? Math.max(0, Math.floor((w - (n * pitch - gap)) / 2)) : 0
  const peaks = cell ? dayPeaks(cols, Math.max(2, Math.ceil(44 / pitch))) : []
  const BOX = 120
  const words = `Your day by the hour. ${cols.filter((c) => c.count).map((c) => `${hourText(c.hour)}: ${c.count}`).join(', ')}`
  return (
    <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={[st.chart, { height: cell ? h + 22 : 180 }]} accessible accessibilityRole="image" accessibilityLabel={words}>
      {cell > 0 && (
        <>
          <Svg width={w} height={h}>
            {cols.map((c, i) => {
              const x = left + i * pitch
              const at = (r: number) => h - (r + 1) * pitch + gap
              if (!c.cells) return <Rect key={i} x={x} y={at(0)} width={cell} height={cell} rx={cell * 0.26} fill={C.accentPale} opacity={c.hour > now ? 0.45 : 1} />
              return [
                ...Array.from({ length: c.cells }, (_, r) => <Rect key={`${i}-${r}`} x={x} y={at(r)} width={cell} height={cell} rx={cell * 0.26} fill={r === c.cells - 1 && c.cells > 2 ? C.accentMid : C.accent} />),
                <Rect key={`${i}-top`} x={x} y={at(c.cells)} width={cell} height={cell} rx={cell * 0.26} fill={C.accentPale} />,
              ]
            })}
          </Svg>
          {peaks.map((i) => {
            const c = cols[i]
            const cx = left + i * pitch + cell / 2
            const x = Math.min(Math.max(0, cx - BOX / 2), Math.max(0, w - BOX))
            const align = x === 0 && cx < BOX / 2 ? 'left' : x === w - BOX && cx > w - BOX / 2 ? 'right' : 'center'
            return (
              <Text key={c.hour} numberOfLines={1} style={[st.peak, { left: x, width: BOX, top: h - (c.cells + 1) * pitch + gap - LABEL, textAlign: align }]}>
                {hourText(c.hour)} · {c.count}
              </Text>
            )
          })}
          <View style={[st.ends, { top: h + 6, left, width: n * pitch - gap }]}>
            <Text style={st.end}>{hourText(cols[0].hour)}</Text>
            <Text style={st.end}>{hourText(cols[n - 1].hour)}</Text>
          </View>
        </>
      )}
    </View>
  )
}

const useSt = themed((C) => ({
  asked: { color: C.text2, fontSize: 14 },
  answer: { color: C.text, fontSize: 15.5, lineHeight: 22 },
  cite: { color: C.text2, fontSize: 12.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  meta: { color: C.text3, fontSize: 12.5, flex: 1 },
  error: { color: C.red, fontSize: 14 },
  list: { paddingVertical: 6, paddingHorizontal: 18 },
  chart: { marginTop: 4, marginBottom: 6 },
  peak: { position: 'absolute', color: C.text, fontSize: 14, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  ends: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' },
  end: { color: C.text3, fontSize: 12, fontVariant: ['tabular-nums'] },
}))
