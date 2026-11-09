import { useEffect } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, SlideInRight, SlideOutRight } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { DropLink, Live, LinkState } from '../link'
import type { Prefs } from '../prefs'
import { ControlsScreen } from './ControlsScreen'
import { CrmScreen } from './CrmScreen'
import { DocsScreen } from './DocsScreen'
import { Page, Row, Section } from './kit'
import type { IconName } from './icons'
import { MusicScreen } from './MusicScreen'
import { NotesScreen } from './NotesScreen'
import { ServicesScreen } from './ServicesScreen'
import { TodayScreen } from './TodayScreen'
import { AgentsScreen } from './AgentsScreen'
import { SettingsScreen } from './SettingsScreen'
import { useTheme } from './theme'
import { TradingScreen } from './TradingScreen'

export type MoreId = 'today' | 'agents' | 'trading' | 'notes' | 'music' | 'controls' | 'crm' | 'docs' | 'services' | 'settings'

/** The rest of the island, grouped as a settings list: your day, work, this computer, the app. */
const GROUPS: { title: string; items: { id: MoreId; name: string; color: string; icon: IconName; about: string }[] }[] = [
  {
    title: 'Your day',
    items: [
      { id: 'today', name: 'Today', color: '#ff9f0a', icon: 'calendar', about: 'What’s next and what you did' },
      { id: 'agents', name: 'Agents', color: '#5e5ce6', icon: 'sparkle', about: 'Watches and research for you' },
      { id: 'notes', name: 'Notes', color: '#e6b800', icon: 'note', about: 'Your notes on the computer' },
    ],
  },
  {
    title: 'Work',
    items: [
      { id: 'trading', name: 'Trading', color: '#30d158', icon: 'trend', about: 'Today’s trades and positions' },
      { id: 'crm', name: 'CRM', color: '#bf5af2', icon: 'people', about: 'People, deals and follow-ups' },
      { id: 'docs', name: 'Documents', color: '#ff453a', icon: 'doc', about: 'Merge, convert and print' },
      { id: 'services', name: 'Services', color: '#32ade6', icon: 'layers', about: 'GitHub, Vercel, Stripe and more' },
    ],
  },
  {
    title: 'This computer',
    items: [
      { id: 'music', name: 'Music', color: '#ff375f', icon: 'music', about: 'What’s playing, and Spotify' },
      { id: 'controls', name: 'Controls', color: '#0a84ff', icon: 'sliders', about: 'Volume, brightness, Wi-Fi' },
    ],
  },
  {
    title: 'Island Drop',
    items: [{ id: 'settings', name: 'Settings', color: '#8e8e93', icon: 'gear', about: 'Appearance and the connection' }],
  },
]

type Props = { link: DropLink; live: Live; state: LinkState; prefs: Prefs; setPrefs: (p: Prefs) => void; onUnpair: () => void; top: number; open: MoreId | null; setOpen: (id: MoreId | null) => void }

/** The rest of the island: Today, Agents, trading, notes, music, the Control Center, the CRM, documents, services, and this app's settings. */
export function MoreScreen(p: Props) {
  const C = useTheme()
  const { link, live, top, open, setOpen } = p
  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(null)
      return true
    })
    return () => sub.remove()
  }, [open, setOpen])
  // What's live there now says more than what it's for.
  const now: Partial<Record<MoreId, string>> = {
    trading: live.view?.trading ? `${live.view.trading.text} today` : undefined,
    music: live.view?.media ? `${live.view.media.playing ? 'Playing' : 'Paused'}: ${[live.view.media.title, live.view.media.artist].filter(Boolean).join(' · ')}` : undefined,
  }
  const back = () => setOpen(null)
  return (
    <View style={{ flex: 1 }}>
      <Page title="More" sub={`Everything on ${link.pairing.name}`} top={top}>
        {GROUPS.map((g, gi) => (
          <Animated.View key={g.title} entering={FadeInDown.delay(gi * 40).springify().damping(18)}>
            <Section title={g.title}>
              {g.items.map((a, i) => (
                <Row
                  key={a.id}
                  icon={{ name: a.icon, color: a.color }}
                  title={a.name}
                  sub={now[a.id] ?? a.about}
                  chevron
                  last={i === g.items.length - 1}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setOpen(a.id)
                  }}
                />
              ))}
            </Section>
          </Animated.View>
        ))}
      </Page>
      {open && (
        <Animated.View key={open} entering={SlideInRight.springify().damping(22).stiffness(220)} exiting={SlideOutRight.duration(220)} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
          {open === 'today' && <TodayScreen link={link} top={top} onBack={back} />}
          {open === 'agents' && <AgentsScreen link={link} top={top} onBack={back} />}
          {open === 'trading' && <TradingScreen link={link} live={live} top={top} onBack={back} />}
          {open === 'notes' && <NotesScreen link={link} top={top} onBack={back} />}
          {open === 'music' && <MusicScreen link={link} live={live} top={top} onBack={back} />}
          {open === 'controls' && <ControlsScreen link={link} live={live} top={top} onBack={back} />}
          {open === 'crm' && <CrmScreen link={link} top={top} onBack={back} />}
          {open === 'docs' && <DocsScreen link={link} top={top} onBack={back} />}
          {open === 'services' && <ServicesScreen link={link} top={top} onBack={back} />}
          {open === 'settings' && <SettingsScreen link={link} live={live} state={p.state} prefs={p.prefs} setPrefs={p.setPrefs} onUnpair={p.onUnpair} top={top} onBack={back} />}
        </Animated.View>
      )}
    </View>
  )
}
