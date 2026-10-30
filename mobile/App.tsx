import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, AppState, BackHandler, Linking, StyleSheet, View, useWindowDimensions } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { shareIntake, type SharedFile } from './modules/share-intake'
import { DropLink, findComputer, type Live, type LinkState } from './src/link'
import { followIsland, setupNotifications } from './src/notify'
import { forgetPairing, loadPairing, savePairing } from './src/pairing'
import { loadPrefs, savePrefs, type Prefs } from './src/prefs'
import { parsePairingLink, type Pairing } from './src/protocol'
import { keepReceived, loadReceived, type Received } from './src/received'
import type { InboxUnread } from '../shared/types'
import { ClaudeScreen } from './src/ui/ClaudeScreen'
import { FilesScreen } from './src/ui/FilesScreen'
import { InboxScreen } from './src/ui/InboxScreen'
import { IncomingLayer } from './src/ui/IncomingLayer'
import { IslandScreen } from './src/ui/IslandScreen'
import { useCall } from './src/ui/kit'
import { MoreScreen, type MoreId } from './src/ui/MoreScreen'
import { PairScreen } from './src/ui/PairScreen'
import { ShareScreen } from './src/ui/ShareScreen'
import { TABS, TabBar, type TabId } from './src/ui/TabBar'
import { C } from './src/ui/theme'

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function Root() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined)
  const [shared, setShared] = useState<SharedFile[] | null>(null)

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

  // Share -> Island Drop from another app: at launch, when it comes back, or while open.
  useEffect(() => {
    const check = () =>
      void shareIntake.take().then((f) => {
        if (f.length) setShared(f)
      })
    check()
    const off = shareIntake.onShare(check)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => {
      off()
      sub.remove()
    }
  }, [])

  const link = useMemo(() => (pairing ? new DropLink(pairing) : null), [pairing])

  if (pairing === undefined)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    )
  if (!pairing || !link)
    return (
      <PairScreen
        onPaired={async (p) => {
          await savePairing(p)
          setPairing(p)
        }}
      />
    )
  return (
    <Paired
      key={pairing.token}
      link={link}
      shared={shared}
      clearShared={() => setShared(null)}
      onUnpair={async () => {
        link.stopLive()
        await forgetPairing()
        setPairing(null)
      }}
    />
  )
}

function Paired({ link, shared, clearShared, onUnpair }: { link: DropLink; shared: SharedFile[] | null; clearShared: () => void; onUnpair: () => void }) {
  const insets = useSafeAreaInsets()
  const { width: W } = useWindowDimensions()
  const [tab, setTabState] = useState<TabId>('island')
  const [more, setMore] = useState<MoreId | null>(null)
  // A tab's screen is made the first time it's opened, then kept (its scroll, its drafts).
  const [seen, setSeen] = useState<Set<TabId>>(() => new Set(['island']))
  const setTab = (t: TabId) => {
    setTabState(t)
    if (!seen.has(t)) setSeen(new Set([...seen, t]))
  }
  const unread = useCall<InboxUnread>(link, 'inbox.unread', [], { topic: 'inbox' })
  // Back from another tab goes to the Island tab (screens opened inside a tab go back first).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // A screen open in More closes first (More's own listener).
      if (tab === 'island' || (tab === 'more' && more)) return false
      setTabState('island')
      return true
    })
    return () => sub.remove()
  }, [tab, more])
  const [live, setLive] = useState<Live>(link.live)
  const [state, setState] = useState<LinkState>(link.state)
  const [received, setReceived] = useState<Received[]>(() => loadReceived())
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs())
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => link.subscribeLive(setLive), [link])
  useEffect(() => link.subscribe(setState), [link])
  useEffect(() => {
    let stop = () => {}
    void link.find().then(() => link.startLive())
    void setupNotifications().then(() => {
      stop = followIsland(link, { computer: () => prefsRef.current.computerNotes, background: () => prefsRef.current.background })
    })
    // Back in the app: make sure the link is still there.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && link.live.phase !== 'live') void link.startLive()
    })
    return () => {
      stop()
      sub.remove()
      link.stopLive()
    }
  }, [link])

  const setPrefs = (p: Prefs) => {
    savePrefs(p)
    setPrefsState(p)
    prefsRef.current = p
    // Starts or stops the background link now, not at the next change.
    if (p.background !== prefs.background) void link.refresh()
  }

  const receivedRef = useRef(received)
  receivedRef.current = received
  const onReceived = (uri: string, f: { name: string; size: number }) => {
    void keepReceived(receivedRef.current, uri, f.name, f.size, link.pairing.name).then(setReceived)
  }

  const top = insets.top + 12
  const filesTabX = 12 + ((W - 24) / TABS.length) * (TABS.indexOf('files') + 0.5)
  const inboxBadge = (unread.data?.chats ?? 0) + (unread.data?.mail ?? 0)

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen on={tab === 'island'}>
        <IslandScreen
          link={link}
          live={live}
          top={top}
          onOpen={(id) => {
            setMore(id)
            setTab('more')
          }}
        />
      </Screen>
      {seen.has('claude') && (
        <Screen on={tab === 'claude'}>
          <ClaudeScreen link={link} top={top} bottom={insets.bottom} />
        </Screen>
      )}
      {seen.has('files') && (
        <Screen on={tab === 'files'}>
          <FilesScreen link={link} received={received} setReceived={setReceived} top={top} />
        </Screen>
      )}
      {seen.has('inbox') && (
        <Screen on={tab === 'inbox'}>
          <InboxScreen link={link} live={live} top={top} bottom={insets.bottom} />
        </Screen>
      )}
      {seen.has('more') && (
        <Screen on={tab === 'more'}>
          <MoreScreen link={link} live={live} state={state} prefs={prefs} setPrefs={setPrefs} onUnpair={onUnpair} top={top} open={more} setOpen={setMore} />
        </Screen>
      )}
      <TabBar tab={tab} setTab={setTab} badges={{ island: live.view?.approvals.length ?? 0, inbox: inboxBadge }} bottom={insets.bottom} />
      <IncomingLayer link={link} onReceived={onReceived} filesTabX={filesTabX} />
      {shared && <ShareScreen link={link} files={shared} onDone={clearShared} />}
    </View>
  )
}

/** A tab's screen: kept alive (so scroll and state stay), faded in when chosen. */
function Screen({ on, children }: { on: boolean; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0, { duration: 180 }), transform: [{ translateY: withTiming(on ? 0 : 8, { duration: 180 }) }] }), [on])
  return (
    <Animated.View pointerEvents={on ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  )
}
