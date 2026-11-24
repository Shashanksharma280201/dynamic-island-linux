import { useEffect, useRef, useState } from 'react'
import { Alert, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native'
import { Text } from './Text'
import Animated from 'react-native-reanimated'
import type { ChatMessage, ChatSummary, InboxSources, InboxUnread, MailMessageView, MailSummary } from '../../../shared/types'
import type { PhoneNote } from '../islandTypes'
import type { DropLink, Live } from '../link'
import { whenText } from '../files'
import { Avatar, Badge, Btn, Composer, Empty, ErrorLine, Page, SIDE, Segmented, Switch, TAB_ROOM, ago, useKit, useAction, useCall, useKeyboard } from './kit'
import { themed, useTheme } from './theme'
import { Icon } from './icons'
import { PUSH_IN, PUSH_OUT, LEAVE } from './motion'

type Tab = 'chats' | 'mail' | 'alerts'
type Open = { kind: 'chat'; chat: ChatSummary } | { kind: 'mail'; mail: MailSummary } | null

/** Your computer's WhatsApp, mail and notifications: read, reply, clear. */
export function InboxScreen({ link, live, top, bottom }: { link: DropLink; live: Live; top: number; bottom: number }) {
  const C = useTheme()
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
          style={{ marginHorizontal: SIDE, marginBottom: 12 }}
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
        <Animated.View entering={PUSH_IN} exiting={PUSH_OUT} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
          {open.kind === 'chat' ? <Thread link={link} chat={open.chat} top={top} bottom={bottom} onBack={() => setOpen(null)} /> : <MailView link={link} m={open.mail} top={top} bottom={bottom} onBack={() => setOpen(null)} />}
        </Animated.View>
      )}
    </View>
  )
}

// ---- WhatsApp ----

function Chats({ link, sources, onOpen }: { link: DropLink; sources: InboxSources | null; onOpen: (c: ChatSummary) => void }) {
  const C = useTheme()
  const st = useSt()
  const k = useKit()
  const ready = sources?.whatsapp === 'ready'
  const { data, error, loading } = useCall<ChatSummary[]>(link, 'inbox.chats', [], { topic: 'inbox', when: ready })
  if (sources && !ready)
    return <Empty title={sources.whatsapp === 'linking' ? 'WhatsApp is linking…' : 'WhatsApp isn’t on'} text="Link WhatsApp in the island’s Settings on your computer, and your chats show up here to read and answer." />
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 130 }}>
      {loading && !data && <Empty busy title="Getting your chats…" />}
      <ErrorLine message={error} />
      {data && !data.length && <Empty title="No chats yet" />}
      {!!data?.length && (
        <View style={st.list}>
          {data.map((c, i) => (
            <Animated.View key={c.id}>
              <RowLink
                first={i === 0}
                onPress={() => onOpen(c)}
                left={<Avatar name={c.name} uri={c.avatar} size={44} />}
                title={c.name}
                sub={`${c.lastFromMe ? 'You: ' : ''}${c.last}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Text style={[k.rowRight, c.unread > 0 && { color: C.accent }]}>{ago(c.time)}</Text>
                    <Badge n={c.unread} />
                  </View>
                }
                bold={c.unread > 0}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function Thread({ link, chat, top, bottom, onBack }: { link: DropLink; chat: ChatSummary; top: number; bottom: number; onBack: () => void }) {
  const st = useSt()
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
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: SIDE, paddingTop: 6, gap: 8 }}>
          {!data && !error && <Empty busy title="Opening the chat…" />}
          <ErrorLine message={error} />
          {data?.map((m) => (
            <Animated.View key={m.id} style={[st.bubble, m.fromMe ? st.mine : st.theirs]}>
              {chat.isGroup && !m.fromMe && !!m.author && <Text style={st.author}>{m.author}</Text>}
              {m.media?.thumb && <Image source={{ uri: m.media.thumb }} style={st.thumb} />}
              {m.media && !m.media.thumb && <Text style={st.media}>{m.media.name ?? m.media.kind}</Text>}
              {!!m.text && (
                <Text style={[st.bubbleText, m.fromMe && st.onMine]} selectable>
                  {m.text}
                </Text>
              )}
              <Text style={[st.time, m.fromMe && st.onMine, m.fromMe && { opacity: 0.75 }]}>{new Date(m.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
            </Animated.View>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: SIDE - 4, paddingBottom: kb ? 8 : bottom + TAB_ROOM, gap: 6 }}>
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
  const C = useTheme()
  const st = useSt()
  const k = useKit()
  const has = !!sources?.mail.length
  const { data, error, loading } = useCall<MailSummary[]>(link, 'inbox.mailList', [], { topic: 'inbox', when: has })
  if (sources && !has) return <Empty title="No mail accounts" text="Add a mail account in the island’s Settings on your computer, and your inbox shows up here." />
  const label = (id: string) => sources?.mail.find((a) => a.id === id)?.label
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 130 }}>
      {loading && !data && <Empty busy title="Getting your mail…" />}
      <ErrorLine message={error} />
      {data && !data.length && <Empty title="Inbox zero" />}
      {!!data?.length && (
        <View style={st.list}>
          {data.map((m, i) => (
            <Animated.View key={`${m.accountId}-${m.uid}`}>
              <RowLink
                first={i === 0}
                onPress={() => onOpen(m)}
                left={<View style={[st.dot, { backgroundColor: m.unread ? C.accent : 'transparent' }]} />}
                title={m.from.name || m.from.address}
                sub={`${m.subject}${m.snippet ? `\n${m.snippet}` : ''}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[k.rowRight, m.unread && { color: C.accent }]}>{ago(m.date)}</Text>
                    {(sources?.mail.length ?? 0) > 1 && <Text style={[k.rowRight, { fontSize: 11 }]}>{label(m.accountId)}</Text>}
                  </View>
                }
                bold={m.unread}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function MailView({ link, m, top, bottom, onBack }: { link: DropLink; m: MailSummary; top: number; bottom: number; onBack: () => void }) {
  const C = useTheme()
  const st = useSt()
  const k = useKit()
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SIDE, paddingTop: 6, gap: 10 }}>
          {!data && !error && <Empty busy title="Opening…" />}
          <ErrorLine message={error} />
          {data && (
            <Animated.View style={k.card}>
              <Text style={k.rowSub}>From {data.from.address}</Text>
              {!!data.to && <Text style={k.rowSub}>To {data.to}</Text>}
              <Text style={st.mailBody} selectable>
                {data.text || data.snippet}
              </Text>
            </Animated.View>
          )}
          {sent && <Text style={{ color: C.green, fontWeight: '500', fontSize: 14, paddingHorizontal: 6 }}>Reply sent.</Text>}
        </ScrollView>
        <View style={{ paddingHorizontal: SIDE - 4, paddingBottom: kb ? 8 : bottom + TAB_ROOM, gap: 6 }}>
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

/** The computer's notification center: clear one or all, Do Not Disturb. */
function Alerts({ link, live }: { link: DropLink; live: Live }) {
  const C = useTheme()
  const st = useSt()
  const k = useKit()
  const notes = live.view?.notes ?? []
  const act = useAction(link)
  const [dnd, setDnd] = useState(!!live.view?.dnd)
  useEffect(() => setDnd(!!live.view?.dnd), [live.view?.dnd])
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 130, gap: 10 }}>
      <View style={[k.card, st.dndRow]}>
        <View style={{ flex: 1 }}>
          <Text style={k.rowTitle}>Do Not Disturb</Text>
          <Text style={k.rowSub}>No cards or sounds on the computer.</Text>
        </View>
        <Switch
          value={dnd}
          onChange={(on) => {
            setDnd(on)
            void act.run('dnd', 'notifications.setDnd', on)
          }}
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
  const C = useTheme()
  const st = useSt()
  const k = useKit()
  return (
    <Animated.View exiting={LEAVE} style={st.note}>
      <View style={st.appIcon}>
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
      <Pressable hitSlop={10} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Clear" style={({ pressed }) => [st.x, pressed && { opacity: 0.5 }]}>
        <Icon name="close" size={13} color={C.text2} />
      </Pressable>
    </Animated.View>
  )
}

function RowLink(p: { title: string; sub?: string; left?: React.ReactNode; right?: React.ReactNode; onPress: () => void; bold?: boolean; first?: boolean }) {
  const C = useTheme()
  const st = useSt()
  const k = useKit()
  return (
    <Pressable onPress={p.onPress} style={({ pressed }) => [st.link, !p.first && st.linkLine, pressed && { opacity: 0.6 }]}>
      {p.left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[k.rowTitle, p.bold && { fontWeight: '700' }]} numberOfLines={1}>
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

const useSt = themed((C) => ({
  list: { backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 4, ...C.shadow },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  linkLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bubble: { maxWidth: '82%', borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.primary, borderBottomRightRadius: 8 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.card, borderBottomLeftRadius: 8, ...C.shadow },
  onMine: { color: C.onPrimary },
  author: { color: C.accent, fontSize: 12.5, fontWeight: '500', marginBottom: 2 },
  bubbleText: { color: C.text, fontSize: 15.5, lineHeight: 22 },
  thumb: { width: 200, height: 150, borderRadius: 14, marginBottom: 4, backgroundColor: '#000' },
  media: { color: C.text2, fontSize: 13, fontStyle: 'italic' },
  time: { color: C.text3, fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  mailBody: { color: C.text, fontSize: 15.5, lineHeight: 23, marginTop: 12 },
  dndRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 24, padding: 18, ...C.shadow },
  appIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  appIconText: { color: C.text, fontSize: 16, fontWeight: '500' },
  app: { color: C.text2, fontSize: 13, flex: 1 },
  noteTitle: { color: C.text, fontSize: 15.5, fontWeight: '500', marginTop: 2 },
  x: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
}))
