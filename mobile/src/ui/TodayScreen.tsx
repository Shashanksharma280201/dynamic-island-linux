import { useState } from 'react'
import { Text, View } from 'react-native'
import type { OsAnswer, TodayView } from '../../../shared/os'
import type { DropLink } from '../link'
import { Btn, Card, Composer, Empty, ErrorLine, Kicker, Page, Row, useAction, useCall } from './kit'
import { themed } from './theme'
import { answerLine, clock } from '../words'

/** What a timeline entry came from, in a word. */
const FROM: Record<string, string> = { git: 'Git', github: 'GitHub', shell: 'Terminal', calendar: 'Calendar', screen: 'Screen', codex: 'Codex', gemini: 'Gemini', whatsapp: 'WhatsApp', mail: 'Mail', note: 'Note', session: 'Claude' }

/**
 * Today, on the phone: ask about your days (answered on the computer, with
 * numbered sources), your day by hour, and what's next on the calendar.
 */
export function TodayScreen({ link, top, onBack }: { link: DropLink; top: number; onBack: () => void }) {
  const st = useSt()
  const { data: v, error, reload } = useCall<TodayView>(link, 'today.view', [], { poll: 60_000 })
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
  const hours = v?.timeline ?? []
  const entries = hours.flatMap((h) => h.entries.slice(0, 6)).reverse()
  return (
    <Page title="Today" sub={v?.date} top={top} onBack={onBack} onRefresh={reload}>
      <Composer placeholder="What did I do last week?" send="Ask" busy={act.busy === 'ask'} onSend={(q) => void ask(q)} />
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
                  {answer.meta.where === 'local' && <Btn small label="Ask cloud" busy={act.busy === 'ask'} onPress={() => void ask(asked, { prefer: 'cloud', consent: true })} />}
                </View>
              )}
            </>
          ) : 'needsConsent' in answer ? (
            <>
              <Text style={st.answer}>This computer can’t answer that. Ask {answer.needsConsent}? Your question and the matching notes go to it.</Text>
              <View style={st.metaRow}>
                <Btn small kind="primary" label="Ask it" onPress={() => void ask(asked, { consent: true })} />
                <Btn small label="Not now" onPress={() => setAnswer(null)} />
              </View>
            </>
          ) : (
            <Text style={st.error}>{answer.error}</Text>
          )}
        </Card>
      )}
      {!v && !error && <Empty busy title="Asking the computer…" />}
      {!!v?.upcoming.length && (
        <Card>
          <Kicker>What’s next</Kicker>
          {v.upcoming.slice(0, 5).map((e, i, a) => (
            <Row key={`${e.start}-${i}`} title={e.title} sub={e.where} right={e.allDay ? 'All day' : clock(e.start)} last={i === a.length - 1} />
          ))}
        </Card>
      )}
      {v && !entries.length && <Empty title={v.any ? 'Nothing yet today' : 'Your day fills in here'} text={v.any ? undefined : 'Turn on sources in the island’s Settings → Sources (or the second brain).'} />}
      {!!entries.length && (
        <Card>
          <Kicker>Your day</Kicker>
          {entries.slice(0, 30).map((e, i, a) => (
            <Row key={`${e.at}-${i}`} title={e.title} sub={[FROM[e.source] ?? e.source, e.project].filter(Boolean).join(' · ')} right={clock(e.at)} last={i === a.length - 1} />
          ))}
        </Card>
      )}
    </Page>
  )
}

const useSt = themed((C) => ({
  asked: { color: C.text3, fontSize: 13, fontWeight: '600' },
  answer: { color: C.text, fontSize: 15, lineHeight: 21 },
  cite: { color: C.text2, fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  meta: { color: C.text3, fontSize: 12, flex: 1 },
  error: { color: C.red, fontSize: 14 },
}))
