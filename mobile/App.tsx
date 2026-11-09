import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, AppState, BackHandler, Linking, StyleSheet, View, useWindowDimensions } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { shareIntake, type SharedFile } from './modules/share-intake'
import { DropLink, findComputer, type Live, type LinkState } from './src/link'
import { followIsland, setupNotifications } from './src/notify'
import { forgetPairing, loadPairing, savePairing } from './src/pairing'
import { loadPrefs, savePrefs, type Prefs } from './src/prefs'
import { mergeUrls, parsePairingLink, type Pairing } from './src/protocol'
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
import { ThemeProvider, useTheme, type ThemePref } from './src/ui/theme'

export default function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs())
  const setPrefs = (p: Prefs) => {
    savePrefs(p)
    setPrefsState(p)
  }
  return (
    <ThemeProvider pref={prefs.theme}>
      <Themed>
        <Root prefs={prefs} setPrefs={setPrefs} />
      </Themed>
    </ThemeProvider>
  )
}

/** The page colour, status bar and Android's navigation bar for the theme in use. */
function Themed({ children }: { children: React.ReactNode }) {
  const C = useTheme()
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(C.bg).catch(() => {})
  }, [C])
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style={C.statusBar} />
        {children}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function Root({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const C = useTheme()
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
      const found = { ...p, name: r.name || p.name, urls: mergeUrls([r.url, ...r.urls], p.urls) }
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

  // One link per pairing; when the computer's addresses change, they're saved for next time (the link carries on).
  const link = useMemo(() => (pairing ? new DropLink(pairing, (p) => void savePairing(p)) : null), [pairing?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (pairing === undefined)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={C.text2} />
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
      prefs={prefs}
      setPrefs={setPrefs}
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

function Paired({ link, shared, clearShared, onUnpair, prefs, setPrefs: savePrefsUp }: { link: DropLink; shared: SharedFile[] | null; clearShared: () => void; onUnpair: () => void; prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const C = useTheme()
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
  // In front (the figure only moves then).
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'))
    return () => sub.remove()
  }, [])
  const [state, setState] = useState<LinkState>(link.state)
  const [received, setReceived] = useState<Received[]>(() => loadReceived())
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => link.subscribeLive(setLive), [link])
  useEffect(() => link.subscribe(setState), [link])
  useEffect(() => {
    let stop = () => {}
    void link.find().then(() => link.startLive())
    const offNet = link.watchNetwork()
    void setupNotifications().then(() => {
      stop = followIsland(link, { computer: () => prefsRef.current.computerNotes, background: () => prefsRef.current.background })
    })
    // Back in the app: make sure the link is still there.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && link.live.phase !== 'live') void link.startLive()
    })
    return () => {
      stop()
      offNet()
      sub.remove()
      link.stopLive()
    }
  }, [link])

  const setPrefs = (p: Prefs) => {
    savePrefsUp(p)
    prefsRef.current = p
    // Starts or stops the background link now, not at the next change.
    if (p.background !== prefs.background) void link.refresh()
  }

  const receivedRef = useRef(received)
  receivedRef.current = received
  // One after another, each from the list the last one left (many can arrive at once: a folder).
  const keeping = useRef(Promise.resolve())
  const onReceived = (uri: string, f: { name: string; size: number }, folder?: { uri: string; name: string }) => {
    keeping.current = keeping.current
      .then(() => keepReceived(receivedRef.current, uri, f.name, f.size, link.pairing.name, folder))
      .then((r) => {
        receivedRef.current = r
        setReceived(r)
      })
      .catch(() => {})
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
          state={state}
          active={tab === 'island' && appActive}
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

/** A tab's screen: kept alive (so scroll and state stay), shown at once when chosen, not drawn while another is. */
function Screen({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <View pointerEvents={on ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { display: on ? 'flex' : 'none' }]}>
      {children}
    </View>
  )
}
