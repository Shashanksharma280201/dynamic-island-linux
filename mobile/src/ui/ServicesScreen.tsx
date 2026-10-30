import { StyleSheet, Text, View } from 'react-native'
import type { ServiceState } from '../../../shared/services'
import type { DropLink } from '../link'
import { Btn, Card, Empty, ErrorLine, Kicker, Page, Row, ago, useAction, useCall } from './kit'
import { C } from './theme'

const NAME: Record<string, string> = { github: 'GitHub', vercel: 'Vercel', stripe: 'Stripe', resend: 'Resend', notion: 'Notion' }
const DOT: Record<string, string> = { good: C.green, bad: C.red, busy: C.orange }

/** The services the island follows (GitHub, Vercel, Stripe…): what each says now. */
export function ServicesScreen({ link, top, onBack }: { link: DropLink; top: number; onBack: () => void }) {
  const { data, error, reload } = useCall<ServiceState[]>(link, 'services.view', [], { topic: 'services', fromPush: true })
  const act = useAction(link)
  const on = (data ?? []).filter((x) => x.ready || x.error)
  return (
    <Page title="Services" top={top} onBack={onBack} onRefresh={reload}>
      {!data && !error && <Empty busy title="Asking the computer…" />}
      <ErrorLine message={error || act.error} />
      {data && !on.length && <Empty title="No services yet" text="Turn on GitHub, Vercel, Stripe and others in the island’s Settings → Services, and what they say shows here." />}
      {on.map((x) => (
        <Card key={x.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={st.name}>{NAME[x.id] ?? x.id}</Text>
            {!!x.checkedAt && <Text style={st.when}>{ago(x.checkedAt)}</Text>}
            <Btn small label="Refresh" busy={act.busy === x.id} onPress={() => void act.run(x.id, 'services.refresh', x.id)} />
          </View>
          {!!x.error && <ErrorLine message={x.error} />}
          {x.snapshot?.big && (
            <Text style={st.big}>
              {x.snapshot.big.value} <Text style={st.bigLabel}>{x.snapshot.big.label}</Text>
            </Text>
          )}
          {x.snapshot?.sections.map((sec) => (
            <View key={sec.title} style={{ marginTop: 6 }}>
              <Kicker>{sec.title}</Kicker>
              {!sec.rows.length && <Text style={st.empty}>{sec.empty}</Text>}
              {sec.rows.slice(0, 6).map((r, i, a) => (
                <Row key={r.id} title={r.title} sub={r.sub} last={i === a.length - 1} left={<View style={[st.dot, { backgroundColor: DOT[r.tone ?? ''] ?? 'transparent' }]} />} right={r.side ?? (r.at ? ago(r.at) : undefined)} />
              ))}
            </View>
          ))}
        </Card>
      ))}
    </Page>
  )
}

const st = StyleSheet.create({
  name: { color: C.text, fontSize: 17, fontWeight: '800', flex: 1 },
  when: { color: C.text3, fontSize: 12 },
  big: { color: C.text, fontSize: 24, fontWeight: '800' },
  bigLabel: { color: C.text2, fontSize: 14, fontWeight: '600' },
  empty: { color: C.text3, fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
