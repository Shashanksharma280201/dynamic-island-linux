import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useKeyboard } from './kit'
import { C } from './theme'

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

/** The tabs, floating at the bottom, with what's waiting on the Island tab. */
export function TabBar({ tab, setTab, badges, bottom }: { tab: TabId; setTab: (t: TabId) => void; badges: Partial<Record<TabId, number>>; bottom: number }) {
  const [w, setW] = useState(0)
  const i = TABS.indexOf(tab)
  const x = useSharedValue(0)
  useEffect(() => {
    x.value = withSpring((i * w) / TABS.length, { damping: 18, stiffness: 220 })
  }, [i, w]) // eslint-disable-line react-hooks/exhaustive-deps
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  // Typing: the bar steps aside so what you type sits right above the keyboard.
  const kb = useKeyboard()
  const away = useSharedValue(0)
  useEffect(() => {
    away.value = withSpring(kb ? 1 : 0, { damping: 20, stiffness: 220 })
  }, [kb]) // eslint-disable-line react-hooks/exhaustive-deps
  const hide = useAnimatedStyle(() => ({ opacity: 1 - away.value, transform: [{ translateY: away.value * 120 }] }))
  return (
    <Animated.View pointerEvents={kb ? 'none' : 'auto'} style={[s.wrap, { bottom: Math.max(12, bottom) }, hide]}>
      <View style={s.bar} onLayout={(e) => setW(e.nativeEvent.layout.width - 12)}>
        {w > 0 && <Animated.View style={[s.pill, { width: w / TABS.length }, pill]} />}
        {TABS.map((t) => {
          const on = t === tab
          const n = badges[t] ?? 0
          return (
            <Pressable
              key={t}
              style={s.tab}
              onPress={() => {
                if (!on) void Haptics.selectionAsync()
                setTab(t)
              }}
            >
              <Icon id={t} color={on ? '#fff' : C.text3} />
              <Text style={[s.label, on && { color: '#fff' }]}>{LABEL[t]}</Text>
              {n > 0 && (
                <Animated.View entering={ZoomIn.springify()} exiting={ZoomOut} style={s.badge}>
                  <Text style={s.badgeText}>{n > 9 ? '9+' : n}</Text>
                </Animated.View>
              )}
            </Pressable>
          )
        })}
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  bar: { flexDirection: 'row', backgroundColor: 'rgba(24,26,32,0.96)', borderRadius: 26, padding: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', elevation: 18, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  pill: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, gap: 2 },
  label: { color: C.text3, fontSize: 11, fontWeight: '700' },
  badge: { position: 'absolute', top: 2, right: '24%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
})
