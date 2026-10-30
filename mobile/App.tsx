import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { DropLink, findComputer } from './src/link'
import { forgetPairing, loadPairing, savePairing } from './src/pairing'
import { parsePairingLink, type Pairing } from './src/protocol'
import { HomeScreen } from './src/ui/HomeScreen'
import { PairScreen } from './src/ui/PairScreen'
import { C } from './src/ui/theme'

export default function App() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined)

  // The saved pairing, and pairing links opened from elsewhere (islanddrop://pair?…).
  useEffect(() => {
    void loadPairing().then(setPairing)
    const take = async (url: string | null | undefined) => {
      const p = url ? parsePairingLink(url) : null
      if (!p) return
      const r = await findComputer(p)
      if ('error' in r) return
      const found = { ...p, name: r.name || p.name, urls: [r.url, ...p.urls.filter((u) => u !== r.url)] }
      await savePairing(found)
      setPairing(found)
    }
    void Linking.getInitialURL().then(take)
    const sub = Linking.addEventListener('url', (e) => void take(e.url))
    return () => sub.remove()
  }, [])

  const link = useMemo(() => (pairing ? new DropLink(pairing) : null), [pairing])

  if (pairing === undefined)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    )
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      {pairing && link ? (
        <HomeScreen
          link={link}
          onUnpair={async () => {
            await forgetPairing()
            setPairing(null)
          }}
        />
      ) : (
        <PairScreen
          onPaired={async (p) => {
            await savePairing(p)
            setPairing(p)
          }}
        />
      )}
    </View>
  )
}
