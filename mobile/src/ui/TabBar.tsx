import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useKeyboard } from './kit'
import { glide } from './motion'
import { TABS, TAB_SIZE, type TabId } from './tabs'
import { themed, useTheme } from './theme'

export { TABS, TAB_SIZE, tabCenterX, type TabId } from './tabs'
const LABEL: Record<TabId, string> = { island: 'Island', claude: 'Claude', files: 'Files', inbox: 'Inbox', more: 'More' }

function Icon({ id, color }: { id: TabId; color: string }) {
  const p = { stroke: color, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {id === 'island' && (
        <>
          <Rect x={3.5} y={8} width={17} height={8} rx={4} {...p} />
          <Circle cx={15.5} cy={12} r={1.5} fill={color} />
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
          <Circle cx={6} cy={12} r={1.5} fill={color} />
          <Circle cx={12} cy={12} r={1.5} fill={color} />
          <Circle cx={18} cy={12} r={1.5} fill={color} />
        </>
      )}
    </Svg>
  )
}

/**
 * The tabs: a small pill of icons floating at the bottom, the chosen one on
 * a circle of the accent that moves to it. A dot on a tab says something is
 * waiting there. What scrolls behind fades out under it.
 */
export function TabBar({ tab, setTab, badges, bottom }: { tab: TabId; setTab: (t: TabId) => void; badges: Partial<Record<TabId, number>>; bottom: number }) {
  const C = useTheme()
  const s = useS()
  // Typing: the bar steps aside so what you type sits right above the keyboard.
  const kb = useKeyboard()
  const i = Math.max(0, TABS.indexOf(tab))
  const x = useSharedValue(i * TAB_SIZE)
  useEffect(() => {
    x.value = glide(i * TAB_SIZE)
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  if (kb) return null
  const lift = Math.max(14, bottom)
  return (
    <>
      {/* What scrolls behind the bar fades out from above it to its middle, and nothing shows below that. */}
      <View pointerEvents="none" style={[s.under, { height: lift + TAB_SIZE + 22 }]}>
        <Svg width="100%" height={22 + TAB_SIZE / 2}>
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
      <View pointerEvents="box-none" style={[s.wrap, { bottom: lift }]}>
        <View style={s.bar} accessibilityRole="tablist">
          <Animated.View style={[s.chosen, chosen]} />
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
                <Icon id={t} color={on ? C.onPrimary : C.text} />
                {n > 0 && !on && <View style={s.dot} />}
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
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: { flexDirection: 'row', height: TAB_SIZE, borderRadius: TAB_SIZE / 2, backgroundColor: C.bar, boxShadow: C.dark ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(30,20,10,0.12), 0 1px 2px rgba(30,20,10,0.05)' },
  chosen: { position: 'absolute', left: 0, top: 0, width: TAB_SIZE, height: TAB_SIZE, borderRadius: TAB_SIZE / 2, backgroundColor: C.accent },
  tab: { width: TAB_SIZE, height: TAB_SIZE, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 13, right: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: C.accent, borderWidth: 1.5, borderColor: C.bar },
}))
