import { useEffect } from 'react'
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, SlideInRight, SlideOutRight } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import type { DropLink, Live, LinkState } from '../link'
import type { Prefs } from '../prefs'
import { ControlsScreen } from './ControlsScreen'
import { CrmScreen } from './CrmScreen'
import { DocsScreen } from './DocsScreen'
import { Page } from './kit'
import { MusicScreen } from './MusicScreen'
import { NotesScreen } from './NotesScreen'
import { ServicesScreen } from './ServicesScreen'
import { SettingsScreen } from './SettingsScreen'
import { C } from './theme'
import { TradingScreen } from './TradingScreen'

export type MoreId = 'trading' | 'notes' | 'music' | 'controls' | 'crm' | 'docs' | 'services' | 'settings'

const APPS: { id: MoreId; name: string; color: string; icon: (c: string) => React.ReactNode }[] = [
  { id: 'trading', name: 'Trading', color: '#30d158', icon: (c) => <Path d="M4 17l5-5 4 4 7-8M15 8h5v5" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> },
  { id: 'notes', name: 'Notes', color: '#ffd60a', icon: (c) => <Path d="M6 4h9l4 4v12H6zM9 12h7M9 16h5" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> },
  { id: 'music', name: 'Music', color: '#ff375f', icon: (c) => <Path d="M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 9 18zm10-2a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 19 16z" stroke={c} strokeWidth={1.9} fill="none" strokeLinejoin="round" /> },
  {
    id: 'controls',
    name: 'Controls',
    color: '#0a84ff',
    icon: (c) => (
      <>
        <Path d="M5 7h14M5 17h14" stroke={c} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={9} cy={7} r={2.4} fill="#0b0c0f" stroke={c} strokeWidth={2} />
        <Circle cx={15} cy={17} r={2.4} fill="#0b0c0f" stroke={c} strokeWidth={2} />
      </>
    ),
  },
  {
    id: 'crm',
    name: 'CRM',
    color: '#bf5af2',
    icon: (c) => (
      <>
        <Circle cx={9} cy={9} r={3} stroke={c} strokeWidth={2} fill="none" />
        <Path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.6M17.5 14.5A5 5 0 0 1 20.5 19" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  { id: 'docs', name: 'Documents', color: '#ff453a', icon: (c) => <Path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" stroke={c} strokeWidth={1.9} fill="none" strokeLinejoin="round" strokeLinecap="round" /> },
  {
    id: 'services',
    name: 'Services',
    color: '#64d2ff',
    icon: (c) => (
      <>
        <Rect x={4} y={4} width={7} height={7} rx={2} stroke={c} strokeWidth={2} fill="none" />
        <Rect x={13} y={13} width={7} height={7} rx={2} stroke={c} strokeWidth={2} fill="none" />
        <Path d="M11 7.5h3.5a2 2 0 0 1 2 2V13M13 16.5H9.5a2 2 0 0 1-2-2V11" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'settings',
    name: 'Settings',
    color: '#8e8e93',
    icon: (c) => (
      <>
        <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={2} fill="none" />
        <Path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round" />
      </>
    ),
  },
]

type Props = { link: DropLink; live: Live; state: LinkState; prefs: Prefs; setPrefs: (p: Prefs) => void; onUnpair: () => void; top: number; open: MoreId | null; setOpen: (id: MoreId | null) => void }

/** The rest of the island: trading, notes, music, the Control Center, the CRM, documents, services, and this app's settings. */
export function MoreScreen(p: Props) {
  const { link, live, top, open, setOpen } = p
  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(null)
      return true
    })
    return () => sub.remove()
  }, [open, setOpen])
  const detail: Partial<Record<MoreId, string>> = {
    trading: live.view?.trading?.short ?? live.view?.trading?.text,
    music: live.view?.media ? `${live.view.media.playing ? '▶' : '❚❚'} ${live.view.media.title}` : undefined,
  }
  const back = () => setOpen(null)
  return (
    <View style={{ flex: 1 }}>
      <Page title="More" sub={`Everything on ${link.pairing.name}`} top={top}>
        <View style={st.grid}>
          {APPS.map((a, i) => (
            <Animated.View key={a.id} entering={FadeInDown.delay(i * 35).springify().damping(18)} style={st.cell}>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync()
                  setOpen(a.id)
                }}
                style={({ pressed }) => [st.tile, pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 }]}
              >
                <View style={[st.icon, { backgroundColor: `${a.color}22` }]}>
                  <Svg width={26} height={26} viewBox="0 0 24 24">
                    {a.icon(a.color)}
                  </Svg>
                </View>
                <Text style={st.name}>{a.name}</Text>
                {!!detail[a.id] && (
                  <Text style={st.detail} numberOfLines={1}>
                    {detail[a.id]}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </Page>
      {open && (
        <Animated.View key={open} entering={SlideInRight.springify().damping(22).stiffness(220)} exiting={SlideOutRight.duration(220)} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
          {open === 'trading' && <TradingScreen link={link} live={live} top={top} onBack={back} />}
          {open === 'notes' && <NotesScreen link={link} top={top} onBack={back} />}
          {open === 'music' && <MusicScreen link={link} live={live} top={top} onBack={back} />}
          {open === 'controls' && <ControlsScreen link={link} live={live} top={top} onBack={back} />}
          {open === 'crm' && <CrmScreen link={link} top={top} onBack={back} />}
          {open === 'docs' && <DocsScreen link={link} top={top} onBack={back} />}
          {open === 'services' && <ServicesScreen link={link} top={top} onBack={back} />}
          {open === 'settings' && <SettingsScreen link={link} state={p.state} prefs={p.prefs} setPrefs={p.setPrefs} onUnpair={p.onUnpair} top={top} onBack={back} />}
        </Animated.View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cell: { width: '50%', padding: 5 },
  tile: { backgroundColor: C.card, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: C.line, height: 122 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text, fontSize: 16, fontWeight: '800', marginTop: 12 },
  detail: { color: C.text2, fontSize: 12, marginTop: 2 },
})
