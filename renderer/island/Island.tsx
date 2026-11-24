import { CallCard, CompactCall } from './states/CallActivity'
import { CompactTimer, TimerCard } from './states/TimerActivity'
import { CompactEvent, EventCard } from './states/EventActivity'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useState, useEffect, useLayoutEffect, useRef, type DragEvent } from 'react'
import type { Activity, SystemState } from '@shared/types'
import type { Rect } from '@shared/hitbox'
import { present, turnTakers, TURN_MS } from '@shared/present'
import { spring, pop, contentIn, contentOut, panelIn, morphSpring, sizeRank, tabResize } from '../anim/spring'
import { sound } from '../sound'
import { useHoverIntent } from './useHoverIntent'
import { Hello, Peek } from './states/Peek'
import { IdlePill, useResting } from './states/IdlePill'
import { NotchClock } from './states/NotchClock'
import { MediaCard } from './states/MediaCard'
import { JobCard } from './states/JobCard'
import { ApprovalCard } from './states/ApprovalCard'
import { CompactMedia } from './states/CompactMedia'
import { DetachedCircle } from './states/DetachedCircle'
import { NotificationCard } from './states/NotificationCard'
import { Hub, savedTab, rememberTab, type HubTab } from './hub/Hub'
import { useConnected } from './hub/ConnectedView'
import { CompactConnected, ConnectedStatusCard } from './states/ConnectedActivity'
import { TabBar } from './hub/TabBar'
import { offerDraft } from './hub/claudeDraft'
import { MessageCard } from './states/MessageCard'
import { ClaudeCard, CompactClaude } from './states/ClaudeActivity'
import { useVoice } from './voice/useVoice'
import type { ClaudeView } from '@shared/claude'
import { useDock } from './useDock'
import { EDGE_MARGIN, islandTop, panelTop, topLeft } from '@shared/dock'
import { Character, useCharacter } from './character/Character'
import { PACKAGE_TABS, type PackageTab } from '@shared/packages'
import type { DocsAdded } from '@shared/docs'
import type { DocsIncoming } from './hub/DocsView'
import { errorText } from './hub/common'
import { useNotifications } from './useNotifications'
import { clearedText, stackText } from '@shared/notifCenter'
import { useSessions } from './useSessions'
import { CompactSession, SessionCard } from './states/SessionActivity'
import { CloseBar } from './states/CloseBar'
import { tourSteps } from './tour'
import { ColourPicker } from './character/ColourPicker'
import { useDictation } from './voice/useDictation'
import { DictationPill } from './voice/DictationPill'
import { useBuddy } from './buddy/useBuddy'
import { BuddyPill, buddyShown } from './buddy/BuddyPill'
import { MorningCard, useMorning } from './states/MorningCard'
import { EveningCard, useEvening } from './states/EveningCard'
import { useEmbedder } from './brain/useEmbedder'
import { RecapCard, useRecap } from './recap/RecapCard'
import { useShortcutLabel } from './useShortcuts'
import { BreakCard, CompactWeather, DeviceNote, DropWells, HudBar, TranslateCard, WeatherCard, ownDrag, type Well } from './extras/NotchExtras'
import { isCard } from '@shared/present'
import type { ShelfView, WeatherView } from '@shared/extras'

/** A tab whose package is turned off. */
const tabOff = (t: HubTab, on: PackageTab[]) => (PACKAGE_TABS as string[]).includes(t) && !on.includes(t as PackageTab)

/** Files dragged over the island (and not, say, text). */
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * What the island turns into while files are dragged over it: a pocket the
 * character leans into. Once dropped, it swallows them while they're added.
 */
function DropCard({ count, adding, to = 'Documents' }: { count: number; adding: boolean; to?: string }) {
  const files = count > 1 ? `${count} files` : count === 1 ? '1 file' : 'files'
  return (
    <div className={`card drop-card${adding ? ' adding' : ''}`}>
      <div className="drop-text">
        <div className="title">{adding ? (to === 'Documents' ? `Adding ${files}…` : `${files[0].toUpperCase()}${files.slice(1)} to ${to}…`) : `Drop ${files} to add to Documents`}</div>
        <div className="caption">{to === 'Documents' ? 'PDFs, Word, Excel, slides or text' : to === 'the shelf' ? 'They stay where they are; the shelf remembers them' : 'On their way'}</div>
      </div>
      <Character mood={adding ? 'working' : 'listening'} size={46} color="#30d158" />
    </div>
  )
}

/** How far the blurred backdrop extends past each glass piece (see styles.css). */
const FROST_BLEED = 40

/**
 * The island's glass clips its content (overflow: hidden), but focusing a field
 * near its edge still scrolls it, leaving everything shifted. Undo that.
 */
const unscroll = (e: { currentTarget: HTMLElement; target: EventTarget }) => {
  if (e.target !== e.currentTarget) return // a list scrolling inside is fine
  e.currentTarget.scrollTop = 0
  e.currentTarget.scrollLeft = 0
}

/** Close the Control Center this long after the cursor leaves the island. */
const PANEL_CLOSE_MS = 1500

/** The notch's corners: flat where it meets the top edge, round below. */
const NOTCH_RADII = { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }
/** How far the notch's curves reach out along the top edge. */
const NOTCH_EAR = 10

export function Island({ activities: real }: { activities: Activity[] }) {
  const character = useCharacter()
  const center = useNotifications()
  // "Cleared 3 notifications · Undo", for a few seconds after Clear all.
  const [cleared, setCleared] = useState<number | null>(null)
  const [hover, setHover] = useState(false)
  // False while the pointer is on a card beside the island (the tour, the morning card…), as
  // the page sees it; true otherwise (also when only the main process reports the hover).
  const [overIsland, setOverIsland] = useState(true)
  const mainRef = useRef<HTMLDivElement | null>(null)
  // It stays while the pointer is on the island (you may be reaching for Undo).
  useEffect(() => {
    if (cleared === null || hover) return
    const t = setTimeout(() => setCleared(null), 5000)
    return () => clearTimeout(t)
  }, [cleared, hover])
  const [panel, setPanel] = useState(false)
  const [sys, setSys] = useState<SystemState | null>(null)
  const [replying, setReplying] = useState(false)
  const [typing, setTyping] = useState(false)
  const [tab, setTabState] = useState<HubTab>(savedTab)
  const setTab = (t: HubTab) => {
    setTabState(t)
    rememberTab(t)
  }
  // Opened from the keyboard: stay open until the pointer has visited and left.
  const pinned = useRef(false)
  const outerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [areaH, setAreaH] = useState(window.innerHeight)
  // The panel is open (set below, read when a drag starts).
  const openNow = useRef(false)
  const { side, anchor, dragging, handlers, consumeDragClick } = useDock(openNow)
  const atTop = side === 'top'
  // At the top, a notch: flush with the screen's top edge, the time beside the character (Settings → General).
  const [notchOn, setNotchOn] = useState(true)
  // With three or more quiet things going on, the capsule shows each in turn (Settings → General).
  const [turnsOn, setTurnsOn] = useState(true)
  useEffect(
    () =>
      window.island.onAppearance((a) => {
        setNotchOn(a.notch !== false)
        setTurnsOn(a.turns !== false)
      }),
    [],
  )
  const notch = atTop && notchOn && !dragging
  // The island's own width, settled (for the notch's curves where it meets the edge).
  // Where the island itself sits in the outer box (the notch's corners hang off its edges).
  const [islandBox, setIslandBox] = useState({ x: 0, w: 0 })
  /**
   * Left edge of the island's box in the window: on an edge, or centered at the top. A notch
   * itself stays at the centre (a second activity's bubble hangs beside it without moving it).
   */
  const leftFor = (w: number) =>
    side === 'left' ? EDGE_MARGIN : atTop ? topLeft(window.innerWidth, w, notch ? islandBox : undefined) : window.innerWidth - EDGE_MARGIN - w

  useEffect(() => window.island.onSysState(setSys), [])

  // Tabs of the packages that are turned on (Settings → Packages).
  const [pkgTabs, setPkgTabs] = useState<PackageTab[] | null>(null)
  useEffect(() => window.island.onPackages?.(setPkgTabs), [])
  useEffect(() => {
    if (pkgTabs && tabOff(tab, pkgTabs)) setTab('dash')
  }, [pkgTabs, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drag files to the island: it opens the places they can go (the shelf, Documents when it's on, your phone when it's near).
  const docsOn = !!window.island.docs && (!pkgTabs || pkgTabs.includes('docs'))
  const [dropping, setDropping] = useState(false)
  const [dragCount, setDragCount] = useState(0)
  // The place the files would go if let go now: the shelf, until the pointer is over another.
  const [well, setWell] = useState<Well>('shelf')
  const [phoneNear, setPhoneNear] = useState(false)
  const wells: Well[] = ['shelf', ...(docsOn ? (['docs'] as const) : []), ...(phoneNear ? (['phone'] as const) : [])]
  useEffect(() => {
    if (!dropping) return setWell('shelf')
    let live = true
    void window.island
      .os<ShelfView>('shelf.view')
      .then((v) => live && setPhoneNear(!!v.phone))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [dropping])
  // A file dragged off the shelf is the island's own: once the button is up again, drags count as before.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (e.buttons === 0) ownDrag.on = false
    }
    document.addEventListener('mousemove', move, true)
    return () => document.removeEventListener('mousemove', move, true)
  }, [])
  // Dropped files being added: the character swallows them meanwhile.
  const [adding, setAdding] = useState(0)
  const [addingTo, setAddingTo] = useState('Documents')
  const [incoming, setIncoming] = useState<DocsIncoming | null>(null)
  const lastOver = useRef(0)
  // Onto the shelf, or to the phone: the files themselves stay where they are.
  const dropElsewhere = async (files: File[], to: 'shelf' | 'phone') => {
    const paths = files.map((f) => window.island.docs.pathFor(f)).filter(Boolean)
    setAddingTo(to === 'shelf' ? 'the shelf' : 'your phone')
    setAdding(files.length)
    sound('gulp')
    const shown = new Promise((ok) => setTimeout(ok, 450))
    await (paths.length ? window.island.os(to === 'shelf' ? 'shelf.add' : 'drop.phone', { paths }) : Promise.resolve()).catch(() => {})
    await shown
    setAdding(0)
    if (to !== 'shelf') return
    setTab('dash')
    pinned.current = true // the pointer was busy dragging: stay open until it visits
    setPanel(true)
  }
  const dropFiles = async (files: File[]) => {
    const paths = files.map((f) => window.island.docs.pathFor(f)).filter(Boolean)
    setAddingTo('Documents')
    setAdding(files.length)
    sound('gulp')
    const shown = new Promise((ok) => setTimeout(ok, 450)) // long enough to see the gulp
    let r: DocsAdded
    try {
      r = paths.length ? await window.island.docs.add(paths) : { added: [], skipped: files.map((f) => ({ path: f.name, why: 'not a file on this computer' })) }
    } catch (e) {
      r = { added: [], skipped: [{ path: 'The files', why: errorText(e) }] }
    }
    await shown
    setAdding(0)
    setIncoming({ ids: r.added.map((f) => f.id), skipped: r.skipped, at: Date.now() })
    setTab('docs')
    pinned.current = true // the pointer was busy dragging: stay open until it visits
    setPanel(true)
  }
  const dropHandlers = window.island.docs
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e) || ownDrag.on) return
          e.preventDefault()
          lastOver.current = performance.now()
          setDropping(true)
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e) || ownDrag.on) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          lastOver.current = performance.now()
          setDragCount(e.dataTransfer.items?.length ?? 0)
          setDropping(true)
        },
        // Moving between parts of the island leaves one and enters (then drags
        // over) the next; only a leave with nothing after it is really leaving.
        onDragLeave: () => {
          const at = performance.now()
          setTimeout(() => lastOver.current < at && setDropping(false), 80)
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e) || ownDrag.on) return
          e.preventDefault()
          setDropping(false)
          const files = Array.from(e.dataTransfer.files)
          // Let go over a well, or anywhere else on the island: where the light is.
          const to = wells.includes(well) ? well : 'shelf'
          void (to === 'docs' ? dropFiles(files) : dropElsewhere(files, to))
        },
      }
    : {}

  // Claude Code + voice live here so switching tabs never cuts you off.
  const [claude, setClaude] = useState<ClaudeView | null>(null)
  useEffect(() => {
    if (!window.island.claude) return // an older island process is running
    let live = true
    // Retry: the main process may still be starting its services.
    const load = (n: number) =>
      window.island.claude
        .state()
        .then((v) => live && setClaude(v))
        .catch(() => live && n > 0 && setTimeout(() => load(n - 1), 700))
    load(15)
    const off = window.island.claude.onChange(setClaude)
    return () => {
      live = false
      off()
    }
  }, [])
  const voice = useVoice(claude)
  // Dictate anywhere (its shortcut): typed into the app you're in.
  const dictation = useDictation(claude)
  // The buddy: ask about your screen (its shortcut), it answers out loud and points.
  const buddy = useBuddy(claude, character.name)
  // The morning card: the one thing for today, from the brain's loop.
  const morning = useMorning()
  // The evening digest: what was kept quiet today.
  const evening = useEvening()
  // Search by meaning: the brain's notes as vectors, made here.
  useEmbedder()
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const openClaude = () => {
    setTab('claude')
    setPanel(true)
  }
  // Claude Code in your terminals.
  const sessions = useSessions()
  const connected = useConnected()
  const openSessions = () => {
    setTab('sessions')
    setPanel(true)
  }
  const openDash = () => {
    setTab('dash')
    setPanel(true)
  }
  const openToday = () => {
    setTab('today')
    setPanel(true)
  }
  // Ctrl+Alt+Space: open Claude and start (or finish) talking, from anywhere.
  useEffect(
    () =>
      window.island.claude?.onVoice(() => {
        setTabState('claude')
        rememberTab('claude')
        setPanel((open) => {
          if (!open) pinned.current = true
          return true
        })
        voiceRef.current.toggle()
      }),
    [],
  )
  // The drag actions ring's Ask and Edit: open the Claude tab (Edit leaves a message to finish).
  useEffect(
    () =>
      window.island.claude?.onOpen(({ draft }) => {
        if (draft) offerDraft(draft)
        setTabState('claude')
        rememberTab('claude')
        setPanel((open) => {
          if (!open) pinned.current = true
          return true
        })
      }),
    [],
  )
  // The weekly recap, when the main process shows it.
  const [recapShow, closeRecap] = useRecap()
  // Right-click the resting island: pick the orb's colour.
  const [wardrobe, setWardrobe] = useState(false)
  // "Show me around": example cards, one step at a time (nothing real is touched).
  const panelKey = useShortcutLabel('panel')
  const translateKey = useShortcutLabel('translate')
  const steps = tourSteps(character.name, panelKey)
  const [tour, setTour] = useState<number | null>(null)
  const [tourOffer, setTourOffer] = useState(false)
  const tourStep = tour === null ? null : steps[tour]
  const tourNow = useRef(Date.now())
  const startTour = () => {
    tourNow.current = Date.now()
    setTourOffer(false)
    setPanel(false)
    setTour(0)
  }
  useEffect(() => window.island.onTour?.(startTour), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Something real that needs you ends the tour.
  const urgent = real.some((a) => a.kind === 'approval' || (a.kind === 'session' && a.session.phase === 'waiting'))
  useEffect(() => {
    if (urgent) setTour(null)
  }, [urgent])
  const [wx, setWx] = useState<WeatherView | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      window.island
        .os<WeatherView>('weather.view')
        .then((v) => live && setWx(v))
        .catch(() => {})
    void load()
    const off = window.island.onOs((topic) => (topic === 'weather' || topic === 'extras') && void load())
    // (Asking is what makes the island read it again when it has gone stale.)
    const t = setInterval(load, 10 * 60_000)
    return () => {
      live = false
      off()
      clearInterval(t)
    }
  }, [])
  const withWeather = wx?.weather && real.length > 0 && real.every((a) => !isCard(a)) ? [...real, { kind: 'weather' as const, id: 'weather', priority: 0.5, weather: wx.weather }] : real
  const activities = tourStep ? tourStep.activities(tourNow.current) : withWeather
  // Hello, once a day: a short introduction that hover or a click ends.
  const [hello, setHello] = useState<{ first: boolean; tip: boolean } | null>(null)
  useEffect(
    () =>
      window.island.onGreet?.((g) => {
        setHello({ first: g.first, tip: false })
        if (g.first) setTimeout(() => setHello((h) => h && { ...h, tip: true }), 1600)
        setTimeout(() => setHello(null), g.first ? 3800 : 2400)
        // The very first time, offer the tour once the hello is done.
        if (g.first) setTimeout(() => setTourOffer(true), 4000)
      }),
    [],
  )
  // The main process's cursor loop is the source of truth for hover: DOM
  // mouseleave is not delivered once the window turns click-through.
  useEffect(() => window.island.onHover(setHover), [])
  // A leave can also be lost: when the element under the pointer is removed (a button that
  // closes its own card) and the pointer moves on before the page looks again, no mouseleave
  // reaches the island. Any move outside it, or leaving the window, ends the hover too.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (outerRef.current && !outerRef.current.contains(e.target as Node)) setHover(false)
    }
    const out = (e: MouseEvent) => {
      if (!e.relatedTarget) setHover(false)
    }
    document.addEventListener('mousemove', move, true)
    document.addEventListener('mouseout', out, true)
    return () => {
      document.removeEventListener('mousemove', move, true)
      document.removeEventListener('mouseout', out, true)
    }
  }, [])

  // Hover intent: a short rest peeks, a longer one opens the full card.
  // No peek while the Undo note is up: the island growing would move it from under the pointer.
  // Only resting on the island itself peeks, not on the cards beside it (the tour, the morning
  // card…): peeking changes the island's height, which slides those cards out from under a
  // still pointer, and the peek would fold and open again and again.
  const stage = useHoverIntent(hover && overIsland && !panel && !dropping && cleared === null)
  // Taking turns: every few seconds the next one has the capsule. It waits while the pointer is on the
  // island (what you're reaching for stays put) and while the island is open.
  const taking = turnsOn && !tourStep && turnTakers(activities).length > 0
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    if (!taking || hover || panel) return
    const t = setInterval(() => setTurn((n) => n + 1), TURN_MS)
    return () => clearInterval(t)
  }, [taking, hover, panel])
  const p = present(activities, { expanded: stage === 'full' || !!tourStep?.expanded, turn: taking ? turn : undefined })
  const isApproval = p.mode !== 'idle' && p.primary.kind === 'approval'
  // The Control Center takes over when opened, unless an approval needs you.
  const showPanel = panel && !isApproval
  openNow.current = showPanel
  // On a side edge the island centres on its anchor; the open panel keeps its
  // top still instead, so the row of sections doesn't move as you switch.
  const top = atTop ? (notch ? 0 : EDGE_MARGIN) : showPanel ? panelTop(anchor, size.h, areaH) : islandTop(anchor, size.h, areaH)
  // What the resting island says: asked again each time it comes to rest.
  const resting = useResting(p.mode === 'idle' && !showPanel)
  const peeking = stage === 'peek' && !showPanel && !dropping && p.mode !== 'expanded'

  useEffect(() => window.island.setPanel(showPanel), [showPanel])

  // The colour card closes once the pointer has left for a moment.
  useEffect(() => {
    if (!wardrobe || hover) return
    const t = setTimeout(() => setWardrobe(false), PANEL_CLOSE_MS * 2)
    return () => clearTimeout(t)
  }, [wardrobe, hover])

  // "Open on hover" (Settings): resting on the resting island opens the panel.
  // Only on a fresh rest: closing the panel (or the colour card) under the pointer
  // mustn't open it again until the pointer has left.
  const hoverArmed = useRef(true)
  useEffect(() => {
    if (!hover) hoverArmed.current = true
  }, [hover])
  useEffect(() => {
    if (panel || wardrobe) hoverArmed.current = false
  }, [panel, wardrobe])
  useEffect(() => {
    if (stage !== 'full' || p.mode !== 'idle' || panel || wardrobe || !hoverArmed.current || document.documentElement.dataset.openOnHover !== 'yes') return
    setPanel(true)
  }, [stage, p.mode, panel, wardrobe])

  // Keep a notification / message / result open while it's hovered or being answered.
  const transientId =
    p.mode !== 'idle' &&
    (p.primary.kind === 'notification' ||
      p.primary.kind === 'message' ||
      p.primary.id === 'claude-done' ||
      p.primary.id.startsWith('session-done-') ||
      (p.primary.kind === 'job' && p.primary.job.phase !== 'working'))
      ? p.primary.id
      : null
  // Only while the card is actually on screen (not hidden behind the panel).
  const holding = (hover || replying) && !showPanel
  useEffect(() => {
    if (!transientId || !holding) return
    window.island.hold(transientId, true)
    return () => window.island.hold(transientId, false)
  }, [transientId, holding])
  useEffect(() => {
    if (!transientId) setReplying(false)
  }, [transientId])

  // Ctrl+I (global shortcut in the main process) opens / closes the panel.
  useEffect(
    () =>
      window.island.onTogglePanel(() => {
        setPanel((open) => {
          pinned.current = !open
          return !open
        })
      }),
    [],
  )
  useEffect(() => {
    if (hover) pinned.current = false
    if (hover) setHello(null)
  }, [hover])
  useEffect(() => {
    if (!panel) setTyping(false)
  }, [panel])

  // Auto-close the panel once the cursor has left for a moment (not while typing).
  useEffect(() => {
    // Also stays open while you're talking to Claude.
    // A pinned panel (opened from the keyboard) unpins once the pointer is on
    // it, even if it was already there when the panel opened.
    if (panel && hover) pinned.current = false
    if (!panel || hover || typing || dropping || voice.phase !== 'idle' || pinned.current) return
    const t = setTimeout(() => setPanel(false), PANEL_CLOSE_MS)
    return () => clearTimeout(t)
  }, [panel, hover, typing, dropping, voice.phase])

  // Track the island's settled size (the outer box is never transformed).
  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const measure = () => {
      setSize({ w: outer.offsetWidth, h: outer.offsetHeight })
      const x = mainRef.current?.offsetLeft ?? 0
      const w = mainRef.current?.offsetWidth ?? 0
      setIslandBox((box) => (box.x === x && box.w === w ? box : { x, w }))
    }
    const onResize = () => setAreaH(window.innerHeight)
    const ro = new ResizeObserver(measure)
    ro.observe(outer)
    if (mainRef.current) ro.observe(mainRef.current)
    window.addEventListener('resize', onResize)
    measure()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Frosted glass: tell each glass piece where it sits in the window so its
  // blurred snapshot lines up with the real screen behind it. Uses final
  // layout positions (offsetLeft/Top ignore animation transforms).
  useLayoutEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const ox = leftFor(outer.offsetWidth)
    outer.querySelectorAll<HTMLElement>(':scope > .island').forEach((el) => {
      el.style.setProperty('--bgx', `${FROST_BLEED - (ox + el.offsetLeft)}px`)
      el.style.setProperty('--bgy', `${FROST_BLEED - (top + el.offsetTop)}px`)
    })
  })

  // Report the hit area: the settled position and size, not the mid-animation one.
  const lastRect = useRef<Rect | null>(null)
  useLayoutEffect(() => {
    if (!size.w) return
    lastRect.current = {
      x: leftFor(size.w),
      y: top,
      width: size.w,
      height: size.h,
    }
    window.island.reportRect(lastRect.current)
  }, [side, top, size.w, size.h, areaH, notch, islandBox.x, islandBox.w])
  // The page can load before the main process listens: report again when asked.
  useEffect(
    () =>
      window.island.onRectRequest?.(() => {
        if (lastRect.current) window.island.reportRect(lastRect.current)
      }),
    [],
  )

  const dressing = wardrobe && !showPanel && p.mode === 'idle' && !dropping
  const recapping = !!recapShow && !showPanel && !isApproval && !dropping && !tourStep
  const key = showPanel
    ? 'panel'
    : recapping
      ? 'recap'
      : dressing
      ? 'wardrobe'
      : dropping || adding
      ? 'drop'
      : peeking
        ? `peek:${p.mode === 'idle' ? 'idle' : p.primary.id}`
        : hello && p.mode === 'idle'
          ? `hello:${hello.tip ? 'tip' : 'hi'}`
          : p.mode === 'idle'
            ? 'idle'
            : `${p.mode}:${p.primary.kind}:${p.primary.id}`

  // The notch shows the time while the island rests or works on something, not while it's open.
  const clockShown = notch && (key === 'idle' || key.startsWith('compact:') || key.startsWith('minimal:'))

  // Growing uses the open spring, shrinking the close one (no bounce); the open
  // panel taking another section's height settles without one.
  const shown = useRef({ key, tab, spring: spring as ReturnType<typeof morphSpring> | typeof tabResize })
  if (shown.current.key !== key) shown.current = { key, tab, spring: morphSpring(shown.current.key, key) }
  else if (key === 'panel' && shown.current.tab !== tab) shown.current = { key, tab, spring: tabResize }
  const shell = shown.current.spring

  // The island's little sounds (when turned on), one per change of state.
  const heard = useRef(key)
  useEffect(() => {
    const was = heard.current
    heard.current = key
    if (was === key) return
    if (key.startsWith('expanded:approval:')) return sound('ask')
    if (key === 'expanded:claude:claude-done' && p.mode === 'expanded' && p.primary.kind === 'claude') return sound(p.primary.run.phase === 'error' ? 'error' : 'done')
    if (key.startsWith('expanded:session:session-done-')) return sound('done')
    if (key.startsWith('expanded:session:session-wait-')) return sound('ask')
    // The volume as you change it, a device that connected: seen, not heard.
    if ([key, was].some((k) => k.startsWith('expanded:hud:') || k.startsWith('expanded:device:'))) return
    if (key.startsWith('expanded:break:')) return sound('ask')
    if (key.startsWith('peek:')) return sound('peek')
    if (sizeRank(key) > sizeRank(was)) sound('open')
    else if (sizeRank(key) < sizeRank(was) && !was.startsWith('peek:')) sound('close')
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Content hand-off: the old content leaves fast while the new one starts a
  // little later, so they overlap. Blur only on small content: on the panel it
  // would repaint the whole panel every frame.
  const reduce = useReducedMotion() ?? false
  const toward = atTop ? { y: -6 } : { x: side === 'left' ? -6 : 6 }
  const soft = key !== 'panel' && !reduce
  const enter = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, ...toward, ...(soft ? { filter: 'blur(4px)' } : {}) }
  const leave = reduce ? { opacity: 0, transition: { duration: 0.16 } } : { opacity: 0, scale: 0.97, ...(soft ? { filter: 'blur(4px)' } : {}), transition: contentOut }

  // Your voice assistant, for the Dashboard's microphone and tile.
  const assistant = { name: character.name, listen: buddy.listen, phase: buddy.view.phase, wake: !!buddy.view.wake, ask: buddy.key }
  // What's playing, for the Dashboard's tile.
  const media = activities.find((a) => a.kind === 'media')?.media ?? null
  // Notification and message cards waiting on the island.
  const notifCards = activities.filter((a) => a.kind === 'notification' || a.kind === 'message').length
  const onNotifCard = !showPanel && p.mode === 'expanded' && (p.primary.kind === 'notification' || p.primary.kind === 'message')

  // The island's sections, in a row across the top of the open island.
  const bar = showPanel ? (
    <TabBar
      tab={tab}
      onTab={setTab}
      usage={claude?.usage}
      alerts={center.unseen}
      sessions={sessions.filter((x) => x.phase === 'waiting').length}
      running={[
        ...(activities.some((a) => a.kind === 'media' && a.media.playing) ? (['music'] as const) : []),
        ...(claude?.run && ['starting', 'thinking', 'tool', 'writing'].includes(claude.run.phase) ? (['claude'] as const) : []),
        ...(sessions.some((x) => x.phase === 'working' || x.phase === 'waiting') ? (['sessions'] as const) : []),
        ...(activities.some((a) => a.kind === 'timer') ? (['dash'] as const) : []),
        ...(connected?.manifest ? (['connected'] as const) : []),
      ]}
      connected={connected?.manifest ? { name: connected.manifest.tabTitle, waiting: connected.view?.asks.length ?? 0 } : undefined}
      // The Connected tab only once something is connected (Settings → Connected).
      hidden={[...(pkgTabs ? PACKAGE_TABS.filter((t) => !pkgTabs.includes(t)) : []), ...(connected?.configured ? [] : (['connected'] as const))]}
    />
  ) : null

  const onClick = () => {
    if (consumeDragClick()) return
    setHello(null)
    if (p.mode !== 'idle' && !showPanel) {
      if (p.primary.kind === 'notification') return window.island.dismiss(p.primary.id)
      if (p.primary.kind === 'message') return // has its own buttons
      if (p.primary.kind === 'claude') {
        if (p.mode === 'expanded') return // card has its own buttons
        return openClaude()
      }
      if (p.primary.kind === 'session') {
        if (p.mode === 'expanded') return // card has its own buttons
        return openSessions()
      }
      if (p.primary.kind === 'timer') {
        if (p.mode === 'expanded') return // card has its own buttons
        return openDash()
      }
      if (p.primary.kind === 'event') {
        if (p.mode === 'expanded') return // card has its own button
        return openToday()
      }
      if (p.primary.kind === 'weather') return openDash()
      // These have their own buttons, or are only there to be read.
      if (p.primary.kind === 'translate' || p.primary.kind === 'break' || p.primary.kind === 'hud' || p.primary.kind === 'device') return
    }
    if (!isApproval) {
      setPanel((v) => !v)
    }
  }

  return (
    <div
      ref={outerRef}
      className={`island-outer ${side}${notch ? ' notch' : ''}${dragging ? ' dragging' : ''}${showPanel ? ' open' : ''}`}
      style={atTop ? { top, left: leftFor(size.w) } : { top, [side]: EDGE_MARGIN }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setOverIsland(true)
      }}
      onMouseOver={(e) => setOverIsland(!!mainRef.current?.contains(e.target as Node))}
      onContextMenu={(e) => {
        e.preventDefault()
        if (p.mode === 'idle' && !showPanel) setWardrobe(true)
      }}
      onClick={onClick}
      {...handlers}
      {...dropHandlers}
    >
      {/* Rounded with border-radius set here, not a clip shape: the layout
          animation resizes with a scale transform, and Framer Motion corrects
          border-radius for it, so the corners stay round while it grows. */}
      <motion.div
        className="island"
        layout
        transition={reduce ? { duration: 0.16 } : shell}
        style={notch ? NOTCH_RADII : { borderRadius: 26 }}
        onScroll={unscroll}
        ref={mainRef}
      >
        {/* The time, on the notch's leading side, while the island isn't open: it stays put as what's beside it changes. */}
        <AnimatePresence initial={false}>
          {clockShown && (
            <motion.div key="clock" className="notch-lead" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={reduce ? { duration: 0.16 } : contentIn}>
              <NotchClock />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={key}
            // The open panel's contents only move: as a new section changes its height, the
            // island's shape grows or shrinks around them (they're never squeezed or stretched).
            layout={key === 'panel' ? 'position' : true}
            // Content grows out of / sinks back into the docked edge.
            style={{ transformOrigin: atTop ? 'center top' : side === 'left' ? 'left center' : 'right center' }}
            initial={enter}
            animate={soft ? { opacity: 1, scale: 1, x: 0, y: 0, filter: 'blur(0px)' } : { opacity: 1, scale: 1, x: 0, y: 0 }}
            transition={reduce ? { duration: 0.16 } : key === 'panel' ? panelIn : contentIn}
            exit={leave}
          >
            {showPanel ? (
              <Hub sys={sys} tab={tab} onTab={setTab} center={center} sessions={sessions} media={media} assistant={assistant} onTyping={setTyping} claude={claude} voice={voice} incoming={incoming} dropping={dropping} bar={bar} />
            ) : recapping ? (
              <RecapCard r={recapShow!} onClose={closeRecap} />
            ) : dressing ? (
              <div className="card wardrobe-card" onClick={(e) => e.stopPropagation()}>
                <div className="card-head">
                  <span className="app-name">{character.name}’s colour</span>
                  <span className="spacer" />
                  <button className="pill primary small" onClick={() => setWardrobe(false)}>
                    Done
                  </button>
                </div>
                <div className="wardrobe-preview">
                  <Character mood="idle" size={64} ring={false} />
                </div>
                <ColourPicker id={character.id} color={character.color ?? null} onColor={(color) => window.island.setLook({ color })} />
              </div>
            ) : adding ? (
              <DropCard count={adding} adding to={addingTo} />
            ) : dropping ? (
              <DropWells count={dragCount} wells={wells} hot={wells.includes(well) ? well : 'shelf'} onHot={setWell} />
            ) : peeking ? (
              <Peek activity={p.mode === 'idle' ? null : p.primary} canDrop={docsOn} resting={resting} />
            ) : hello && p.mode === 'idle' ? (
              <Hello tip={hello.tip} />
            ) : p.mode === 'idle' ? (
              <IdlePill dnd={center.dnd} waiting={center.dnd ? center.unseen : 0} toFile={resting?.toFile ?? 0} notch={notch} />
            ) : p.primary.kind === 'approval' ? (
              <ApprovalCard request={p.primary.request} queued={p.queued} />
            ) : p.primary.kind === 'notification' ? (
              <NotificationCard
                id={p.primary.id}
                notification={p.primary.notification}
                // The "N more · Clear all" pill below counts what's waiting.
                queued={notifCards >= 2 ? 0 : p.queued}
              />
            ) : p.primary.kind === 'message' ? (
              <MessageCard
                id={p.primary.id}
                message={p.primary.message}
                queued={notifCards >= 2 ? 0 : p.queued}
                onReplying={setReplying}
                onOpen={() => {
                  setTab(p.primary.kind === 'message' && p.primary.message.source === 'mail' ? 'mail' : 'chats')
                  setPanel(true)
                }}
              />
            ) : p.primary.kind === 'claude' ? (
              p.mode === 'expanded' ? (
                <ClaudeCard
                  id={p.primary.id}
                  run={p.primary.run}
                  onOpen={openClaude}
                  title={claude && claude.assistant.provider !== 'claude-code' ? `${character.name} · ${claude.assistant.label}` : undefined}
                />
              ) : (
                <CompactClaude run={p.primary.run} notch={notch} />
              )
            ) : p.primary.kind === 'session' ? (
              p.mode === 'expanded' ? (
                <SessionCard id={p.primary.id} session={p.primary.session} others={p.primary.others} onOpen={openSessions} />
              ) : (
                <CompactSession session={p.primary.session} others={p.primary.others} notch={notch} />
              )
            ) : p.primary.kind === 'job' ? (
              <JobCard id={p.primary.id} job={p.primary.job} />
            ) : p.primary.kind === 'call' ? (
              p.mode === 'expanded' ? <CallCard started={p.primary.call.started} /> : <CompactCall started={p.primary.call.started} />
            ) : p.primary.kind === 'timer' ? (
              p.mode === 'expanded' ? <TimerCard timer={p.primary.timer} onOpen={openDash} /> : <CompactTimer timer={p.primary.timer} notch={notch} />
            ) : p.primary.kind === 'event' ? (
              p.mode === 'expanded' ? <EventCard event={p.primary.event} onOpen={openToday} /> : <CompactEvent event={p.primary.event} notch={notch} />
            ) : p.primary.kind === 'hud' ? (
              <HudBar hud={p.primary.hud} />
            ) : p.primary.kind === 'device' ? (
              <DeviceNote device={p.primary.device} />
            ) : p.primary.kind === 'translate' ? (
              <TranslateCard t={p.primary.translation} keys={translateKey} />
            ) : p.primary.kind === 'break' ? (
              <BreakCard rest={p.primary.rest} />
            ) : p.primary.kind === 'weather' ? (
              p.mode === 'expanded' ? <WeatherCard weather={p.primary.weather} onOpen={openDash} /> : <CompactWeather weather={p.primary.weather} />
            ) : p.primary.kind === 'connected' ? (
              p.mode === 'expanded' ? (
                <ConnectedStatusCard
                  status={p.primary.status}
                  onOpen={() => {
                    setTab('connected')
                    setPanel(true)
                  }}
                />
              ) : (
                <CompactConnected status={p.primary.status} />
              )
            ) : p.mode === 'expanded' ? (
              <MediaCard media={p.primary.media} />
            ) : (
              <CompactMedia media={p.primary.media} />
            )}
            {!showPanel && !dropping && !peeking && p.mode === 'expanded' && transientId && p.primary.closes && !p.primary.pinned && (
              <CloseBar id={transientId} ms={p.primary.closes} held={holding} showPin={hover} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      {notch && islandBox.w > 0 && (
        <>
          <motion.span className="notch-ear left" aria-hidden layout="position" transition={reduce ? { duration: 0.16 } : shell} style={{ left: islandBox.x - NOTCH_EAR }} />
          <motion.span className="notch-ear right" aria-hidden layout="position" transition={reduce ? { duration: 0.16 } : shell} style={{ left: islandBox.x + islandBox.w }} />
        </>
      )}

      <AnimatePresence>
        {notifCards >= 2 && onNotifCard && (
          // More notifications waiting behind this one: say how many, and clear them all at once.
          <motion.div
            key="notif-stack"
            className="island notif-stack"
            initial={{ opacity: 0, y: -10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.92, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="more">
              {stackText(
                notifCards - 1,
                activities
                  .filter((a) => (a.kind === 'notification' || a.kind === 'message') && a.id !== p.primary?.id)
                  .map((a) => (a.kind === 'notification' ? a.notification.app : a.kind === 'message' ? (a.message.source === 'mail' ? 'Mail' : 'WhatsApp') : '')),
              )}
            </span>
            <button
              className="clear"
              onClick={async () => {
                // The tour's cards are examples: clearing them just moves on.
                if (tourStep) return setTour((t) => (t === null ? null : t + 1))
                const n = await window.island.notifications.clearAll()
                setCleared(n > 0 ? n : null)
              }}
            >
              Clear all
            </button>
          </motion.div>
        )}
        {cleared !== null && !showPanel && !onNotifCard && (
          <motion.div
            key="notif-cleared"
            className="island notif-stack toast"
            initial={{ opacity: 0, y: -10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.92, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="more">{clearedText(cleared)}</span>
            <button
              className="clear undo"
              onClick={() => {
                void window.island.notifications.undo()
                setCleared(null)
              }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {morning.card && !showPanel && !buddyShown(buddy) && (
          <motion.div
            key="morning"
            className="island morning-island"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
          >
            <MorningCard card={morning.card} act={morning.act} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {evening.card && !morning.card && !showPanel && !buddyShown(buddy) && !tourStep && (
          <motion.div
            key="evening"
            className="island evening-island"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
          >
            <EveningCard
              card={evening.card}
              done={evening.done}
              openNotifications={() => {
                setTab('alerts')
                setPanel(true)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {buddyShown(buddy) && (
          <motion.div
            key="buddy"
            className="island buddy-island"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
            role="status"
          >
            <BuddyPill b={buddy} name={character.name} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dictation.phase !== 'idle' && (
          <motion.div
            key="dictate"
            className="island dictate-pill"
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
            role="status"
            aria-live="polite"
          >
            <DictationPill d={dictation} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tourStep && !showPanel && (
          <motion.div
            key="tour"
            className="island tour-bar"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Tour"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={tour} className="tour-text" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={pop}>
                <div className="tour-title">{tourStep.title}</div>
                <div className="tour-body">{tourStep.body}</div>
              </motion.div>
            </AnimatePresence>
            <div className="tour-foot">
              <span className="tour-dots" aria-label={`Step ${tour! + 1} of ${steps.length}`}>
                {steps.map((_s, i) => (
                  <span key={i} className={i === tour ? 'on' : ''} />
                ))}
              </span>
              <span className="spacer" />
              {tour! < steps.length - 1 && (
                <button className="plain muted" onClick={() => setTour(null)}>
                  Skip
                </button>
              )}
              {tour! > 0 && (
                <button className="pill" onClick={() => setTour(tour! - 1)}>
                  Back
                </button>
              )}
              <button className="pill primary tour-next" onClick={() => setTour(tour! < steps.length - 1 ? tour! + 1 : null)}>
                {tour! < steps.length - 1 ? 'Next' : 'Done'}
              </button>
            </div>
          </motion.div>
        )}
        {tourOffer && !tourStep && !showPanel && p.mode === 'idle' && (
          <motion.div
            key="tour-offer"
            className="island notif-stack tour-offer"
            initial={{ opacity: 0, y: -10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.92, transition: { duration: 0.16 } }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="more">New here? A one-minute tour</span>
            <button className="clear" onClick={startTour}>
              Show me
            </button>
            <button className="clear undo" aria-label="Not now" onClick={() => setTourOffer(false)}>
              Later
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isApproval && !showPanel && !atTop && p.mode === 'expanded' && p.queued > 0 && (
          // More approvals waiting: the edges of the next cards peek out below.
          <motion.div
            key="stack"
            className="approval-stack-wrap"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={pop}
          >
            <span className="approval-stack" />
            {p.queued > 1 && <span className="approval-stack second" />}
          </motion.div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {!showPanel && p.mode === 'minimal' && (
          // Buds off the capsule (below it on an edge, beside it at the top) and merges back.
          <motion.div
            key="detached"
            className="island detached"
            initial={{ opacity: 0, scale: 0.3, ...(atTop ? { x: -24 } : { y: -24 }) }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.3, ...(atTop ? { x: -24 } : { y: -24 }) }}
            transition={spring}
          >
            {/* (Keyed: when the capsule takes turns, the next one fades in here.) */}
            <span key={p.detached.id} className="detached-in">
              <DetachedCircle activity={p.detached} />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
