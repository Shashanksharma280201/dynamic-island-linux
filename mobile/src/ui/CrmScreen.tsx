import { useEffect, useState } from 'react'
import { BackHandler, Pressable, StyleSheet, View } from 'react-native'
import { Text, TextInput } from './Text'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { ActivityKind, ContactPage, ContactSummary, CrmOverview, DealSummary, TaskSummary } from '../../../shared/crm'
import type { DropLink } from '../link'
import { Avatar, Card, Composer, Empty, ErrorLine, Figure, Heading, Page, Row, Segmented, ago, useKit, useAction, useCall } from './kit'
import { themed, useTheme, type Palette } from './theme'
import { PUSH_IN, PUSH_OUT } from './motion'

type Tab = 'followups' | 'people' | 'deals'
const STAGE: Record<string, string> = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' }
// Only how a deal ended has a colour; where it stands on the way is said in words.
const stageColor = (C: Palette, stage: string): string | undefined => ({ won: C.green, lost: C.red })[stage]

/** "Today", "Overdue · 3 Oct", "Fri 10 Oct". */
function due(d?: string): string {
  if (!d) return ''
  const t = new Date(d.length === 10 ? `${d}T00:00` : d)
  if (isNaN(t.getTime())) return d
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(t) - day(new Date())) / 86_400_000)
  const label = t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return diff < 0 ? `Overdue · ${label}` : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : label
}

const money = (v: number | undefined, cur: string) => (v === undefined ? '' : `${new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(v)}`)

/** Your CRM on the computer: follow-ups to do, people (log a call), deals. */
export function CrmScreen({ link, top, onBack }: { link: DropLink; top: number; onBack: () => void }) {
  const C = useTheme()
  const [tab, setTab] = useState<Tab>('followups')
  const [person, setPerson] = useState<string | null>(null)
  const ov = useCall<CrmOverview>(link, 'crm.overview', [], { topic: 'crm' })
  const c = ov.data?.counts
  return (
    <View style={{ flex: 1 }}>
      <Page title="CRM" sub={c ? `${c.contacts} people · ${c.openDeals} open deals · ${c.dueTasks} due` : undefined} top={top} onBack={onBack} onRefresh={ov.reload}>
        <Segmented
          value={tab}
          onChange={setTab}
          style={{ marginBottom: 4 }}
          items={[
            ['followups', c?.openTasks ? `Follow-ups · ${c.openTasks}` : 'Follow-ups'],
            ['people', 'People'],
            ['deals', 'Deals'],
          ]}
        />
        {tab === 'followups' && <FollowUps link={link} onPerson={setPerson} />}
        {tab === 'people' && <People link={link} onPerson={setPerson} />}
        {tab === 'deals' && <Deals link={link} currency={ov.data?.currency ?? 'USD'} />}
      </Page>
      {person && (
        <Animated.View entering={PUSH_IN} exiting={PUSH_OUT} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
          <Person link={link} id={person} top={top} currency={ov.data?.currency ?? 'USD'} onBack={() => setPerson(null)} />
        </Animated.View>
      )}
    </View>
  )
}

function FollowUps({ link, onPerson }: { link: DropLink; onPerson: (id: string) => void }) {
  const C = useTheme()
  const st = useSt()
  const { data, error, reload } = useCall<TaskSummary[]>(link, 'crm.tasks', ['open'], { topic: 'crm' })
  const act = useAction(link)
  if (!data && !error) return <Empty busy title="Getting follow-ups…" />
  return (
    <Card style={st.list}>
      <ErrorLine message={error || act.error} />
      {data && !data.length && <Empty title="Nothing to follow up" text="Follow-ups you add on the computer (or ask the assistant for) show up here." />}
      {data?.map((t, i) => {
        const d = due(t.due)
        return (
          <Row
            key={t.id}
            title={t.title}
            sub={[t.contactName, t.dealTitle, d].filter(Boolean).join(' · ')}
            last={i === data.length - 1}
            onPress={t.contactId ? () => onPerson(t.contactId!) : undefined}
            left={
              <Pressable
                hitSlop={10}
                onPress={async () => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                  if ((await act.run(`done${t.id}`, 'crm.saveTask', t.id, { done: true })) !== null) void reload()
                }}
                style={[st.check, d.startsWith('Overdue') && { borderColor: C.red }]}
              />
            }
          />
        )
      })}
    </Card>
  )
}

function People({ link, onPerson }: { link: DropLink; onPerson: (id: string) => void }) {
  const C = useTheme()
  const st = useSt()
  const k = useKit()
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250)
    return () => clearTimeout(t)
  }, [q])
  const { data, error } = useCall<ContactSummary[]>(link, 'crm.contacts', [query], { topic: 'crm' })
  return (
    <View style={{ gap: 10 }}>
      <TextInput style={st.search} placeholder="Search people and companies" placeholderTextColor={C.text3} value={q} onChangeText={setQ} />
      <ErrorLine message={error} />
      <Card style={st.list}>
        {!data && !error && <Empty busy title="Looking…" />}
        {data && !data.length && <Empty title={query ? 'No one matches' : 'No people yet'} />}
        {data?.map((p, i) => (
          <Row
            key={p.id}
            title={p.name}
            sub={[p.title, p.company, p.lastTouch ? `last ${ago(p.lastTouch)}` : ''].filter(Boolean).join(' · ')}
            left={<Avatar name={p.name} size={40} />}
            right={p.status ? <Text style={[k.rowRight, { textTransform: 'capitalize' }]}>{p.status}</Text> : undefined}
            last={i === data.length - 1}
            onPress={() => onPerson(p.id)}
          />
        ))}
      </Card>
    </View>
  )
}

function Deals({ link, currency }: { link: DropLink; currency: string }) {
  const C = useTheme()
  const st = useSt()
  const k = useKit()
  const { data, error } = useCall<DealSummary[]>(link, 'crm.deals', [], { topic: 'crm' })
  const open = (data ?? []).filter((d) => d.stage !== 'won' && d.stage !== 'lost')
  const total = open.reduce((n, d) => n + (d.value ?? 0), 0)
  return (
    <View style={{ gap: 10 }}>
      <ErrorLine message={error} />
      {data && (
        <View style={st.top}>
          <Figure text={money(total, currency)} size={64} style={st.big} />
          <Text style={st.bigLabel}>Open pipeline</Text>
          <Text style={[k.rowSub, { marginTop: 4 }]}>
            {open.length} open {open.length === 1 ? 'deal' : 'deals'}
          </Text>
        </View>
      )}
      <Card style={st.list}>
        {!data && !error && <Empty busy title="Getting deals…" />}
        {data && !data.length && <Empty title="No deals yet" />}
        {data?.map((d, i) => (
          <Row
            key={d.id}
            title={d.title}
            sub={[d.contactName ?? d.company, d.expectedClose ? `closes ${due(d.expectedClose)}` : ''].filter(Boolean).join(' · ')}
            last={i === data.length - 1}
            right={
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={st.value}>{money(d.value, d.currency ?? currency)}</Text>
                <Text style={[st.stage, { color: stageColor(C, d.stage) ?? C.text2 }]}>{STAGE[d.stage] ?? d.stage}</Text>
              </View>
            }
          />
        ))}
      </Card>
    </View>
  )
}

const KINDS: [ActivityKind, string][] = [
  ['call', 'Call'],
  ['note', 'Note'],
  ['meeting', 'Meeting'],
  ['message', 'Message'],
]

/** One person: how to reach them, what happened, what to do, deals; log a call or note. */
function Person({ link, id, top, currency, onBack }: { link: DropLink; id: string; top: number; currency: string; onBack: () => void }) {
  const st = useSt()
  const k = useKit()
  const { data, error, reload } = useCall<ContactPage>(link, 'crm.contact', [id], { topic: 'crm' })
  const act = useAction(link)
  const [kind, setKind] = useState<ActivityKind>('call')
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack()
      return true
    })
    return () => sub.remove()
  }, [onBack])
  const c = data?.contact
  return (
    <Page title={c?.name ?? 'Person'} sub={c ? [c.title, c.company].filter(Boolean).join(' · ') : undefined} top={top} onBack={onBack} onRefresh={reload}>
      {!data && !error && <Empty busy title="Opening…" />}
      <ErrorLine message={error} />
      {c && (
        <Card style={{ gap: 4 }}>
          {[...c.emails, ...c.phones].map((x) => (
            <Text key={x} style={st.contact} selectable>
              {x}
            </Text>
          ))}
          {!!c.about && <Text style={k.rowSub}>{c.about}</Text>}
          {!c.emails.length && !c.phones.length && !c.about && <Text style={k.rowSub}>No details yet.</Text>}
        </Card>
      )}
      {c && <Heading>Log</Heading>}
      {c && (
        <View style={{ gap: 10 }}>
          <Segmented items={KINDS} value={kind} onChange={setKind} />
          <Composer
            placeholder={kind === 'call' ? 'What was the call about?' : kind === 'meeting' ? 'How did the meeting go?' : 'Write it down…'}
            busy={act.busy === 'log'}
            send="Log"
            onSend={async (text) => {
              const ok = (await act.run('log', 'crm.log', { contactId: id, kind, text })) !== null
              if (ok) void reload()
              return ok
            }}
          />
          <ErrorLine message={act.error} />
        </View>
      )}
      {!!data?.tasks.filter((t) => !t.done).length && (
        <>
          <Heading>Follow-ups</Heading>
          <Card style={st.list}>
            {data.tasks
              .filter((t) => !t.done)
              .map((t, i, a) => (
                <Row key={t.id} title={t.title} sub={due(t.due)} last={i === a.length - 1} />
              ))}
          </Card>
        </>
      )}
      {!!data?.deals.length && (
        <>
          <Heading>Deals</Heading>
          <Card style={st.list}>
            {data.deals.map((d, i) => (
              <Row key={d.id} title={d.title} sub={STAGE[d.stage]} right={money(d.value, d.currency ?? currency)} last={i === data.deals.length - 1} />
            ))}
          </Card>
        </>
      )}
      {!!data?.activities.length && (
        <>
          <Heading>Timeline</Heading>
          <Card style={st.list}>
            {data.activities.slice(0, 30).map((a, i) => (
              <Animated.View key={a.id}>
                <Row full title={a.text} sub={`${KINDS.find(([x]) => x === a.kind)?.[1] ?? a.kind} · ${new Date(a.at).toLocaleString()}`} last={i === Math.min(29, data.activities.length - 1)} />
              </Animated.View>
            ))}
          </Card>
        </>
      )}
    </Page>
  )
}

const useSt = themed((C) => ({
  list: { paddingVertical: 6, paddingHorizontal: 18 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.6, borderColor: C.text3 },
  search: { backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 20, height: 50, color: C.text, fontSize: 15.5, ...C.shadow },
  top: { alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  big: { color: C.text, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'] },
  bigLabel: { color: C.text, fontSize: 20, letterSpacing: -0.2 },
  value: { color: C.text, fontSize: 14.5, fontWeight: '500', fontVariant: ['tabular-nums'] },
  stage: { fontSize: 12.5 },
  contact: { color: C.accent, fontSize: 15.5, paddingVertical: 3 },
}))
