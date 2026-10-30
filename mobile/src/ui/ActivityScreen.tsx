import { useState } from 'react'
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import type { PhoneNote } from '../islandTypes'
import type { DropLink, Live } from '../link'
import { whenText } from '../files'
import { C } from './theme'

const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68']
const colorFor = (app: string) => PALETTE[[...app].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length]

/** Your computer's notifications (its notification center), newest first. */
export function ActivityScreen({ link, live, top }: { link: DropLink; live: Live; top: number }) {
  const [refreshing, setRefreshing] = useState(false)
  const notes = live.view?.notes ?? []
  const today = new Date().toDateString()
  const sections = [
    { title: 'Today', data: notes.filter((n) => new Date(n.at).toDateString() === today) },
    { title: 'Earlier', data: notes.filter((n) => new Date(n.at).toDateString() !== today) },
  ].filter((x) => x.data.length)

  return (
    <SectionList
      style={{ flex: 1 }}
      sections={sections}
      keyExtractor={(n) => `${n.id}@${n.at}`}
      contentContainerStyle={{ padding: 16, paddingTop: top + 8, paddingBottom: 120 }}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor="#fff"
          onRefresh={async () => {
            setRefreshing(true)
            await link.refresh()
            setRefreshing(false)
          }}
        />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 6 }}>
          <Text style={s.h1}>Activity</Text>
          <Text style={s.hint}>Notifications on {link.pairing.name}{live.view?.dnd ? ' (Do Not Disturb is on)' : ''}.</Text>
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>Nothing yet. Notifications your computer shows (WhatsApp, mail, your apps) appear here.</Text>}
      renderSectionHeader={({ section }) => <Text style={s.section}>{section.title}</Text>}
      renderItem={({ item, index }) => <Note n={item} index={index} />}
    />
  )
}

function Note({ n, index }: { n: PhoneNote; index: number }) {
  const color = colorFor(n.app)
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30).springify().damping(18)} style={s.note}>
      <View style={[s.avatar, { backgroundColor: color }]}>
        <Text style={s.avatarText}>{n.app.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.row}>
          <Text style={s.app} numberOfLines={1}>
            {n.app}
          </Text>
          <Text style={s.when}>{whenText(n.at)}</Text>
        </View>
        <Text style={s.title} numberOfLines={2}>
          {n.title}
        </Text>
        {!!n.body && (
          <Text style={s.body} numberOfLines={3}>
            {n.body}
          </Text>
        )}
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  h1: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  hint: { color: C.text3, fontSize: 13, marginTop: 4 },
  empty: { color: C.text3, fontSize: 14, lineHeight: 20, marginTop: 18 },
  section: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 14, marginBottom: 8 },
  note: { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  avatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  app: { color: C.text2, fontSize: 12, fontWeight: '800', flex: 1 },
  when: { color: C.text3, fontSize: 12 },
  title: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  body: { color: C.text2, fontSize: 14, marginTop: 2, lineHeight: 19 },
})
