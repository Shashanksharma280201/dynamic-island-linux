import { useEffect, useRef, useState } from 'react'
import { Alert, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, type ScrollViewInstance } from 'react-native'
import Animated, { FadeInDown, FadeOut, LinearTransition, SlideInRight, SlideOutRight } from 'react-native-reanimated'
import type { ChatMessage, ChatSummary, InboxSources, InboxUnread, MailMessageView, MailSummary } from '../../../shared/types'
import type { PhoneNote } from '../islandTypes'
import type { DropLink, Live } from '../link'
import { whenText } from '../files'
import { Avatar, Badge, Btn, Composer, Empty, ErrorLine, Page, Segmented, TAB_ROOM, ago, s as k, useAction, useCall, useKeyboard } from './kit'
import { C } from './theme'

type Tab = 'chats' | 'mail' | 'alerts'
type Open = { kind: 'chat'; chat: ChatSummary } | { kind: 'mail'; mail: MailSummary } | null

/** Your computer's WhatsApp, mail and notifications: read, reply, clear. */
export function InboxScreen({ link, live, top, bottom }: { link: DropLink; live: Live; top: number; bottom: number }) {
  const [tab, setTab] = useState<Tab>('chats')
  const [open, setOpen] = useState<Open>(null)
  const unread = useCall<InboxUnread>(link, 'inbox.unread', [], { topic: 'inbox' })
  const sources = useCall<InboxSources>(link, 'inbox.sources', [], { topic: 'inbox' })

  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(null)
      return true
    })
    return () => sub.remove()
  }, [open])

  const chats = unread.data?.chats ?? 0
  const mail = unread.data?.mail ?? 0
  const alerts = live.view?.notes.length ?? 0
  return (
    <View style={{ flex: 1 }}>
      <Page title="Inbox" sub={`On ${link.pairing.name}`} top={top} scroll={false}>
        <Segmented
          style={{ marginHorizontal: 16, marginBottom: 8 }}
          value={tab}
          onChange={setTab}
          items={[
            ['chats', chats ? `Chats · ${chats}` : 'Chats'],
            ['mail', mail ? `Mail · ${mail}` : 'Mail'],
            ['alerts', alerts ? `Alerts · ${alerts}` : 'Alerts'],
          ]}
        />
        {tab === 'chats' && <Chats link={link} sources={sources.data} onOpen={(chat) => setOpen({ kind: 'chat', chat })} />}
        {tab === 'mail' && <Mail link={link} sources={sources.data} onOpen={(m) => setOpen({ kind: 'mail', mail: m })} />}
        {tab === 'alerts' && <Alerts link={link} live={live} />}
      </Page>
      {open && (
        <Animated.View entering={SlideInRight.springify().damping(22).stiffness(220)} exiting={SlideOutRight.duration(220)} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
          {open.kind === 'chat' ? <Thread link={link} chat={open.chat} top={top} bottom={bottom} onBack={() => setOpen(null)} /> : <MailView link={link} m={open.mail} top={top} bottom={bottom} onBack={() => setOpen(null)} />}
        </Animated.View>
      )}
    </View>
  )
}

// ---- WhatsApp ----

function Chats({ link, sources, onOpen }: { link: DropLink; sources: InboxSources | null; onOpen: (c: ChatSummary) => void }) {
  const ready = sources?.whatsapp === 'ready'
  const { data, error, loading } = useCall<ChatSummary[]>(link, 'inbox.chats', [], { topic: 'inbox', when: ready })
  if (sources && !ready)
    return <Empty title={sources.whatsapp === 'linking' ? 'WhatsApp is linking…' : 'WhatsApp isn’t on'} text="Link WhatsApp in the island’s Settings on your computer, and your chats show up here to read and answer." />
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}>
      {loading && !data && <Empty busy title="Getting your chats…" />}
      <ErrorLine message={error} />
      {data && !data.length && <Empty title="No chats yet" />}
      {data?.map((c, i) => (
        <Animated.View key={c.id} entering={FadeInDown.delay(Math.min(i, 10) * 25).springify().damping(18)}>
          <RowLink
            onPress={() => onOpen(c)}
            left={<Avatar name={c.name} uri={c.avatar} />}
            title={c.name}
            sub={`${c.lastFromMe ? 'You: ' : ''}${c.last}`}
            right={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[k.rowRight, c.unread > 0 && { color: C.green }]}>{ago(c.time)}</Text>
                <Badge n={c.unread} color={C.green} />
              </View>
            }
            bold={c.unread > 0}
          />
        </Animated.View>
      ))}
    </ScrollView>
  )
}

function Thread({ link, chat, top, bottom, onBack }: { link: DropLink; chat: ChatSummary; top: number; bottom: number; onBack: () => void }) {
  const { data, error, reload } = useCall<ChatMessage[]>(link, 'inbox.chat', [chat.id], { topic: 'inbox' })
  const act = useAction(link)
  const kb = useKeyboard()
  const scroll = useRef<ScrollViewInstance>(null)
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80)
    return () => clearTimeout(t)
  }, [data?.length])
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page title={chat.name} sub={chat.isGroup ? 'Group' : 'WhatsApp'} top={top} onBack={onBack} scroll={false}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 6 }}>
          {!data && !error && <Empty busy title="Opening the chat…" />}
          <ErrorLine message={error} />
          {data?.map((m) => (
            <Animated.View key={m.id} entering={FadeInDown.springify().damping(20)} layout={LinearTransition} style={[st.bubble, m.fromMe ? st.mine : st.theirs]}>
              {chat.isGroup && !m.fromMe && !!m.author && <Text style={st.author}>{m.author}</Text>}
              {m.media?.thumb && <Image source={{ uri: m.media.thumb }} style={st.thumb} />}
              {m.media && !m.media.thumb && <Text style={st.media}>{m.media.name ?? m.media.kind}</Text>}
              {!!m.text && (
                <Text style={st.bubbleText} selectable>
                  {m.text}
                </Text>
              )}
              <Text style={st.time}>{new Date(m.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
            </Animated.View>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 12, paddingBottom: kb ? 8 : bottom + TAB_ROOM, gap: 6 }}>
          <ErrorLine message={act.error} />
          <Composer
            placeholder="Message"
            busy={act.busy === 'send'}
            onSend={async (text) => {
              const ok = (await act.run('send', 'inbox.sendChat', chat.id, text)) !== null
              if (ok) void reload()
              return ok
            }}
          />
        </View>
      </Page>
    </KeyboardAvoidingView>
  )
}

// ---- Mail ----

function Mail({ link, sources, onOpen }: { link: DropLink; sources: InboxSources | null; onOpen: (m: MailSummary) => void }) {
  const has = !!sources?.mail.length
  const { data, error, loading } = useCall<MailSummary[]>(link, 'inbox.mailList', [], { topic: 'inbox', when: has })
  if (sources && !has) return <Empty title="No mail accounts" text="Add a mail account in the island’s Settings on your computer, and your inbox shows up here." />
  const label = (id: string) => sources?.mail.find((a) => a.id === id)?.label
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}>
      {loading && !data && <Empty busy title="Getting your mail…" />}
      <ErrorLine message={error} />
      {data && !data.length && <Empty title="Inbox zero" />}
      {data?.map((m, i) => (
        <Animated.View key={`${m.accountId}-${m.uid}`} entering={FadeInDown.delay(Math.min(i, 10) * 25).springify().damping(18)}>
          <RowLink
            onPress={() => onOpen(m)}
            left={<View style={[st.dot, { backgroundColor: m.unread ? C.blue : 'transparent' }]} />}
            title={m.from.name || m.from.address}
            sub={`${m.subject}${m.snippet ? `\n${m.snippet}` : ''}`}
            right={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={k.rowRight}>{ago(m.date)}</Text>
                {(sources?.mail.length ?? 0) > 1 && <Text style={[k.rowRight, { fontSize: 10 }]}>{label(m.accountId)}</Text>}
              </View>
            }
            bold={m.unread}
          />
        </Animated.View>
      ))}
    </ScrollView>
  )
}

function MailView({ link, m, top, bottom, onBack }: { link: DropLink; m: MailSummary; top: number; bottom: number; onBack: () => void }) {
  const { data, error } = useCall<MailMessageView>(link, 'inbox.mailGet', [m.accountId, m.uid])
  const act = useAction(link)
  const kb = useKeyboard()
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (m.unread) void link.call('inbox.mailRead', m.accountId, m.uid)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page title={m.subject || '(no subject)'} sub={`${m.from.name || m.from.address} · ${new Date(m.date).toLocaleString()}`} top={top} onBack={onBack} scroll={false}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {!data && !error && <Empty busy title="Opening…" />}
          <ErrorLine message={error} />
          {data && (
            <Animated.View entering={FadeInDown.springify().damping(18)} style={k.card}>
              <Text style={k.rowSub}>From {data.from.address}</Text>
              {!!data.to && <Text style={k.rowSub}>To {data.to}</Text>}
              <Text style={st.mailBody} selectable>
                {data.text || data.snippet}
              </Text>
            </Animated.View>
          )}
          {sent && <Text style={{ color: C.green, fontWeight: '700' }}>Reply sent.</Text>}
        </ScrollView>
        <View style={{ paddingHorizontal: 12, paddingBottom: kb ? 8 : bottom + TAB_ROOM, gap: 6 }}>
          <ErrorLine message={act.error} />
          <Composer
            placeholder={`Reply to ${m.from.name || m.from.address}`}
            busy={act.busy === 'reply'}
            onSend={async (text) => {
              const ok = (await act.run('reply', 'inbox.mailReply', m.accountId, m.uid, text)) !== null
              setSent(ok)
              return ok
            }}
          />
        </View>
      </Page>
    </KeyboardAvoidingView>
  )
}

// ---- Notifications ----

const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68']
const colorFor = (app: string) => PALETTE[[...app].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length]

/** The computer's notification center: clear one or all, Do Not Disturb. */
function Alerts({ link, live }: { link: DropLink; live: Live }) {
  const notes = live.view?.notes ?? []
  const act = useAction(link)
  const [dnd, setDnd] = useState(!!live.view?.dnd)
  useEffect(() => setDnd(!!live.view?.dnd), [live.view?.dnd])
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 8 }}>
      <View style={[k.card, st.dndRow]}>
        <View style={{ flex: 1 }}>
          <Text style={k.rowTitle}>Do Not Disturb</Text>
          <Text style={k.rowSub}>No cards or sounds on the computer.</Text>
        </View>
        <Switch
          value={dnd}
          onValueChange={(on) => {
            setDnd(on)
            void act.run('dnd', 'notifications.setDnd', on)
          }}
          trackColor={{ true: C.violet, false: 'rgba(255,255,255,0.15)' }}
          thumbColor="#fff"
        />
      </View>
      <ErrorLine message={act.error} />
      {!notes.length && <Empty title="All clear" text="Notifications your computer shows (WhatsApp, mail, your apps) appear here." />}
      {!!notes.length && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Btn
            small
            label="Clear all"
            busy={act.busy === 'clear'}
            onPress={() =>
              Alert.alert('Clear all notifications?', `On ${link.pairing.name} too.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => void act.run('clear', 'notifications.clearAll') },
              ])
            }
          />
        </View>
      )}
      {notes.map((n, i) => (
        <AlertCard key={`${n.id}@${n.at}`} n={n} index={i} onDismiss={() => void act.run(`x${n.id}`, 'notifications.dismiss', n.id)} />
      ))}
    </ScrollView>
  )
}

function AlertCard({ n, index, onDismiss }: { n: PhoneNote; index: number; onDismiss: () => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30).springify().damping(18)} exiting={FadeOut.duration(180)} layout={LinearTransition.springify().damping(20)} style={st.note}>
      <View style={[st.appIcon, { backgroundColor: colorFor(n.app) }]}>
        <Text style={st.appIconText}>{n.app.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={st.app} numberOfLines={1}>
            {n.app}
          </Text>
          <Text style={k.rowRight}>{whenText(n.at)}</Text>
        </View>
        <Text style={st.noteTitle} numberOfLines={2}>
          {n.title}
        </Text>
        {!!n.body && (
          <Text style={k.rowSub} numberOfLines={3}>
            {n.body}
          </Text>
        )}
      </View>
      <Pressable hitSlop={10} onPress={onDismiss} style={({ pressed }) => [st.x, pressed && { opacity: 0.5 }]}>
        <Text style={st.xText}>×</Text>
      </Pressable>
    </Animated.View>
  )
}

function RowLink(p: { title: string; sub?: string; left?: React.ReactNode; right?: React.ReactNode; onPress: () => void; bold?: boolean }) {
  return (
    <Pressable onPress={p.onPress} style={({ pressed }) => [st.link, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
      {p.left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[k.rowTitle, p.bold && { fontWeight: '800' }]} numberOfLines={1}>
          {p.title}
        </Text>
        {!!p.sub && (
          <Text style={[k.rowSub, p.bold && { color: C.text }]} numberOfLines={2}>
            {p.sub}
          </Text>
        )}
      </View>
      {p.right}
    </Pressable>
  )
}

const st = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#005c4b', borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.card2, borderBottomLeftRadius: 5 },
  author: { color: C.cyan, fontSize: 12, fontWeight: '800', marginBottom: 2 },
  bubbleText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  thumb: { width: 200, height: 150, borderRadius: 10, marginBottom: 4, backgroundColor: '#000' },
  media: { color: C.text2, fontSize: 13, fontStyle: 'italic' },
  time: { color: 'rgba(255,255,255,0.5)', fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  mailBody: { color: C.text, fontSize: 15, lineHeight: 22, marginTop: 10 },
  dndRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line },
  appIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  appIconText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  app: { color: C.text2, fontSize: 12, fontWeight: '800', flex: 1 },
  noteTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  x: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  xText: { color: C.text2, fontSize: 17, lineHeight: 19, fontWeight: '600' },
})
