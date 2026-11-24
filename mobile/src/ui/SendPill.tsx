import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { themed, useTheme } from './theme'
import { Icon } from './icons'

export type Sending = { key: string; name: string; p: number; phase: 'sending' | 'sent' | 'failed'; message?: string }

/** How a send is going, at the bottom of the screen: progress, then sent (or why not). */
export function SendPill({ sending, to, onDismiss }: { sending: Sending; to: string; onDismiss: () => void }) {
  const C = useTheme()
  const s = useS()
  return (
    <Pressable style={s.bar} onPress={() => sending.phase !== 'sending' && onDismiss()}>
      <View style={s.pill}>
        <View style={[s.mark, { backgroundColor: sending.phase === 'failed' ? C.red : sending.phase === 'sent' ? C.accent : C.card2 }]}>
          {sending.phase === 'sending' ? <ActivityIndicator size="small" color={C.text} /> : <Icon name={sending.phase === 'sent' ? 'check' : 'alert'} size={16} color={sending.phase === 'sent' ? C.onPrimary : '#fff'} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {sending.phase === 'sending' ? `Sending ${sending.name}` : sending.phase === 'sent' ? `Sent to ${to}` : 'Didn’t send'}
          </Text>
          {sending.phase === 'sending' ? (
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.round(Math.max(0.03, sending.p) * 100)}%` }]} />
            </View>
          ) : (
            <Text style={s.sub} numberOfLines={2}>
              {sending.phase === 'sent' ? sending.name : sending.message}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const useS = themed((C) => ({
  // Above the tab bar.
  bar: { position: 'absolute', left: 20, right: 20, bottom: 88 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bar, borderRadius: 30, paddingVertical: 10, paddingLeft: 10, paddingRight: 20, boxShadow: C.dark ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(30,20,10,0.14)' },
  mark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 15, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 13, marginTop: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: C.accentPale, marginTop: 7, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: C.accent },
}))
