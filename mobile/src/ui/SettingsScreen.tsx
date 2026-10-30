import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { liveLink } from '../../modules/live-link'
import { shareIntake } from '../../modules/share-intake'
import { DEVICE, type DropLink, type LinkState } from '../link'
import type { Prefs } from '../prefs'
import { Page } from './kit'
import { C } from './theme'

/** The pairing, how the app keeps in touch, and what it notifies you about. */
export function SettingsScreen({ link, state, prefs, setPrefs, onUnpair, top, onBack }: { link: DropLink; state: LinkState; prefs: Prefs; setPrefs: (p: Prefs) => void; onUnpair: () => void; top: number; onBack?: () => void }) {
  return (
    <Page title="Settings" top={top} onBack={onBack}>

      <View style={s.card}>
        <Text style={s.kicker}>Paired with</Text>
        <Text style={s.big}>{link.pairing.name}</Text>
        <Text style={s.sub}>{state.url ? `At ${state.url.replace(/^https?:\/\//, '')}` : (state.error ?? 'Looking for it…')}</Text>
        <Text style={s.sub}>This phone shows up there as “{DEVICE}”.</Text>
        <Pressable style={s.button} onPress={() => void link.find()}>
          <Text style={s.buttonText}>Look for it again</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Row
          title="Stay connected in the background"
          sub={liveLink.available ? 'Approvals and files arrive even when the app isn’t open (a quiet ongoing notification). Swipe the app away to stop.' : 'Needs the installed app (not Expo Go).'}
          value={prefs.background && liveLink.available}
          disabled={!liveLink.available}
          onChange={(background) => setPrefs({ ...prefs, background })}
        />
        <View style={s.sep} />
        <Row title="Show my computer’s notifications here" sub="WhatsApp, mail and your apps’ notifications from the computer, as phone notifications." value={prefs.computerNotes} onChange={(computerNotes) => setPrefs({ ...prefs, computerNotes })} />
      </View>

      <View style={s.card}>
        <Text style={s.kicker}>Good to know</Text>
        <Text style={s.p}>• Approvals (Claude Code, trades, the assistant) can be answered here, on their notification, or on the island. The first answer wins.</Text>
        <Text style={s.p}>• Everything here works on your computer itself: a note you write is saved there, a message you send goes from its WhatsApp, Claude runs there.</Text>
        <Text style={s.p}>• Notifications for approvals are private on the lock screen, so they can’t be answered on a locked phone.</Text>
        <Text style={s.p}>• {shareIntake.available ? 'Share from any app and pick Island Drop to send it to your computer.' : 'Sharing from other apps needs the installed app.'}</Text>
      </View>

      <Pressable
        style={s.danger}
        onPress={() =>
          Alert.alert('Unpair this phone?', `It won’t reach ${link.pairing.name} until you scan its QR again.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Unpair', style: 'destructive', onPress: onUnpair },
          ])
        }
      >
        <Text style={s.dangerText}>Unpair</Text>
      </Pressable>
    </Page>
  )
}

function Row({ title, sub, value, onChange, disabled }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: C.green, false: 'rgba(255,255,255,0.15)' }} thumbColor="#fff" />
    </View>
  )
}

const s = StyleSheet.create({
  h1: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C.line },
  kicker: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  big: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 4 },
  sub: { color: C.text3, fontSize: 13, marginTop: 4, lineHeight: 18 },
  p: { color: C.text2, fontSize: 14, marginTop: 8, lineHeight: 20 },
  button: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 },
  buttonText: { color: C.text, fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 14 },
  danger: { alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(255,69,58,0.12)' },
  dangerText: { color: C.red, fontSize: 15, fontWeight: '800' },
})
