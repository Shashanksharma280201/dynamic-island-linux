import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { liveLink } from '../../modules/live-link'
import { shareIntake } from '../../modules/share-intake'
import { DEVICE, type DropLink, type LinkState } from '../link'
import type { Prefs } from '../prefs'
import { routeName } from '../protocol'
import { Icon, IconTile, type IconName } from './icons'
import { Page, Row, Section, Switch, ago } from './kit'
import { themed, useTheme, type ThemePref } from './theme'

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'auto' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
]

/** The look, the link to your computer, how the app keeps in touch, and the pairing. */
export function SettingsScreen({ link, state, prefs, setPrefs, onUnpair, top, onBack }: { link: DropLink; state: LinkState; prefs: Prefs; setPrefs: (p: Prefs) => void; onUnpair: () => void; top: number; onBack?: () => void }) {
  const C = useTheme()
  const s = useS()
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState<string | null>(null)
  const status = state.phase === 'ready' ? 'Connected' : state.phase === 'finding' ? (state.scanning ? 'Searching this Wi-Fi…' : 'Looking for it…') : 'Can’t reach it'
  const dot = state.phase === 'ready' ? C.green : state.phase === 'finding' ? C.orange : C.red

  const test = async () => {
    setTesting(true)
    setTested(null)
    const ms = await link.ping()
    setTesting(false)
    setTested(ms == null ? 'No answer' : `${ms} ms`)
    void Haptics.notificationAsync(ms == null ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success)
  }

  return (
    <Page title="Settings" top={top} onBack={onBack}>
      <View style={s.hero}>
        <IconTile name="laptop" color={C.accent} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={s.heroName} numberOfLines={1}>
            {link.pairing.name}
          </Text>
          <View style={s.heroStatus}>
            <View style={[s.dot, { backgroundColor: dot }]} />
            <Text style={s.heroSub} numberOfLines={1}>
              {status}
              {state.phase === 'ready' && state.route ? ` · ${routeName(state.route)}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <Section title="Appearance">
        <View style={s.themes}>
          {THEMES.map((t) => {
            const on = prefs.theme === t.id
            return (
              <Pressable
                key={t.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  void Haptics.selectionAsync()
                  setPrefs({ ...prefs, theme: t.id })
                }}
                style={({ pressed }) => [s.theme, on && { borderColor: C.accent }, pressed && { opacity: 0.85 }]}
              >
                <Preview kind={t.id} />
                <View style={s.themeLabel}>
                  <Icon name={t.icon} size={15} color={on ? C.accent : C.text2} />
                  <Text style={[s.themeText, on && { color: C.accent }]}>{t.label}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      </Section>

      <Section title="Connection" note={`This phone shows up on ${link.pairing.name} as “${DEVICE}”. If the computer’s address changes on this Wi-Fi, the app finds it again by itself.`}>
        <Row icon={{ name: 'pulse', color: dot }} title="Status" right={status} />
        <Row icon={{ name: state.route === 'tailscale' ? 'globe' : 'wifi', color: C.blue }} title="Route" right={state.route ? routeName(state.route) : 'None'} />
        <Row icon={{ name: 'link', color: C.cyan }} title="Address" right={state.url ? state.url.replace(/^https?:\/\//, '') : 'None'} />
        <Row
          icon={{ name: 'bolt', color: C.orange }}
          title="Round trip"
          sub={state.checkedAt ? `Checked ${ago(state.checkedAt) === 'now' ? 'just now' : `${ago(state.checkedAt)} ago`}` : undefined}
          right={tested ?? (state.ms != null ? `${state.ms} ms` : 'None')}
        />
        <Row
          icon={{ name: 'refresh', color: C.green }}
          title="Test the connection"
          onPress={() => void test()}
          right={testing ? <ActivityIndicator color={C.text2} /> : undefined}
          chevron={!testing}
        />
        <Row
          icon={{ name: 'qr', color: C.violet }}
          title="Find my computer again"
          sub={`Knows ${link.pairing.urls.length} address${link.pairing.urls.length === 1 ? '' : 'es'} for it`}
          onPress={() => void link.find()}
          chevron
          last
        />
      </Section>

      <Section title="In the background">
        <Row
          icon={{ name: 'bell', color: C.red }}
          title="Stay connected"
          sub={liveLink.available ? 'Approvals and files arrive even when the app is closed (a quiet ongoing notification).' : 'Needs the installed app (not Expo Go).'}
          right={<Switch value={prefs.background && liveLink.available} disabled={!liveLink.available} onChange={(background) => setPrefs({ ...prefs, background })} />}
        />
        <Row
          icon={{ name: 'phone', color: C.blue }}
          title="My computer’s notifications"
          sub="WhatsApp, mail and your apps’ notifications, on this phone too."
          right={<Switch value={prefs.computerNotes} onChange={(computerNotes) => setPrefs({ ...prefs, computerNotes })} />}
          last
        />
      </Section>

      <Section title="Good to know">
        <Row icon={{ name: 'shield', color: C.green }} title="Approvals" sub="Answer here, on the notification or on the island: the first answer wins. They stay private on the lock screen." />
        <Row icon={{ name: 'laptop', color: C.text3 }} title="It all runs on your computer" sub="Notes are saved there, messages go from its WhatsApp, Claude works there." />
        <Row icon={{ name: 'send', color: C.accent }} title="Sharing" sub={shareIntake.available ? 'Share from any app and pick Island Drop to send it to your computer.' : 'Sharing from other apps needs the installed app.'} last />
      </Section>

      <Section>
        <Row
          title="Unpair this phone"
          danger
          onPress={() =>
            Alert.alert('Unpair this phone?', `It won’t reach ${link.pairing.name} until you scan its QR again.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Unpair', style: 'destructive', onPress: onUnpair },
            ])
          }
          last
        />
      </Section>
    </Page>
  )
}

/** A tiny picture of the app in that theme (half and half for System). */
function Preview({ kind }: { kind: ThemePref }) {
  const s = useS()
  const half = (dark: boolean) => (
    <View style={[s.previewHalf, { backgroundColor: dark ? '#09090b' : '#f2f2f6' }]}>
      <View style={[s.previewBar, { backgroundColor: dark ? '#f4f4f6' : '#111114' }]} />
      <View style={[s.previewCard, { backgroundColor: dark ? '#1c1d21' : '#ffffff' }]} />
      <View style={[s.previewCard, { backgroundColor: dark ? '#1c1d21' : '#ffffff', width: '60%' }]} />
    </View>
  )
  return (
    <View style={s.preview}>
      {kind === 'system' ? (
        <>
          {half(false)}
          {half(true)}
        </>
      ) : (
        half(kind === 'dark')
      )}
    </View>
  )
}

const useS = themed((C) => ({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: C.dark ? 1 : 0, borderColor: C.line, ...C.shadow },
  heroName: { color: C.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  heroSub: { color: C.text2, fontSize: 13.5, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  themes: { flexDirection: 'row', gap: 10, paddingVertical: 14 },
  theme: { flex: 1, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', padding: 6, alignItems: 'center', gap: 8 },
  themeLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingBottom: 2 },
  themeText: { color: C.text2, fontSize: 13, fontWeight: '600' },
  preview: { width: '100%', aspectRatio: 0.82, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  previewHalf: { flex: 1, padding: 7, gap: 5 },
  previewBar: { height: 5, width: '55%', borderRadius: 3, opacity: 0.85, marginBottom: 3 },
  previewCard: { height: 14, borderRadius: 4 },
}))
