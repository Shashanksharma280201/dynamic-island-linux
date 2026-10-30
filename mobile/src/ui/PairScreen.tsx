import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { findComputer } from '../link'
import { parsePairingLink, type Pairing } from '../protocol'
import { C } from './theme'

/**
 * Pair with your computer: scan the QR in Dynamic Island → Settings → Phone
 * Drop (or paste its link). The computer is looked for before it's saved.
 */
export function PairScreen({ onPaired }: { onPaired: (p: Pairing) => void }) {
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
    else onPaired({ ...p, name: r.name || p.name, urls: [r.url, ...p.urls.filter((u) => u !== r.url)] })
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
        <Pressable style={s.cancelScan} onPress={() => setScanning(false)}>
          <Text style={s.btnText}>Cancel</Text>
        </Pressable>
      </View>
    )

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 22, paddingTop: 72 }} keyboardShouldPersistTaps="handled">
      <View style={s.mark}>
        <View style={s.markGlow} />
        <View style={s.markDot} />
      </View>
      <Text style={s.h1}>Island Drop</Text>
      <Text style={s.p}>Flick photos and files from this phone to your computer. They come out of a glow at the edge of its screen and land in Dynamic Island.</Text>

      <Pressable
        style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
        onPress={async () => {
          if (!perm?.granted && !(await requestPerm()).granted) return setError('Camera permission is needed to scan. You can paste the link instead.')
          setScanning(true)
        }}
      >
        <Text style={[s.btnText, { color: '#000' }]}>Scan the QR</Text>
      </Pressable>
      <Text style={s.hint}>On your computer: Dynamic Island → Settings → Phone Drop → turn it on → Show QR. Both need the same Wi-Fi (or Tailscale on both).</Text>

      <Text style={s.label}>Or paste the pairing link</Text>
      <TextInput style={s.input} value={link} onChangeText={setLink} placeholder="islanddrop://pair?…" placeholderTextColor={C.text3} autoCapitalize="none" autoCorrect={false} />
      <Pressable style={s.secondary} disabled={busy} onPress={() => void tryPair(parsePairingLink(link))}>
        <Text style={s.btnText}>Pair</Text>
      </Pressable>

      {busy && <ActivityIndicator style={{ marginTop: 18 }} color="#fff" />}
      {!!error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  mark: { width: 64, height: 64, marginBottom: 18, justifyContent: 'center' },
  markGlow: { position: 'absolute', right: -6, width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', opacity: 0.18 },
  markDot: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  h1: { color: C.text, fontSize: 34, fontWeight: '800' },
  p: { color: C.text2, fontSize: 15, marginTop: 8, marginBottom: 26, lineHeight: 21 },
  primary: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  secondary: { backgroundColor: C.card2, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  btnText: { color: C.text, fontSize: 16, fontWeight: '700' },
  hint: { color: C.text3, fontSize: 12, marginTop: 8, lineHeight: 17 },
  label: { color: C.text2, fontSize: 13, fontWeight: '600', marginTop: 30, marginBottom: 8 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 8 },
  error: { color: C.red, marginTop: 16, fontSize: 14, lineHeight: 19 },
  cancelScan: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999 },
})
