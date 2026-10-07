import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useState, useEffect, useLayoutEffect, useRef, type DragEvent } from 'react'
import type { Activity, SystemState } from '@shared/types'
import type { Rect } from '@shared/hitbox'
import { present } from '@shared/present'
import { spring, pop, contentIn, contentOut, morphSpring, sizeRank } from '../anim/spring'
import { sound } from '../sound'
import { useHoverIntent } from './useHoverIntent'
import { Hello, Peek } from './states/Peek'
import { IdlePill } from './states/IdlePill'
import { MediaCard } from './states/MediaCard'
import { ApprovalCard } from './states/ApprovalCard'
import { CompactMedia } from './states/CompactMedia'
import { DetachedCircle } from './states/DetachedCircle'
import { NotificationCard } from './states/NotificationCard'
import { Hub, savedTab, rememberTab, type HubTab } from './hub/Hub'
import { Rail } from './hub/Rail'
import { MessageCard } from './states/MessageCard'
import { ClaudeCard, CompactClaude } from './states/ClaudeActivity'
import { useVoice } from './voice/useVoice'
import type { ClaudeView } from '@shared/claude'
import { useDock } from './useDock'
import { EDGE_MARGIN, islandTop } from '@shared/dock'
import { Character, useCharacter } from './character/Character'
import { PACKAGE_TABS, type PackageTab } from '@shared/packages'
import type { DocsAdded } from '@shared/docs'
import type { DocsIncoming } from './hub/DocsView'
import { errorText } from './hub/common'

/** A tab whose package is turned off. */
const tabOff = (t: HubTab, on: PackageTab[]) => (PACKAGE_TABS as string[]).includes(t) && !on.includes(t as PackageTab)

/** Files dragged over the island (and not, say, text). */
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * What the island turns into while files are dragged over it: a pocket the
 * character leans into. Once dropped, it swallows them while they're added.
 */
function DropCard({ count, adding }: { count: number; adding: boolean }) {
  const files = count > 1 ? `${count} files` : count === 1 ? '1 file' : 'files'
  return (
    <div className={`card drop-card${adding ? ' adding' : ''}`}>
      <div className="drop-text">
        <div className="title">{adding ? `Adding ${files}…` : `Drop ${files} to add to Documents`}</div>
        <div className="caption">PDFs, Word, Excel, slides or text</div>
      </div>
      <Character mood={adding ? 'working' : 'listening'} size={46} color="#30d158" />
    </div>
  )
}

/** How far the blurred backdrop extends past each glass piece (see styles.css). */
const FROST_BLEED = 40

/** Close the Control Center this long after the cursor leaves the island. */
const PANEL_CLOSE_MS = 1500

export function Island({ activities }: { activities: Activity[] }) {
  const character = useCharacter()
  const [hover, setHover] = useState(false)
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
  const { side, anchor, dragging, handlers, consumeDragClick } = useDock()
  const atTop = side === 'top'
  const top = atTop ? EDGE_MARGIN : islandTop(anchor, size.h, areaH)
  /** Left edge of the island in the window: on an edge, or centered at the top. */
  const leftFor = (w: number) =>
    side === 'left' ? EDGE_MARGIN : atTop ? Math.round((window.innerWidth - w) / 2) : window.innerWidth - EDGE_MARGIN - w

  useEffect(() => window.island.onSysState(setSys), [])

  // Tabs of the packages that are turned on (Settings → Packages).
  const [pkgTabs, setPkgTabs] = useState<PackageTab[] | null>(null)
  useEffect(() => window.island.onPackages?.(setPkgTabs), [])
  useEffect(() => {
    if (pkgTabs && tabOff(tab, pkgTabs)) setTab('controls')
  }, [pkgTabs, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drop files on the island to add them to Documents (when it's turned on).
  const docsOn = !!window.island.docs && (!pkgTabs || pkgTabs.includes('docs'))
  const [dropping, setDropping] = useState(false)
  const [dragCount, setDragCount] = useState(0)
  // Dropped files being added: the character swallows them meanwhile.
  const [adding, setAdding] = useState(0)
  const [incoming, setIncoming] = useState<DocsIncoming | null>(null)
  const lastOver = useRef(0)
  const dropFiles = async (files: File[]) => {
    const paths = files.map((f) => window.island.docs.pathFor(f)).filter(Boolean)
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
  const dropHandlers = docsOn
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          lastOver.current = performance.now()
          setDropping(true)
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return
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
          if (!hasFiles(e)) return
          e.preventDefault()
          setDropping(false)
          void dropFiles(Array.from(e.dataTransfer.files))
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
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const openClaude = () => {
    setTab('claude')
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
  // Hello, once a day: a short introduction that hover or a click ends.
  const [hello, setHello] = useState<{ first: boolean; tip: boolean } | null>(null)
  useEffect(
    () =>
      window.island.onGreet?.((g) => {
        setHello({ first: g.first, tip: false })
        if (g.first) setTimeout(() => setHello((h) => h && { ...h, tip: true }), 1600)
        setTimeout(() => setHello(null), g.first ? 3800 : 2400)
      }),
    [],
  )
  // The main process's cursor loop is the source of truth for hover: DOM
  // mouseleave is not delivered once the window turns click-through.
  useEffect(() => window.island.onHover(setHover), [])

  // Hover intent: a short rest peeks, a longer one opens the full card.
  const stage = useHoverIntent(hover && !panel && !dropping)
  const p = present(activities, { expanded: stage === 'full' })
  const isApproval = p.mode !== 'idle' && p.primary.kind === 'approval'
  // The Control Center takes over when opened, unless an approval needs you.
  const showPanel = panel && !isApproval
  const peeking = stage === 'peek' && !showPanel && !dropping && p.mode !== 'expanded'

  useEffect(() => window.island.setPanel(showPanel), [showPanel])

  // Keep a notification / message open while it's hovered or being answered.
  const transientId =
    p.mode !== 'idle' &&
    (p.primary.kind === 'notification' || p.primary.kind === 'message' || p.primary.id === 'claude-done')
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
    const measure = () => setSize({ w: outer.offsetWidth, h: outer.offsetHeight })
    const onResize = () => setAreaH(window.innerHeight)
    const ro = new ResizeObserver(measure)
    ro.observe(outer)
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
  }, [side, top, size.w, size.h, areaH])
  // The page can load before the main process listens: report again when asked.
  useEffect(
    () =>
      window.island.onRectRequest?.(() => {
        if (lastRect.current) window.island.reportRect(lastRect.current)
      }),
    [],
  )

  const key = showPanel
    ? 'panel'
    : dropping || adding
      ? 'drop'
      : peeking
        ? `peek:${p.mode === 'idle' ? 'idle' : p.primary.id}`
        : hello && p.mode === 'idle'
          ? `hello:${hello.tip ? 'tip' : 'hi'}`
          : p.mode === 'idle'
            ? 'idle'
            : `${p.mode}:${p.primary.kind}:${p.primary.id}`

  // Growing uses the open spring, shrinking the close one (no bounce).
  const shown = useRef({ key, spring: spring as ReturnType<typeof morphSpring> })
  if (shown.current.key !== key) shown.current = { key, spring: morphSpring(shown.current.key, key) }
  const shell = shown.current.spring

  // The island's little sounds (when turned on), one per change of state.
  const heard = useRef(key)
  useEffect(() => {
    const was = heard.current
    heard.current = key
    if (was === key) return
    if (key.startsWith('expanded:approval:')) return sound('ask')
    if (key === 'expanded:claude:claude-done' && p.mode === 'expanded' && p.primary.kind === 'claude') return sound(p.primary.run.phase === 'error' ? 'error' : 'done')
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
    }
    if (!isApproval) {
      setPanel((v) => !v)
    }
  }

  return (
    <div
      ref={outerRef}
      className={`island-outer ${side}${dragging ? ' dragging' : ''}${showPanel ? ' with-rail' : ''}`}
      style={atTop ? { top, left: leftFor(size.w) } : { top, [side]: EDGE_MARGIN }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      {...handlers}
      {...dropHandlers}
    >
      {/* Rounded with border-radius set here, not a clip shape: the layout
          animation resizes with a scale transform, and Framer Motion corrects
          border-radius for it, so the corners stay round while it grows. */}
      <motion.div className="island" layout transition={reduce ? { duration: 0.16 } : shell} style={{ borderRadius: 26 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={key}
            layout
            // Content grows out of / sinks back into the docked edge.
            style={{ transformOrigin: atTop ? 'center top' : side === 'left' ? 'left center' : 'right center' }}
            initial={enter}
            animate={soft ? { opacity: 1, scale: 1, x: 0, y: 0, filter: 'blur(0px)' } : { opacity: 1, scale: 1, x: 0, y: 0 }}
            transition={reduce ? { duration: 0.16 } : contentIn}
            exit={leave}
          >
            {showPanel ? (
              <Hub sys={sys} tab={tab} onTyping={setTyping} claude={claude} voice={voice} incoming={incoming} dropping={dropping} />
            ) : dropping || adding ? (
              <DropCard count={adding || dragCount} adding={adding > 0} />
            ) : peeking ? (
              <Peek activity={p.mode === 'idle' ? null : p.primary} canDrop={docsOn} />
            ) : hello && p.mode === 'idle' ? (
              <Hello tip={hello.tip} />
            ) : p.mode === 'idle' ? (
              <IdlePill />
            ) : p.primary.kind === 'approval' ? (
              <ApprovalCard request={p.primary.request} queued={p.queued} />
            ) : p.primary.kind === 'notification' ? (
              <NotificationCard
                id={p.primary.id}
                notification={p.primary.notification}
                queued={p.queued}
              />
            ) : p.primary.kind === 'message' ? (
              <MessageCard
                id={p.primary.id}
                message={p.primary.message}
                queued={p.queued}
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
                <CompactClaude run={p.primary.run} />
              )
            ) : p.mode === 'expanded' ? (
              <MediaCard media={p.primary.media} />
            ) : (
              <CompactMedia media={p.primary.media} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

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
        {showPanel && (
          // Section icons float beside the panel as their own glass pill.
          <motion.div
            key="rail"
            className="island rail-shell"
            initial={{ opacity: 0, scale: 0.6, x: side === 'left' ? -16 : atTop ? -16 : 16 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            // A short fixed fade out: the rail must be gone promptly, or its
            // (invisible) box keeps the island's clickable area large.
            exit={{ opacity: 0, scale: 0.6, x: side === 'left' ? -16 : atTop ? -16 : 16, transition: { duration: 0.16 } }}
            // Follows the panel a beat later.
            transition={{ ...pop, delay: 0.04 }}
          >
            <Rail tab={tab} onTab={setTab} usage={claude?.usage} hidden={pkgTabs ? PACKAGE_TABS.filter((t) => !pkgTabs.includes(t)) : []} />
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
            <DetachedCircle activity={p.detached} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
