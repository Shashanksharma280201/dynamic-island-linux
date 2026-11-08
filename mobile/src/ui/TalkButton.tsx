import { useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio'
import type { DropLink } from '../link'
import { Icon } from './icons'
import { themed, useTheme } from './theme'

type Phase = 'idle' | 'listening' | 'sending'

/** Shorter than this is a tap, not something said. */
const MIN_MS = 500
/** The computer makes out up to a minute. */
const MAX_MS = 60_000

/**
 * Hold to talk to the buddy on your computer: the phone is its microphone.
 * What you say is recorded only while you hold, sent to your computer, and
 * made out there; the buddy answers out loud on the computer.
 */
export function TalkButton({ link }: { link: DropLink }) {
  const C = useTheme()
  const s = useS()
  const rec = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // When recording started (0: not recording).
  const started = useRef(0)
  const startedAt = useRef(0)
  // Still holding (you can let go while Android asks for the microphone).
  const holding = useRef(false)
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pulse = useSharedValue(1)
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  const begin = async () => {
    if (phase !== 'idle') return
    setError(null)
    setHeard(null)
    const p = await requestRecordingPermissionsAsync()
    if (!p.granted) return setError('Island Drop isn’t allowed to use the microphone. Allow it in Android’s settings for the app.')
    if (!holding.current) return setError('Hold the button while you talk.')
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await rec.prepareToRecordAsync()
      if (!holding.current) return setError('Hold the button while you talk.')
      rec.record()
    } catch (e: any) {
      return setError(String(e?.message ?? e))
    }
    started.current = Date.now()
    startedAt.current = started.current
    setPhase('listening')
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 500 }), withTiming(1, { duration: 500 })), -1)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    limit.current = setTimeout(() => void end(), MAX_MS)
  }

  const end = async () => {
    if (limit.current) clearTimeout(limit.current)
    limit.current = null
    pulse.value = withTiming(1)
    if (!started.current) return
    started.current = 0
    const held = Date.now() - startedAt.current
    let uri: string | null = null
    try {
      await rec.stop()
      uri = rec.uri
    } catch {
      uri = null
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {})
    if (!uri || held < MIN_MS) {
      setPhase('idle')
      return setError('Hold the button while you talk.')
    }
    setPhase('sending')
    void Haptics.selectionAsync()
    const r = await link.talk(uri)
    setPhase('idle')
    if (r.ok) setHeard(r.text)
    else setError(r.message)
  }

  const label = phase === 'listening' ? 'Listening… let go to send' : phase === 'sending' ? 'Making it out on your computer…' : 'Hold to talk to your buddy'
  return (
    <View style={s.wrap}>
      <Pressable
        onPressIn={() => {
          holding.current = true
          void begin()
        }}
        onPressOut={() => {
          holding.current = false
          if (started.current) void end()
        }} disabled={phase === 'sending'} accessibilityRole="button" accessibilityLabel="Hold to talk to your buddy">
        <Animated.View style={[s.button, { backgroundColor: phase === 'listening' ? C.red : C.primary }, phase === 'sending' && { opacity: 0.6 }, ring]}>
          <Icon name="mic" size={22} color={C.onPrimary} />
          <Text style={[s.label, { color: C.onPrimary }]}>{label}</Text>
        </Animated.View>
      </Pressable>
      {heard && (
        <Animated.View entering={FadeIn.duration(250)}>
          <Text style={s.heard}>
            <Text style={s.heardLabel}>You said: </Text>“{heard}”
          </Text>
          <Text style={s.hint}>The answer is out loud on your computer.</Text>
        </Animated.View>
      )}
      {error && <Text style={[s.hint, { color: C.red }]}>{error}</Text>}
    </View>
  )
}

const useS = themed((C) => ({
  wrap: { gap: 8 },
  button: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18 },
  label: { fontSize: 16, fontWeight: '700' as const },
  heard: { color: C.text, fontSize: 15, lineHeight: 21 },
  heardLabel: { color: C.text2, fontWeight: '600' as const },
  hint: { color: C.text3, fontSize: 13 },
}))
