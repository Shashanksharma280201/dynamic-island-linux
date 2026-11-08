import { Text, View } from 'react-native'
import type { AgentsView } from '../../../shared/os'
import type { DropLink } from '../link'
import { ago, Btn, Card, Composer, Empty, ErrorLine, Kicker, Page, Row, useAction, useCall } from './kit'
import { themed, useTheme } from './theme'
import { money } from '../words'

/**
 * Agents, on the phone: what's watching for you ("tell me when…"), research
 * over your brain, and the jobs that tend it, with Run now. They all run on
 * the computer.
 */
export function AgentsScreen({ link, top, onBack }: { link: DropLink; top: number; onBack: () => void }) {
  const C = useTheme()
  const st = useSt()
  const { data: v, error, reload, setData } = useCall<AgentsView>(link, 'agents.view', [], { poll: 30_000 })
  const act = useAction(link)
  const then = (r: AgentsView | null) => (r ? (setData(r), true) : false)
  const watching = v?.monitors.filter((m) => m.state === 'watching').length ?? 0
  return (
    <Page title="Agents" sub={v ? `${watching} watching` : undefined} top={top} onBack={onBack} onRefresh={reload}>
      <ErrorLine message={error || act.error} />
      {!v && !error && <Empty busy title="Asking the computer…" />}
      {v && (
        <>
          <Card style={{ gap: 8 }}>
            <Kicker>Tell me when…</Kicker>
            <Composer placeholder="PR #43 is reviewed · anyone mentions Acme" send="Watch" busy={act.busy === 'watch'} onSend={async (t) => then(await act.run<AgentsView>('watch', 'agents.monitor', t))} />
            {!v.monitors.length && <Text style={st.hint}>It looks every five minutes and tells you once, on the island and here.</Text>}
            {v.monitors.slice(0, 12).map((m, i, a) => (
              <Row
                key={m.id}
                title={m.text}
                sub={m.line}
                last={i === a.length - 1}
                left={<View style={[st.dot, { backgroundColor: m.state === 'watching' ? C.green : m.state === 'failed' ? C.red : C.text3 }]} />}
                right={<Btn small label={m.state === 'watching' ? 'Stop' : 'Clear'} busy={act.busy === m.id} onPress={async () => void then(await act.run<AgentsView>(m.id, 'agents.unmonitor', m.id))} />}
              />
            ))}
          </Card>

          <Card style={{ gap: 8 }}>
            <Kicker>Research</Kicker>
            {!v.brain && <Text style={st.hint}>Turn on the second brain on the computer first: research reads it and writes its note there.</Text>}
            {v.brain && <Composer placeholder="What do my notes say about…" send="Research" busy={act.busy === 'research'} onSend={async (t) => then(await act.run<AgentsView>('research', 'agents.research', t))} />}
            {v.research.slice(0, 6).map((j, i, a) => (
              <Row key={j.id} title={j.question} sub={j.line} last={i === a.length - 1} />
            ))}
          </Card>

          {!!v.roster.length && (
            <Card>
              <Kicker>Tending the brain</Kicker>
              {v.roster.map((r, i, a) => (
                <Row
                  key={r.id}
                  title={r.label}
                  sub={r.note || r.what}
                  last={i === a.length - 1}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {r.ok !== null && !!r.lastRun && <Text style={st.when}>{ago(r.lastRun)}</Text>}
                      <Btn small label="Run now" busy={act.busy === r.id} onPress={async () => void then(await act.run<AgentsView>(r.id, 'agents.run', r.id))} />
                    </View>
                  }
                />
              ))}
            </Card>
          )}

          <Text style={st.week}>
            This week: {v.week.local} local · {v.week.cloud} cloud · {money(v.week.cost)}
          </Text>
        </>
      )}
    </Page>
  )
}

const useSt = themed((C) => ({
  hint: { color: C.text3, fontSize: 13, lineHeight: 18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  when: { color: C.text3, fontSize: 11 },
  week: { color: C.text3, fontSize: 12, textAlign: 'center', marginTop: 4 },
}))
