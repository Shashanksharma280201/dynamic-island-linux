import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { C } from './theme'

export type TabId = 'island' | 'files' | 'activity' | 'settings'
export const TABS: TabId[] = ['island', 'files', 'activity', 'settings']
const LABEL: Record<TabId, string> = { island: 'Island', files: 'Files', activity: 'Activity', settings: 'Settings' }

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
      {id === 'activity' && <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0" {...p} />}
      {id === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...p} />
          <Path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" {...p} />
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
  return (
    <View style={[s.wrap, { bottom: Math.max(12, bottom) }]}>
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
    </View>
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
