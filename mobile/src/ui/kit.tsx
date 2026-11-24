import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Keyboard, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch as RNSwitch, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { Text, TextInput } from './Text'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import type { PhoneCall, PhoneTopic } from '../../../shared/phone'
import type { DropLink } from '../link'
import { Icon, IconTile, type IconName } from './icons'
import { PRESSED, glide } from './motion'
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

/** The page's side margin and the space between its cards. */
export const SIDE = 20
export const GAP = 10

// ---- Words ----

export { ago } from '../words'

export const toneColor = (C: Palette, t?: string) => (t === 'up' ? C.green : t === 'down' ? C.red : t === 'warn' ? C.orange : C.text)

// ---- Pieces ----

/**
 * A screen: its title, then its content, scrolled. One you opened from
 * another has a round button back and its title in the middle; a tab's own
 * has its title large on the left.
 */
export function Page({ title, sub, onBack, right, top, children, onRefresh, scroll = true, pad = true }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode; top: number; children: ReactNode; onRefresh?: () => Promise<unknown>; scroll?: boolean; pad?: boolean }) {
  const s = useKit()
  const C = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const head = onBack ? (
    <View style={[s.head, { paddingTop: top }]}>
      <RoundBtn icon="back" label="Back" onPress={onBack} />
      <View style={s.headMid}>
        <Text style={s.h2} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.headSub} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {right ?? <View style={{ width: 46 }} />}
    </View>
  ) : (
    <View style={[s.head, { paddingTop: top + 4 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.h1} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={[s.headSub, { marginTop: 3 }]} numberOfLines={1}>
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
        contentContainerStyle={[pad && { padding: SIDE, paddingTop: 6, gap: GAP }, { paddingBottom: 130 }]}
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

/** A round button with one line icon: white on the page, or quiet inside a card. */
export function RoundBtn({ icon, label, onPress, size = 46, quiet }: { icon: IconName; label: string; onPress: () => void; size?: number; quiet?: boolean }) {
  const s = useKit()
  return (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [s.round, { width: size, height: size, borderRadius: size / 2 }, quiet ? s.roundQuiet : s.roundLift, pressed && PRESSED]}
    >
      <Icon name={icon} size={Math.round(size * 0.44)} />
    </Pressable>
  )
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const s = useKit()
  const body = (
    <View style={[s.card, style]}>{children}</View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && PRESSED}>
      {body}
    </Pressable>
  )
}

/** What a card is about, in a quiet word at its top. */
export function Kicker({ children }: { children: ReactNode }) {
  const s = useKit()
  return <Text style={s.kicker}>{children}</Text>
}

/** A part of a screen, named in plain words on the page. */
export function Heading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const s = useKit()
  return (
    <View style={s.headingRow}>
      <Text style={s.heading} numberOfLines={1}>
        {children}
      </Text>
      {right}
    </View>
  )
}

/**
 * The one big number of a screen, with a plain word under it (and, when it
 * helps, a line of explanation). `word`: it's a word, not a number, a size
 * smaller.
 */
export function Hero({ value, label, hint, word }: { value: string; label: string; hint?: string; word?: boolean }) {
  const s = useKit()
  return (
    <View style={s.hero} accessible accessibilityLabel={`${value}, ${label}`}>
      <Text style={word ? s.heroWord : s.heroValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.heroLabel}>{label}</Text>
      {!!hint && <Text style={s.heroHint}>{hint}</Text>}
    </View>
  )
}

/** A small dot and a word or two: how something is. */
export function StatusDot({ color, text, hollow }: { color: string; text: string; hollow?: boolean }) {
  const s = useKit()
  return (
    <View style={s.statusRow}>
      <View style={[s.statusDot, hollow ? { borderWidth: 1.5, borderColor: color } : { backgroundColor: color }]} />
      <Text style={s.statusText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  )
}

/** A small square card: a picture, what it is, and how it is. */
export function Tile({ top, label, value, onPress }: { top: ReactNode; label: string; value: string; onPress?: () => void }) {
  const s = useKit()
  const body = (
    <>
      <View style={s.tileTop}>{top}</View>
      <Text style={s.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={s.tileValue} numberOfLines={1}>
        {value}
      </Text>
    </>
  )
  if (!onPress) return <View style={s.tile}>{body}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [s.tile, pressed && PRESSED]}
    >
      {body}
    </Pressable>
  )
}

/**
 * A level from 0 to 100, drawn as columns of small squares filling from the
 * left: a full column for each tenth, the one it's part way through in the
 * lighter step, the rest pale. As wide as it's given: with room for it,
 * twice the columns, a twentieth each.
 */
export function DotGauge({ pct, rows = 4 }: { pct: number; rows?: number }) {
  const C = useTheme()
  const [w, setW] = useState(0)
  const gap = 4
  const cols = w > 240 ? 20 : 10
  const cell = w ? Math.max(4, Math.min(14, Math.floor((w - (cols - 1) * gap) / cols))) : 0
  const level = (Math.min(100, Math.max(0, pct)) / 100) * cols
  const full = Math.floor(level)
  const part = Math.round((level - full) * rows)
  const cells: { x: number; y: number; fill: string }[] = []
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      // Rows count from the bottom.
      const lit = c < full ? C.accent : c === full && r < part ? C.accentMid : C.accentPale
      cells.push({ x: c * (cell + gap), y: (rows - 1 - r) * (cell + gap), fill: lit })
    }
  const h = rows * cell + (rows - 1) * gap
  return (
    <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={{ height: cell ? h : rows * 10 + (rows - 1) * gap }} accessibilityRole="image" accessibilityLabel={`${Math.round(pct)} percent`}>
      {cell > 0 && (
        <Svg width={cols * cell + (cols - 1) * gap} height={h}>
          {cells.map((d, i) => (
            <Rect key={i} x={d.x} y={d.y} width={cell} height={cell} rx={cell * 0.28} fill={d.fill} />
          ))}
        </Svg>
      )}
    </View>
  )
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
/** A row of a list. `full`: it explains something, or carries your own words, so nothing is cut (the title on up to two lines, all of the line under it). */
export function Row({ title, sub, right, left, icon, chevron, onPress, onLongPress, bold, last, danger, full }: { title: string; sub?: string; right?: ReactNode; left?: ReactNode; icon?: { name: IconName; color: string }; chevron?: boolean; onPress?: () => void; onLongPress?: () => void; bold?: boolean; last?: boolean; danger?: boolean; full?: boolean }) {
  const s = useKit()
  const C = useTheme()
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => [s.row, !last && s.rowLine, pressed && { opacity: 0.6 }]}>
      {icon ? <IconTile name={icon.name} color={icon.color} /> : left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, bold && { fontWeight: '700' }, danger && { color: C.red }]} numberOfLines={full ? 2 : 1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.rowSub} numberOfLines={full ? undefined : 2}>
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
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: size * 0.42 }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  )
}

export function Badge({ n, color }: { n: number; color?: string }) {
  const s = useKit()
  const C = useTheme()
  if (!n) return null
  return (
    <View style={[s.badge, { backgroundColor: color ?? C.accent }]}>
      <Text style={[s.badgeText, !color && { color: C.onPrimary }]}>{n > 99 ? '99+' : n}</Text>
    </View>
  )
}

/** A few choices as plain words side by side, the chosen one on a pill that moves to it. */
export function Segmented<T extends string>({ items, value, onChange, style }: { items: [T, string][]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const s = useKit()
  // Where each word sits, as laid out.
  const [at, setAt] = useState<Record<number, { x: number; w: number }>>({})
  const i = Math.max(0, items.findIndex(([v]) => v === value))
  const x = useSharedValue(0)
  const w = useSharedValue(0)
  const placed = useRef(false)
  const here = at[i]
  useEffect(() => {
    if (!here) return
    // Put there the first time, moved there after.
    x.value = placed.current ? glide(here.x) : here.x
    w.value = placed.current ? glide(here.w) : here.w
    placed.current = true
  }, [here?.x, here?.w]) // eslint-disable-line react-hooks/exhaustive-deps
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }))
  return (
    <View style={[s.seg, style]} accessibilityRole="tablist">
      {!!here && <Animated.View style={[s.segPill, pill]} />}
      {items.map(([v, label], n) => (
        <Pressable
          key={v}
          style={s.segItem}
          accessibilityRole="tab"
          accessibilityState={{ selected: v === value }}
          onLayout={(e) => {
            const l = e.nativeEvent.layout
            setAt((a) => (a[n]?.x === l.x && a[n]?.w === l.width ? a : { ...a, [n]: { x: l.x, w: l.width } }))
          }}
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

/** A button: a pill. The one thing to do is in the accent (`primary`); the rest are quiet. */
export function Btn({ label, onPress, kind = 'plain', busy, disabled, small, icon, style }: { label: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger' | 'accent'; busy?: boolean; disabled?: boolean; small?: boolean; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const s = useKit()
  const C = useTheme()
  const strong = kind === 'primary' || kind === 'accent'
  const bg = strong ? C.primary : kind === 'danger' ? (C.dark ? 'rgba(255,107,94,0.16)' : 'rgba(229,72,77,0.1)') : C.fill
  const fg = strong ? C.onPrimary : kind === 'danger' ? C.red : C.text
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg }, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.75 }, style]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.btnInner}>
          {icon && <Icon name={icon} size={small ? 15 : 18} color={fg} />}
          <Text style={[s.btnText, small && { fontSize: 13.5 }, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

export function Empty({ title, text, busy, icon }: { title: string; text?: string; busy?: boolean; icon?: IconName }) {
  const s = useKit()
  const C = useTheme()
  return (
    <View style={s.empty}>
      {busy && <ActivityIndicator color={C.text2} style={{ marginBottom: 10 }} />}
      {!busy && icon && (
        <View style={s.emptyIcon}>
          <Icon name={icon} size={24} color={C.text2} />
        </View>
      )}
      <Text style={s.emptyTitle}>{title}</Text>
      {!!text && <Text style={s.emptyText}>{text}</Text>}
    </View>
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
      trackColor={{ false: C.dark ? '#3b3835' : '#dcdcdc', true: C.accent }}
      thumbColor="#ffffff"
      ios_backgroundColor={C.dark ? '#3b3835' : '#dcdcdc'}
    />
  )
}

/** On the web a box of several lines starts two lines tall; on the phone it starts at one. */
const ONE_LINE = Platform.OS === 'web' ? { rows: 1 } : null

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
      <TextInput style={s.input} placeholder={placeholder} placeholderTextColor={C.text3} value={text} onChangeText={setText} multiline maxLength={8000} {...ONE_LINE} />
      <Pressable disabled={!text.trim() || busy} onPress={() => void go()} style={({ pressed }) => [s.send, !text.trim() && !busy && s.sendOff, busy && { opacity: 0.6 }, pressed && PRESSED]}>
        {busy ? <ActivityIndicator color={C.onPrimary} /> : <Text style={[s.sendText, !text.trim() && { color: C.text3 }]}>{send}</Text>}
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SIDE, paddingBottom: 12 },
  headMid: { flex: 1, alignItems: 'center', minWidth: 0 },
  h1: { color: C.text, fontSize: 32, fontWeight: '500', letterSpacing: -1 },
  h2: { color: C.text, fontSize: 19, fontWeight: '500', letterSpacing: -0.3 },
  headSub: { color: C.text2, fontSize: 13.5, marginTop: 1 },
  round: { alignItems: 'center', justifyContent: 'center' },
  roundLift: { backgroundColor: C.card, ...C.shadow },
  roundQuiet: { backgroundColor: C.fill },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 20, ...C.shadow },
  kicker: { color: C.text2, fontSize: 14, marginBottom: 8 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, marginBottom: 2, paddingHorizontal: 4 },
  heading: { color: C.text, fontSize: 20, fontWeight: '500', letterSpacing: -0.3, flexShrink: 1 },
  hero: { alignItems: 'center', paddingTop: 2, paddingBottom: 8 },
  heroValue: { color: C.text, fontSize: 96, lineHeight: 100, fontWeight: '500', letterSpacing: -4.3, textAlign: 'center' },
  heroWord: { color: C.text, fontSize: 46, lineHeight: 56, fontWeight: '500', letterSpacing: -1.6, textAlign: 'center', marginTop: 18, marginBottom: 6 },
  heroLabel: { color: C.text, fontSize: 20, letterSpacing: -0.2, textAlign: 'center' },
  heroHint: { color: C.text2, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 310 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: C.text2, fontSize: 12.5, flexShrink: 1 },
  tile: { flex: 1, minWidth: 0, height: 132, backgroundColor: C.card, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, ...C.shadow },
  tileTop: { height: 46, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: C.text2, fontSize: 15, marginTop: 6 },
  tileValue: { color: C.text, fontSize: 18, fontWeight: '500', letterSpacing: -0.3, marginTop: 2 },
  section: { color: C.text2, fontSize: 14, marginLeft: 6, marginBottom: 8, marginTop: 8 },
  sectionNote: { color: C.text3, fontSize: 12.5, lineHeight: 17, marginHorizontal: 6, marginTop: 8 },
  group: { backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 4, overflow: 'hidden', ...C.shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowTitle: { color: C.text, fontSize: 15.5, fontWeight: '500' },
  rowSub: { color: C.text2, fontSize: 13, marginTop: 2, lineHeight: 18 },
  rowRight: { color: C.text2, fontSize: 14, fontVariant: ['tabular-nums'] },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  seg: { flexDirection: 'row', alignSelf: 'center', justifyContent: 'center', maxWidth: '100%' },
  segPill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 20, backgroundColor: C.card, ...C.shadow },
  segItem: { height: 40, paddingHorizontal: 17, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  segText: { color: C.text2, fontSize: 16 },
  segOn: { color: C.text },
  btn: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 15, minHeight: 36 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  btnText: { fontSize: 15.5, fontWeight: '500' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '500', letterSpacing: -0.2, textAlign: 'center' },
  emptyText: { color: C.text2, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  error: { color: C.red, fontSize: 13, lineHeight: 18 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 6, backgroundColor: C.card, borderRadius: 27, ...C.shadow },
  input: { flex: 1, color: C.text, fontSize: 15.5, maxHeight: 140, paddingHorizontal: 14, paddingVertical: 10 },
  send: { backgroundColor: C.primary, borderRadius: 21, paddingHorizontal: 18, height: 42, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: C.fill },
  sendText: { color: C.onPrimary, fontWeight: '500', fontSize: 15 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  track: { height: 34, borderRadius: 17, backgroundColor: C.fill, overflow: 'hidden' },
  fill: { height: 34 },
}))
