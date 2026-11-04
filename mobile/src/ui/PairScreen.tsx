import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
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
  eyebrow: { color: C.text3, fontSize: 15, fontWeight: '600' },
  h1: { color: C.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.8 },
  p: { color: C.text2, fontSize: 15.5, marginTop: 8, marginBottom: 20, lineHeight: 22 },
  steps: { gap: 12, marginTop: 20, marginBottom: 22 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numText: { color: C.accent, fontSize: 13, fontWeight: '700' },
  stepText: { color: C.text, fontSize: 15, lineHeight: 21, flex: 1 },
  label: { color: C.text2, fontSize: 13, fontWeight: '600', marginTop: 28, marginBottom: 8, marginLeft: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line },
  input: { flex: 1, color: C.text, paddingVertical: 13, fontSize: 15 },
  error: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 18, backgroundColor: C.dark ? 'rgba(255,69,58,0.1)' : 'rgba(229,52,43,0.07)', borderRadius: 14, padding: 12 },
  errorText: { color: C.text, fontSize: 14, lineHeight: 19, flex: 1 },
  scanHint: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  scanHintText: { color: '#fff', fontSize: 15, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
  frame: { position: 'absolute', alignSelf: 'center', top: '30%', width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  cancelScan: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
}))
