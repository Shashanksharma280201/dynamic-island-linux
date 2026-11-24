import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Text, TextInput } from './Text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { LinkFigure } from '../iso/LinkFigure'
import { findComputer } from '../link'
import { mergeUrls, parsePairingLink, type Pairing } from '../protocol'
import { Icon } from './icons'
import { Btn } from './kit'
import { themed, useTheme } from './theme'

const STEPS = ['On your computer, open Dynamic Island → Settings → Phone Drop and turn it on.', 'Show the QR code there.', 'Scan it here. Same Wi-Fi, or Tailscale on both.']

/**
 * Pair with your computer: scan the QR in Dynamic Island → Settings → Phone
 * Drop (or paste its link). The computer is looked for before it's saved.
 */
export function PairScreen({ onPaired }: { onPaired: (p: Pairing) => void }) {
  const C = useTheme()
  const s = useS()
  const insets = useSafeAreaInsets()
  const [perm, requestPerm] = useCameraPermissions()
  const [scanning, setScanning] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tryPair = async (p: Pairing | null) => {
    if (!p) return setError('That isn’t an Island Drop pairing link.')
    setBusy(true)
    setError(null)
    const r = await findComputer(p)
    setBusy(false)
    if ('error' in r) setError(r.error)
    else onPaired({ ...p, name: r.name || p.name, urls: mergeUrls([r.url, ...r.urls], p.urls) })
  }

  if (scanning)
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (!data.startsWith('islanddrop://pair?')) return
            setScanning(false)
            void tryPair(parsePairingLink(data))
          }}
        />
        <View style={[s.scanHint, { top: insets.top + 24 }]}>
          <Text style={s.scanHintText}>Point at the QR code on your computer</Text>
        </View>
        <View style={s.frame} pointerEvents="none" />
        <Pressable style={[s.cancelScan, { bottom: insets.bottom + 32 }]} onPress={() => setScanning(false)} accessibilityRole="button">
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    )

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>Welcome to</Text>
      <Text style={s.h1}>Island Drop</Text>
      <Text style={s.p}>Your computer’s Dynamic Island on your phone: send files both ways, answer Claude Code, and keep up with everything on it.</Text>

      <LinkFigure mode={busy ? 'searching' : 'offline'} title="Not paired yet" readout={busy ? 'Looking for it…' : 'Waiting for a QR'} hint="Scan to connect" />

      <View style={s.steps}>
        {STEPS.map((t, i) => (
          <View key={i} style={s.step}>
            <View style={s.num}>
              <Text style={s.numText}>{i + 1}</Text>
            </View>
            <Text style={s.stepText}>{t}</Text>
          </View>
        ))}
      </View>

      <Btn
        kind="accent"
        icon="qr"
        label="Scan the QR code"
        busy={busy}
        onPress={async () => {
          if (!perm?.granted && !(await requestPerm()).granted) return setError('Camera permission is needed to scan. You can paste the link instead.')
          setScanning(true)
        }}
      />

      <Text style={s.label}>Or paste the pairing link</Text>
      <View style={s.field}>
        <Icon name="link" size={18} color={C.text3} />
        <TextInput style={s.input} value={link} onChangeText={setLink} placeholder="islanddrop://pair?…" placeholderTextColor={C.text3} autoCapitalize="none" autoCorrect={false} />
      </View>
      <Btn label="Pair" disabled={busy || !link.trim()} onPress={() => void tryPair(parsePairingLink(link))} style={{ marginTop: 10 }} />

      {busy && <ActivityIndicator style={{ marginTop: 18 }} color={C.text2} />}
      {!!error && (
        <View style={s.error}>
          <Icon name="info" size={18} color={C.red} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}
    </ScrollView>
  )
}

const useS = themed((C) => ({
  wrap: { flex: 1, backgroundColor: C.bg },
  eyebrow: { color: C.text2, fontSize: 16 },
  h1: { color: C.text, fontSize: 44, lineHeight: 50, fontWeight: '500', letterSpacing: -1.8 },
  p: { color: C.text2, fontSize: 15.5, marginTop: 8, marginBottom: 22, lineHeight: 22 },
  steps: { gap: 14, marginTop: 24, marginBottom: 24 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...C.shadow },
  numText: { color: C.text, fontSize: 14, fontWeight: '500' },
  stepText: { color: C.text, fontSize: 15.5, lineHeight: 22, flex: 1, marginTop: 4 },
  label: { color: C.text2, fontSize: 14, marginTop: 30, marginBottom: 10, marginLeft: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 20, minHeight: 52, ...C.shadow },
  input: { flex: 1, color: C.text, paddingVertical: 13, fontSize: 15.5 },
  error: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 18, backgroundColor: C.dark ? 'rgba(255,107,94,0.12)' : 'rgba(229,72,77,0.08)', borderRadius: 20, padding: 16 },
  errorText: { color: C.text, fontSize: 14, lineHeight: 20, flex: 1 },
  // Over the camera: white pills, whatever the theme.
  scanHint: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  scanHintText: { color: '#1d1d1d', fontSize: 15, backgroundColor: '#ffffff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, overflow: 'hidden' },
  frame: { position: 'absolute', alignSelf: 'center', top: '30%', width: 240, height: 240, borderRadius: 32, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  cancelScan: { position: 'absolute', alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: 26, height: 50, justifyContent: 'center' },
  cancelText: { color: '#1d1d1d', fontSize: 16, fontWeight: '500' },
}))
