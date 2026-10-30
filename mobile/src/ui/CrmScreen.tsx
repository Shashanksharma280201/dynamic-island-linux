import { useEffect, useState } from 'react'
import { BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeInDown, SlideInRight, SlideOutRight } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { ActivityKind, ContactPage, ContactSummary, CrmOverview, DealSummary, TaskSummary } from '../../../shared/crm'
import type { DropLink } from '../link'
import { Avatar, Card, Composer, Empty, ErrorLine, Kicker, Page, Row, Segmented, ago, s as k, useAction, useCall } from './kit'
import { C } from './theme'

type Tab = 'followups' | 'people' | 'deals'
const STAGE: Record<string, string> = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' }
const STAGE_COLOR: Record<string, string> = { won: C.green, lost: C.red, negotiation: C.orange, proposal: C.blue }

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
        <Animated.View entering={SlideInRight.springify().damping(22).stiffness(220)} exiting={SlideOutRight.duration(220)} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
          <Person link={link} id={person} top={top} currency={ov.data?.currency ?? 'USD'} onBack={() => setPerson(null)} />
        </Animated.View>
      )}
    </View>
  )
}

function FollowUps({ link, onPerson }: { link: DropLink; onPerson: (id: string) => void }) {
  const { data, error, reload } = useCall<TaskSummary[]>(link, 'crm.tasks', ['open'], { topic: 'crm' })
  const act = useAction(link)
  if (!data && !error) return <Empty busy title="Getting follow-ups…" />
  return (
    <Card>
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
      <Card>
        {!data && !error && <Empty busy title="Looking…" />}
        {data && !data.length && <Empty title={query ? 'No one matches' : 'No people yet'} />}
        {data?.map((p, i) => (
          <Row
            key={p.id}
            title={p.name}
            sub={[p.title, p.company, p.lastTouch ? `last ${ago(p.lastTouch)}` : ''].filter(Boolean).join(' · ')}
            left={<Avatar name={p.name} size={36} />}
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
  const { data, error } = useCall<DealSummary[]>(link, 'crm.deals', [], { topic: 'crm' })
  const open = (data ?? []).filter((d) => d.stage !== 'won' && d.stage !== 'lost')
  const total = open.reduce((n, d) => n + (d.value ?? 0), 0)
  return (
    <View style={{ gap: 10 }}>
      <ErrorLine message={error} />
      {data && (
        <Card>
          <Kicker>Open pipeline</Kicker>
          <Text style={st.big}>{money(total, currency)}</Text>
          <Text style={k.rowSub}>{open.length} open deals</Text>
        </Card>
      )}
      <Card>
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
                <Text style={[st.stage, { color: STAGE_COLOR[d.stage] ?? C.text2 }]}>{STAGE[d.stage] ?? d.stage}</Text>
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
      {c && (
        <Card style={{ gap: 10 }}>
          <Kicker>Log</Kicker>
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
        </Card>
      )}
      {!!data?.tasks.filter((t) => !t.done).length && (
        <Card>
          <Kicker>Follow-ups</Kicker>
          {data.tasks
            .filter((t) => !t.done)
            .map((t, i, a) => (
              <Row key={t.id} title={t.title} sub={due(t.due)} last={i === a.length - 1} />
            ))}
        </Card>
      )}
      {!!data?.deals.length && (
        <Card>
          <Kicker>Deals</Kicker>
          {data.deals.map((d, i) => (
            <Row key={d.id} title={d.title} sub={STAGE[d.stage]} right={money(d.value, d.currency ?? currency)} last={i === data.deals.length - 1} />
          ))}
        </Card>
      )}
      {!!data?.activities.length && (
        <Card>
          <Kicker>Timeline</Kicker>
          {data.activities.slice(0, 30).map((a, i) => (
            <Animated.View key={a.id} entering={FadeInDown.delay(Math.min(i, 8) * 25)}>
              <Row title={a.text} sub={`${KINDS.find(([x]) => x === a.kind)?.[1] ?? a.kind} · ${new Date(a.at).toLocaleString()}`} last={i === Math.min(29, data.activities.length - 1)} />
            </Animated.View>
          ))}
        </Card>
      )}
    </Page>
  )
}

const st = StyleSheet.create({
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.text3 },
  search: { backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.line },
  big: { color: C.text, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  value: { color: C.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  stage: { fontSize: 11, fontWeight: '800' },
  contact: { color: C.cyan, fontSize: 15, paddingVertical: 2 },
})
