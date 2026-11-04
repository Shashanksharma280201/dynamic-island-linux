import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Switch as RNSwitch, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import type { PhoneCall, PhoneTopic } from '../../../shared/phone'
import type { DropLink } from '../link'
import { Icon, IconTile, type IconName } from './icons'
import { themed, useTheme, type Palette } from './theme'

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

export { ago } from '../words'

export const toneColor = (C: Palette, t?: string) => (t === 'up' ? C.green : t === 'down' ? C.red : t === 'warn' ? C.orange : C.text)

// ---- Pieces ----

/** A screen: title (with a way back), then its content, scrolled. */
export function Page({ title, sub, onBack, right, top, children, onRefresh, scroll = true, pad = true }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode; top: number; children: ReactNode; onRefresh?: () => Promise<unknown>; scroll?: boolean; pad?: boolean }) {
  const s = useKit()
  const C = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const head = (
    <View style={[s.head, { paddingTop: top + 4 }]}>
      {onBack && (
        <Pressable hitSlop={12} onPress={onBack} style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="back" size={21} />
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
              tintColor={C.text2}
              colors={[C.accent]}
              progressBackgroundColor={C.card}
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
  const s = useKit()
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

export function Kicker({ children }: { children: ReactNode }) {
  const s = useKit()
  return <Text style={s.kicker}>{children}</Text>
}

/** A section's name above its card, as in a settings list. */
export function Section({ title, children, note }: { title?: string; children: ReactNode; note?: string }) {
  const s = useKit()
  return (
    <View>
      {!!title && <Text style={s.section}>{title}</Text>}
      <View style={s.group}>{children}</View>
      {!!note && <Text style={s.sectionNote}>{note}</Text>}
    </View>
  )
}

/** A line in a list: a dot or picture, what it is, a detail, and something on the right. */
export function Row({ title, sub, right, left, icon, chevron, onPress, onLongPress, bold, last, danger }: { title: string; sub?: string; right?: ReactNode; left?: ReactNode; icon?: { name: IconName; color: string }; chevron?: boolean; onPress?: () => void; onLongPress?: () => void; bold?: boolean; last?: boolean; danger?: boolean }) {
  const s = useKit()
  const C = useTheme()
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => [s.row, !last && s.rowLine, pressed && { backgroundColor: C.fillPressed }]}>
      {icon ? <IconTile name={icon.name} color={icon.color} /> : left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, bold && { fontWeight: '700' }, danger && { color: C.red }]} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
      {typeof right === 'string' ? <Text style={s.rowRight}>{right}</Text> : right}
      {chevron && <Icon name="chevron" size={16} color={C.text3} />}
    </Pressable>
  )
}

/** A round picture, or the first letter on a colour. */
export function Avatar({ name, uri, size = 40, color }: { name: string; uri?: string; size?: number; color?: string }) {
  const C = useTheme()
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
  if (uri) return <Animated.Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.card2 }} />
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? (C.dark ? `hsl(${hue},45%,38%)` : `hsl(${hue},55%,50%)`), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  )
}

export function Badge({ n, color }: { n: number; color?: string }) {
  const s = useKit()
  const C = useTheme()
  if (!n) return null
  return (
    <View style={[s.badge, { backgroundColor: color ?? C.red }]}>
      <Text style={s.badgeText}>{n > 99 ? '99+' : n}</Text>
    </View>
  )
}

/** A few choices side by side, the chosen one on a sliding pill. */
export function Segmented<T extends string>({ items, value, onChange, style }: { items: [T, string][]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const s = useKit()
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
          <Text style={[s.segText, v === value && s.segOn]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export function Btn({ label, onPress, kind = 'plain', busy, disabled, small, icon, style }: { label: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger' | 'accent'; busy?: boolean; disabled?: boolean; small?: boolean; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const s = useKit()
  const C = useTheme()
  const bg = kind === 'primary' ? C.primary : kind === 'danger' ? (C.dark ? 'rgba(255,69,58,0.16)' : 'rgba(229,52,43,0.1)') : kind === 'accent' ? C.accent : C.fill
  const fg = kind === 'primary' ? C.onPrimary : kind === 'danger' ? C.red : kind === 'accent' ? '#fff' : C.text
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg }, (disabled || busy) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.97 }] }, style]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.btnInner}>
          {icon && <Icon name={icon} size={small ? 15 : 18} color={fg} />}
          <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

export function Empty({ title, text, busy, icon }: { title: string; text?: string; busy?: boolean; icon?: IconName }) {
  const s = useKit()
  const C = useTheme()
  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.empty}>
      {busy && <ActivityIndicator color={C.text2} style={{ marginBottom: 10 }} />}
      {!busy && icon && (
        <View style={s.emptyIcon}>
          <Icon name={icon} size={26} color={C.text2} />
        </View>
      )}
      <Text style={s.emptyTitle}>{title}</Text>
      {!!text && <Text style={s.emptyText}>{text}</Text>}
    </Animated.View>
  )
}

export function ErrorLine({ message }: { message: string }) {
  const s = useKit()
  return message ? <Text style={s.error}>{message}</Text> : null
}

/** An on/off switch in the theme's colours. */
export function Switch({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const C = useTheme()
  return (
    <RNSwitch
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        void Haptics.selectionAsync()
        onChange(v)
      }}
      trackColor={{ false: C.dark ? '#3a3a3f' : '#d9d9de', true: C.green }}
      thumbColor="#ffffff"
      ios_backgroundColor={C.dark ? '#3a3a3f' : '#d9d9de'}
    />
  )
}

/** Write something and send it: a reply, a message, a prompt. */
export function Composer({ placeholder, onSend, busy, initial = '', send = 'Send', bottom = 0 }: { placeholder: string; onSend: (text: string) => Promise<boolean | void> | void; busy?: boolean; initial?: string; send?: string; bottom?: number }) {
  const s = useKit()
  const C = useTheme()
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
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.sendText}>{send}</Text>}
      </Pressable>
    </View>
  )
}

/** A level from 0 to 100, dragged or tapped; `onChange` when let go (and now and then while dragging). */
export function Slider({ value, onChange, label, color }: { value: number; onChange: (v: number) => void; label: string; color?: string }) {
  const s = useKit()
  const C = useTheme()
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
          <Animated.View style={[s.fill, { backgroundColor: color ?? C.accent }, fill]} />
        </View>
      </GestureDetector>
    </View>
  )
}

/** The shared pieces' styles (screens use some of them too: `const k = useKit()`). */
export const useKit = themed((C) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  h1: { color: C.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  h2: { color: C.text, fontSize: 21, fontWeight: '700', letterSpacing: -0.3 },
  headSub: { color: C.text2, fontSize: 13.5, marginTop: 2 },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: C.dark ? 1 : 0, borderColor: C.line, ...C.shadow },
  kicker: { color: C.text3, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  section: { color: C.text2, fontSize: 13, fontWeight: '600', marginLeft: 16, marginBottom: 7, marginTop: 6 },
  sectionNote: { color: C.text3, fontSize: 12.5, lineHeight: 17, marginHorizontal: 16, marginTop: 7 },
  group: { backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, borderWidth: C.dark ? 1 : 0, borderColor: C.line, overflow: 'hidden', ...C.shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 50 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowTitle: { color: C.text, fontSize: 15.5, fontWeight: '500' },
  rowSub: { color: C.text2, fontSize: 13, marginTop: 2, lineHeight: 18 },
  rowRight: { color: C.text2, fontSize: 14, fontVariant: ['tabular-nums'] },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  seg: { flexDirection: 'row', backgroundColor: C.fill, borderRadius: 11, padding: 3 },
  segPill: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 8, backgroundColor: C.dark ? '#3a3a40' : '#ffffff', ...(C.dark ? {} : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }) },
  segItem: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  segText: { color: C.text2, fontSize: 13, fontWeight: '600' },
  segOn: { color: C.text },
  btn: { borderRadius: 13, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 13, minHeight: 34, borderRadius: 999 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  btnText: { fontSize: 15.5, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyText: { color: C.text2, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  error: { color: C.red, fontSize: 13, lineHeight: 18 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 6, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, ...C.shadow },
  input: { flex: 1, color: C.text, fontSize: 15.5, maxHeight: 140, paddingHorizontal: 12, paddingVertical: 9 },
  send: { backgroundColor: C.accent, borderRadius: 17, paddingHorizontal: 15, height: 36, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  track: { height: 34, borderRadius: 11, backgroundColor: C.fill, overflow: 'hidden' },
  fill: { height: 34 },
}))
