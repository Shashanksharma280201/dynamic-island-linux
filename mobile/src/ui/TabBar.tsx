import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useKeyboard } from './kit'
import { themed, useTheme } from './theme'

export type TabId = 'island' | 'claude' | 'files' | 'inbox' | 'more'
export const TABS: TabId[] = ['island', 'claude', 'files', 'inbox', 'more']
const LABEL: Record<TabId, string> = { island: 'Island', claude: 'Claude', files: 'Files', inbox: 'Inbox', more: 'More' }

function Icon({ id, color }: { id: TabId; color: string }) {
  const p = { stroke: color, strokeWidth: 1.9, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {id === 'island' && (
        <>
          <Rect x={3.5} y={8} width={17} height={8} rx={4} {...p} />
          <Circle cx={8} cy={12} r={1.6} fill={color} />
        </>
      )}
      {id === 'files' && (
        <>
          <Rect x={4} y={4} width={7} height={7} rx={2} {...p} />
          <Rect x={13} y={4} width={7} height={7} rx={2} {...p} />
          <Rect x={4} y={13} width={7} height={7} rx={2} {...p} />
          <Rect x={13} y={13} width={7} height={7} rx={2} {...p} />
        </>
      )}
      {id === 'claude' && <Path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9zM18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" {...p} />}
      {id === 'inbox' && <Path d="M4 13l2.5-7.5h11L20 13v5.5H4zM4 13h4.5l1.2 2.5h4.6l1.2-2.5H20" {...p} />}
      {id === 'more' && (
        <>
          <Circle cx={6} cy={12} r={1.7} fill={color} />
          <Circle cx={12} cy={12} r={1.7} fill={color} />
          <Circle cx={18} cy={12} r={1.7} fill={color} />
        </>
      )}
    </Svg>
  )
}

/** The tabs, floating at the bottom, with what's waiting on the Island tab. The chosen one is lit, nothing slides. */
export function TabBar({ tab, setTab, badges, bottom }: { tab: TabId; setTab: (t: TabId) => void; badges: Partial<Record<TabId, number>>; bottom: number }) {
  const C = useTheme()
  const s = useS()
  // Typing: the bar steps aside so what you type sits right above the keyboard.
  const kb = useKeyboard()
  // The bar's own height, for what covers the screen behind it.
  const [barH, setBarH] = useState(62)
  if (kb) return null
  const lift = Math.max(12, bottom)
  return (
    <>
      {/* What scrolls behind the bar fades out from its top edge to its middle, and nothing shows below that. */}
      <View pointerEvents="none" style={[s.under, { height: lift + barH }]}>
        <Svg width="100%" height={barH / 2}>
          <Defs>
            <LinearGradient id="tab-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.bg} stopOpacity={0} />
              <Stop offset="1" stopColor={C.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#tab-fade)" />
        </Svg>
        <View style={{ flex: 1, backgroundColor: C.bg }} />
      </View>
      <View style={[s.wrap, { bottom: lift }]}>
        <View style={s.bar} onLayout={(e) => setBarH(Math.round(e.nativeEvent.layout.height))}>
        {TABS.map((t) => {
          const on = t === tab
          const n = badges[t] ?? 0
          return (
            <Pressable
              key={t}
              style={s.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={n > 0 ? `${LABEL[t]}, ${n} new` : LABEL[t]}
              onPress={() => {
                if (!on) void Haptics.selectionAsync()
                setTab(t)
              }}
            >
              <View style={[s.ind, on && { backgroundColor: C.accentSoft }]}>
                <Icon id={t} color={on ? C.accent : C.text2} />
                {n > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{n > 9 ? '9+' : n}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.label, on && { color: C.text, fontWeight: '700' }]}>{LABEL[t]}</Text>
            </Pressable>
          )
        })}
        </View>
      </View>
    </>
  )
}

const useS = themed((C) => ({
  under: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  wrap: { position: 'absolute', left: 12, right: 12 },
  bar: { flexDirection: 'row', backgroundColor: C.bar, borderRadius: 26, padding: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, elevation: 18, shadowColor: '#000', shadowOpacity: C.dark ? 0.4 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  ind: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { color: C.text2, fontSize: 11, fontWeight: '600' },
  badge: { position: 'absolute', top: -3, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.bar },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
}))
