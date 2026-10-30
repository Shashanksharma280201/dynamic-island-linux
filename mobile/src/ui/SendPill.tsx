import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { C } from './theme'

export type Sending = { key: string; name: string; p: number; phase: 'sending' | 'sent' | 'failed'; message?: string }

/** How a send is going, at the bottom of the screen: progress, then sent (or why not). */
export function SendPill({ sending, to, onDismiss }: { sending: Sending; to: string; onDismiss: () => void }) {
  return (
    <Pressable style={s.bar} onPress={() => sending.phase !== 'sending' && onDismiss()}>
      <View style={s.pill}>
        <View style={[s.mark, { backgroundColor: sending.phase === 'failed' ? C.red : sending.phase === 'sent' ? C.green : 'rgba(255,255,255,0.14)' }]}>
          {sending.phase === 'sending' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.markText}>{sending.phase === 'sent' ? '✓' : '!'}</Text>}
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

const s = StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, bottom: 34 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(30,33,40,0.97)', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: C.line },
  mark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  title: { color: C.text, fontSize: 14, fontWeight: '700' },
  sub: { color: C.text2, fontSize: 12, marginTop: 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 7, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#fff' },
})
