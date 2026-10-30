import { Alert, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { ConnectedSection, ConnectedState } from '../../../shared/connected'
import type { DropLink, Live } from '../link'
import { ApprovalCard } from './Approvals'
import { LiveDot } from './IslandScreen'
import { Btn, Card, Empty, ErrorLine, Kicker, Page, Row, toneColor, useAction, useCall } from './kit'
import { C } from './theme'

/** Your trading engine, as the island's Trading tab shows it: P&L, trades to answer, positions, today's trades, its buttons. */
export function TradingScreen({ link, live, top, onBack }: { link: DropLink; live: Live; top: number; onBack: () => void }) {
  const { data: t, error, reload } = useCall<ConnectedState>(link, 'connected.view', [], { topic: 'connected', fromPush: true })
  const act = useAction(link)
  const asks = (live.view?.approvals ?? []).filter((a) => a.kind === 'trade')
  const name = t?.manifest?.tabTitle || t?.manifest?.name || 'Trading'
  const v = t?.view

  return (
    <Page title={name} sub={t ? phaseText(t) : 'Connecting…'} top={top} onBack={onBack} onRefresh={reload}>
      {!t && !error && <Empty busy title="Asking the computer…" />}
      {!!error && !t && <Empty title="Can’t read it" text={error} />}
      {t && !t.configured && <Empty title="No trading engine connected" text="On the computer, open the island’s Settings → Connected and add your engine’s address and token." />}
      {t && t.configured && !v && <Empty busy={t.phase === 'connecting'} title={t.phase === 'error' ? 'The engine isn’t answering' : 'Waiting for the engine…'} text={t.error} />}

      {v && (
        <Card style={{ borderColor: `${t?.manifest?.color ?? C.green}44` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LiveDot on={t?.phase === 'live'} color={t?.phase === 'live' ? C.green : C.orange} />
            <Text style={st.kicker}>Today</Text>
          </View>
          <Text style={[st.pnl, { color: toneColor(v.status.tone) }]}>{v.status.text}</Text>
          {!!v.status.detail && <Text style={st.detail}>{v.status.detail}</Text>}
        </Card>
      )}

      {asks.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={st.section}>Waiting for you</Text>
          {asks.map((a) => (
            <ApprovalCard key={a.id} a={a} link={link} seenAt={live.seenAt ?? Date.now()} />
          ))}
        </View>
      )}

      {v?.sections.map((sec, i) => (
        <Section
          key={i}
          sec={sec}
          index={i}
          busy={act.busy}
          onAction={(id, label, confirm) => {
            const go = async () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              const r = await act.run<{ ok: boolean; message: string }>(id, 'connected.action', id)
              if (r) Alert.alert(label, r.message || (r.ok ? 'Done.' : 'It didn’t go through.'))
            }
            if (confirm) Alert.alert(label, confirm, [{ text: 'Cancel', style: 'cancel' }, { text: label, style: 'destructive', onPress: () => void go() }])
            else void go()
          }}
        />
      ))}
      <ErrorLine message={act.error} />
    </Page>
  )
}

const phaseText = (t: ConnectedState) => (t.phase === 'live' ? `Live${t.seenAt ? ' · just now' : ''}` : t.phase === 'connecting' ? 'Connecting…' : t.phase === 'error' ? 'Not answering' : 'Off')

function Section({ sec, index, onAction, busy }: { sec: ConnectedSection; index: number; onAction: (id: string, label: string, confirm?: string) => void; busy: string }) {
  if (sec.type === 'stats')
    return (
      <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(18)}>
        {!!sec.title && <Text style={st.section}>{sec.title}</Text>}
        <View style={st.grid}>
          {sec.items.map((it, i) => (
            <View key={i} style={st.stat}>
              <Text style={st.statLabel} numberOfLines={1}>
                {it.label}
              </Text>
              <Text style={[st.statValue, { color: toneColor(it.tone) }]} numberOfLines={1} adjustsFontSizeToFit>
                {it.value}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
    )
  if (sec.type === 'list')
    return (
      <Card>
        <Kicker>{sec.title}</Kicker>
        {!sec.rows.length && <Text style={st.detail}>{sec.empty ?? 'Nothing yet'}</Text>}
        {sec.rows.map((r, i) => (
          <Row key={i} title={r.title} sub={r.subtitle} last={i === sec.rows.length - 1} right={r.value ? <Text style={[st.rowValue, { color: toneColor(r.tone) }]}>{r.value}</Text> : undefined} />
        ))}
      </Card>
    )
  if (sec.type === 'actions')
    return (
      <View style={{ gap: 8 }}>
        {sec.actions.map((a) => (
          <Btn key={a.id} label={a.label} kind={a.style === 'danger' ? 'danger' : 'plain'} busy={busy === a.id} onPress={() => onAction(a.id, a.label, a.confirm)} />
        ))}
      </View>
    )
  return (
    <Card>
      <Text style={[st.note, { color: sec.tone ? toneColor(sec.tone) : C.text2 }]}>{sec.text}</Text>
    </Card>
  )
}

const st = StyleSheet.create({
  kicker: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  pnl: { fontSize: 40, fontWeight: '800', marginTop: 6, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  detail: { color: C.text2, fontSize: 14, marginTop: 4 },
  section: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48.6%', backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.line },
  statLabel: { color: C.text3, fontSize: 12, fontWeight: '700' },
  statValue: { fontSize: 19, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  rowValue: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  note: { fontSize: 14, lineHeight: 20 },
})
