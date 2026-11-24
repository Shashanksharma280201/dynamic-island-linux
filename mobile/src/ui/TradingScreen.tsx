import { Alert, View } from 'react-native'
import { Text } from './Text'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { ConnectedSection, ConnectedState } from '../../../shared/connected'
import type { DropLink, Live } from '../link'
import { ApprovalCard } from './Approvals'
import { Btn, Card, Empty, ErrorLine, Figure, Heading, Page, Row, StatusDot, toneColor, useAction, useCall } from './kit'
import { themed, useTheme } from './theme'

/** Your trading engine, as the island's Trading tab shows it: P&L, trades to answer, positions, today's trades, its buttons. */
export function TradingScreen({ link, live, top, onBack }: { link: DropLink; live: Live; top: number; onBack: () => void }) {
  const C = useTheme()
  const st = useSt()
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
        <View style={st.top}>
          <Figure text={v.status.text} size={72} style={st.pnl} />
          <Text style={st.pnlLabel}>Today</Text>
          <View style={{ marginTop: 10 }}>
            {t?.phase === 'live' ? (
              <StatusDot color={v.status.tone === 'up' ? C.green : v.status.tone === 'down' ? C.red : v.status.tone === 'warn' ? C.orange : C.text3} text={v.status.tone === 'up' ? 'Up today' : v.status.tone === 'down' ? 'Down today' : v.status.tone === 'warn' ? 'Take a look' : 'Flat today'} />
            ) : (
              <StatusDot color={C.orange} hollow text="Not live now" />
            )}
          </View>
          {!!v.status.detail && <Text style={st.topDetail}>{v.status.detail}</Text>}
        </View>
      )}

      {asks.length > 0 && (
        <>
          <Heading>Waiting for you</Heading>
          {asks.map((a) => (
            <ApprovalCard key={a.id} a={a} link={link} seenAt={live.seenAt ?? Date.now()} />
          ))}
        </>
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
  const C = useTheme()
  const st = useSt()
  if (sec.type === 'stats')
    return (
      <Animated.View>
        {!!sec.title && <Heading>{sec.title}</Heading>}
        <View style={[st.grid, !!sec.title && { marginTop: 8 }]}>
          {sec.items.map((it, i) => (
            <View key={i} style={st.stat}>
              {it.tone && it.tone !== 'neutral' ? (
                <StatusDot color={toneColor(C, it.tone)} text={it.label} />
              ) : (
                <Text style={st.statLabel} numberOfLines={1}>
                  {it.label}
                </Text>
              )}
              <Figure text={it.value} size={24} style={st.statValue} />
            </View>
          ))}
        </View>
      </Animated.View>
    )
  if (sec.type === 'list')
    return (
      <View>
        {!!sec.title && <Heading>{sec.title}</Heading>}
        <Card style={[st.list, !!sec.title && { marginTop: 8 }]}>
          {!sec.rows.length && <Text style={st.detail}>{sec.empty ?? 'Nothing yet'}</Text>}
          {sec.rows.map((r, i) => (
            <Row key={i} title={r.title} sub={r.subtitle} last={i === sec.rows.length - 1} right={r.value ? <Text style={[st.rowValue, { color: toneColor(C, r.tone) }]}>{r.value}</Text> : undefined} />
          ))}
        </Card>
      </View>
    )
  if (sec.type === 'actions')
    return (
      <View style={{ gap: 8, marginTop: 6 }}>
        {sec.actions.map((a) => (
          <Btn key={a.id} label={a.label} kind={a.style === 'danger' ? 'danger' : 'plain'} busy={busy === a.id} onPress={() => onAction(a.id, a.label, a.confirm)} />
        ))}
      </View>
    )
  return (
    <Card>
      <Text style={[st.note, { color: sec.tone ? toneColor(C, sec.tone) : C.text2 }]}>{sec.text}</Text>
    </Card>
  )
}

const useSt = themed((C) => ({
  top: { alignItems: 'center', paddingTop: 6, paddingBottom: 10 },
  pnl: { color: C.text, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'] },
  pnlLabel: { color: C.text, fontSize: 20, letterSpacing: -0.2 },
  topDetail: { color: C.text2, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  detail: { color: C.text2, fontSize: 14, paddingVertical: 12 },
  list: { paddingVertical: 6, paddingHorizontal: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 0, backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 16, gap: 6, ...C.shadow },
  statLabel: { color: C.text2, fontSize: 12.5 },
  statValue: { color: C.text, fontWeight: '500', fontVariant: ['tabular-nums'] },
  rowValue: { fontSize: 14.5, fontWeight: '500', fontVariant: ['tabular-nums'] },
  note: { fontSize: 14, lineHeight: 20 },
}))
