import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Path } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import type { PhoneCall, PhoneTopic } from '../../../shared/phone'
import type { DropLink } from '../link'
import { C } from './theme'

// ---- Data from the island ----

/**
 * A value from the island, by one of its calls, kept up to date: reloaded when
 * its topic is pushed (or taken from the push itself, `fromPush`), every
 * `poll` ms if given, and on demand.
 */
export function useCall<T>(link: DropLink, fn: PhoneCall, args: unknown[] = [], o: { topic?: PhoneTopic; fromPush?: boolean; poll?: number; when?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify([fn, args])
  const seq = useRef(0)
  const load = useCallback(async () => {
    const n = ++seq.current
    const r = await link.call<T>(fn, ...args)
    if (n !== seq.current) return
    if (r.ok) {
      setData(r.value)
      setError('')
    } else setError(r.message)
    setLoading(false)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (o.when === false) return
    setLoading(true)
    void load()
    const offs: (() => void)[] = []
    let soon: ReturnType<typeof setTimeout> | null = null
    if (o.topic)
      offs.push(
        link.onPush(o.topic, (d) => {
          if (o.fromPush && d && typeof d === 'object') {
            seq.current++
            setData(d as T)
            return
          }
          // Changes come in bursts: one look after them.
          if (soon) clearTimeout(soon)
          soon = setTimeout(() => void load(), 250)
        }),
      )
    if (o.poll) {
      const t = setInterval(() => void load(), o.poll)
      offs.push(() => clearInterval(t))
    }
    return () => {
      if (soon) clearTimeout(soon)
      for (const off of offs) off()
    }
  }, [key, o.when]) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: load, setData }
}

/** Run a call from a button: busy while it runs, its error if it failed. */
export function useAction(link: DropLink) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = async <T,>(key: string, fn: PhoneCall, ...args: unknown[]): Promise<T | null> => {
    setBusy(key)
    setError('')
    const r = await link.call<T>(fn, ...args)
    setBusy('')
    if (!r.ok) {
      setError(r.message)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return null
    }
    return r.value
  }
  return { busy, error, setError, run }
}

/** Whether the keyboard is up (the tab bar steps aside, boxes sit right on it). */
export function useKeyboard(): boolean {
  const [up, setUp] = useState(false)
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setUp(true))
    const b = Keyboard.addListener('keyboardDidHide', () => setUp(false))
    return () => {
      a.remove()
      b.remove()
    }
  }, [])
  return up
}

/** Room the floating tab bar takes at the bottom (above the safe area). */
export const TAB_ROOM = 78

// ---- Words ----

/** "now", "5m", "3h", "Tue", "12 Oct". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const d = new Date(at)
  if (s < 6 * 86400) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export const toneColor = (t?: string) => (t === 'up' ? C.green : t === 'down' ? C.red : t === 'warn' ? C.orange : C.text)

// ---- Pieces ----

/** A screen: title (with a way back), then its content, scrolled. */
export function Page({ title, sub, onBack, right, top, children, onRefresh, scroll = true, pad = true }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode; top: number; children: ReactNode; onRefresh?: () => Promise<unknown>; scroll?: boolean; pad?: boolean }) {
  const [refreshing, setRefreshing] = useState(false)
  const head = (
    <View style={[s.head, { paddingTop: top + 4 }]}>
      {onBack && (
        <Pressable hitSlop={12} onPress={onBack} style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={onBack ? s.h2 : s.h1} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.headSub} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {right}
    </View>
  )
  if (!scroll)
    return (
      <View style={{ flex: 1 }}>
        {head}
        {children}
      </View>
    )
  return (
    <View style={{ flex: 1 }}>
      {head}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[pad && { padding: 16, paddingTop: 6, gap: 12 }, { paddingBottom: 130 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              tintColor="#fff"
              onRefresh={async () => {
                setRefreshing(true)
                await onRefresh()
                setRefreshing(false)
              }}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  )
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = (
    <Animated.View entering={FadeInDown.springify().damping(18)} layout={LinearTransition.springify().damping(20)} style={[s.card, style]}>
      {children}
    </Animated.View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { transform: [{ scale: 0.985 }], opacity: 0.92 }}>
      {body}
    </Pressable>
  )
}

export const Kicker = ({ children }: { children: ReactNode }) => <Text style={s.kicker}>{children}</Text>

/** A line in a list: a dot or picture, what it is, a detail, and something on the right. */
export function Row({ title, sub, right, left, onPress, onLongPress, bold, last }: { title: string; sub?: string; right?: ReactNode; left?: ReactNode; onPress?: () => void; onLongPress?: () => void; bold?: boolean; last?: boolean }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => [s.row, !last && s.rowLine, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, bold && { fontWeight: '800' }]} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
      {typeof right === 'string' ? <Text style={s.rowRight}>{right}</Text> : right}
    </Pressable>
  )
}

/** A round picture, or the first letter on a colour. */
export function Avatar({ name, uri, size = 40, color }: { name: string; uri?: string; size?: number; color?: string }) {
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
  if (uri) return <Animated.Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.card2 }} />
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? `hsl(${hue},45%,38%)`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  )
}

export function Badge({ n, color = C.red }: { n: number; color?: string }) {
  if (!n) return null
  return (
    <View style={[s.badge, { backgroundColor: color }]}>
      <Text style={s.badgeText}>{n > 99 ? '99+' : n}</Text>
    </View>
  )
}

/** A few choices side by side, the chosen one on a sliding white pill. */
export function Segmented<T extends string>({ items, value, onChange, style }: { items: [T, string][]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const [w, setW] = useState(0)
  const i = Math.max(0, items.findIndex(([v]) => v === value))
  const x = useSharedValue(0)
  useEffect(() => {
    x.value = withSpring(i * (w / items.length), { damping: 20, stiffness: 240 })
  }, [i, w, items.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  return (
    <View style={[s.seg, style]} onLayout={(e) => setW(e.nativeEvent.layout.width - 6)}>
      {w > 0 && <Animated.View style={[s.segPill, { width: w / items.length }, pill]} />}
      {items.map(([v, label]) => (
        <Pressable
          key={v}
          style={s.segItem}
          onPress={() => {
            if (v !== value) void Haptics.selectionAsync()
            onChange(v)
          }}
        >
          <Text style={[s.segText, v === value && { color: '#000' }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export function Btn({ label, onPress, kind = 'plain', busy, disabled, small, style }: { label: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger' | 'accent'; busy?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const bg = kind === 'primary' ? '#fff' : kind === 'danger' ? 'rgba(255,69,58,0.16)' : kind === 'accent' ? C.blue : 'rgba(255,255,255,0.1)'
  const fg = kind === 'primary' ? '#000' : kind === 'danger' ? C.red : '#fff'
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg }, (disabled || busy) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.97 }] }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>}
    </Pressable>
  )
}

export function Empty({ title, text, busy }: { title: string; text?: string; busy?: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.empty}>
      {busy && <ActivityIndicator color={C.text2} style={{ marginBottom: 10 }} />}
      <Text style={s.emptyTitle}>{title}</Text>
      {!!text && <Text style={s.emptyText}>{text}</Text>}
    </Animated.View>
  )
}

export const ErrorLine = ({ message }: { message: string }) => (message ? <Text style={s.error}>{message}</Text> : null)

/** Write something and send it: a reply, a message, a prompt. */
export function Composer({ placeholder, onSend, busy, initial = '', send = 'Send', bottom = 0 }: { placeholder: string; onSend: (text: string) => Promise<boolean | void> | void; busy?: boolean; initial?: string; send?: string; bottom?: number }) {
  const [text, setText] = useState(initial)
  const go = async () => {
    const t = text.trim()
    if (!t || busy) return
    const ok = await onSend(t)
    if (ok !== false) setText('')
  }
  return (
    <View style={[s.composer, { marginBottom: bottom }]}>
      <TextInput style={s.input} placeholder={placeholder} placeholderTextColor={C.text3} value={text} onChangeText={setText} multiline maxLength={8000} />
      <Pressable disabled={!text.trim() || busy} onPress={() => void go()} style={({ pressed }) => [s.send, (!text.trim() || busy) && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}>
        {busy ? <ActivityIndicator color="#000" /> : <Text style={s.sendText}>{send}</Text>}
      </Pressable>
    </View>
  )
}

/** A level from 0 to 100, dragged or tapped; `onChange` when let go (and now and then while dragging). */
export function Slider({ value, onChange, label, color = '#fff' }: { value: number; onChange: (v: number) => void; label: string; color?: string }) {
  const [w, setW] = useState(0)
  const v = useSharedValue(value / 100)
  const held = useSharedValue(false)
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (!held.value) v.value = withTiming(value / 100, { duration: 200 })
    setShown(value)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const last = useRef(0)
  const tell = (x: number, done: boolean) => {
    const n = Math.round(x * 100)
    setShown(n)
    const now = Date.now()
    if (done || now - last.current > 180) {
      last.current = now
      onChange(n)
    }
  }
  const pan = usePanGesture({
    minDistance: 0,
    onActivate: (e) => {
      'worklet'
      held.value = true
      v.value = Math.min(1, Math.max(0, e.x / Math.max(1, w)))
      scheduleOnRN(tell, v.value, false)
    },
    onUpdate: (e) => {
      'worklet'
      v.value = Math.min(1, Math.max(0, e.x / Math.max(1, w)))
      scheduleOnRN(tell, v.value, false)
    },
    onDeactivate: () => {
      'worklet'
      held.value = false
      scheduleOnRN(tell, v.value, true)
    },
  })
  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }))
  return (
    <View>
      <View style={s.sliderHead}>
        <Text style={s.rowTitle}>{label}</Text>
        <Text style={s.rowRight}>{shown}%</Text>
      </View>
      <GestureDetector gesture={pan}>
        <View style={s.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          <Animated.View style={[s.fill, { backgroundColor: color }, fill]} />
        </View>
      </GestureDetector>
    </View>
  )
}

export const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  h1: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  headSub: { color: C.text2, fontSize: 13, marginTop: 1 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: C.line },
  kicker: { color: C.text3, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 2 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: C.text2, fontSize: 13, marginTop: 2, lineHeight: 18 },
  rowRight: { color: C.text3, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  seg: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 3 },
  segPill: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 9, backgroundColor: '#fff' },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segText: { color: C.text2, fontSize: 13, fontWeight: '700' },
  btn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12, minHeight: 34, borderRadius: 999 },
  btnText: { fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: C.text2, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  error: { color: C.red, fontSize: 13, lineHeight: 18 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 8, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line },
  input: { flex: 1, color: C.text, fontSize: 15, maxHeight: 140, paddingHorizontal: 10, paddingVertical: 8 },
  send: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, height: 36, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#000', fontWeight: '800', fontSize: 14 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  track: { height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: 34 },
})
