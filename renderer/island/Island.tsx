import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { Activity, SystemState } from '@shared/types'
import type { Rect } from '@shared/hitbox'
import { present } from '@shared/present'
import { spring, contentFade } from '../anim/spring'
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

/** How far the blurred backdrop extends past each glass piece (see styles.css). */
const FROST_BLEED = 40

/** Close the Control Center this long after the cursor leaves the island. */
const PANEL_CLOSE_MS = 1500

export function Island({ activities }: { activities: Activity[] }) {
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
  // The main process's cursor loop is the source of truth for hover: DOM
  // mouseleave is not delivered once the window turns click-through.
  useEffect(() => window.island.onHover(setHover), [])

  const p = present(activities, { expanded: hover })
  const isApproval = p.mode !== 'idle' && p.primary.kind === 'approval'
  // The Control Center takes over when opened, unless an approval needs you.
  const showPanel = panel && !isApproval

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
  }, [hover])
  useEffect(() => {
    if (!panel) setTyping(false)
  }, [panel])

  // Auto-close the panel once the cursor has left for a moment (not while typing).
  useEffect(() => {
    // Also stays open while you're talking to Claude.
    if (!panel || hover || typing || voice.phase !== 'idle' || pinned.current) return
    const t = setTimeout(() => setPanel(false), PANEL_CLOSE_MS)
    return () => clearTimeout(t)
  }, [panel, hover, typing, voice.phase])

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
    : p.mode === 'idle'
      ? 'idle'
      : `${p.mode}:${p.primary.kind}:${p.primary.id}`

  const onClick = () => {
    if (consumeDragClick()) return
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
    >
      {/* Rounded with border-radius set here, not a clip shape: the layout
          animation resizes with a scale transform, and Framer Motion corrects
          border-radius for it, so the corners stay round while it grows. */}
      <motion.div className="island" layout transition={spring} style={{ borderRadius: 26 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={key}
            layout
            // Content grows out of / sinks back into the docked edge.
            style={{ transformOrigin: atTop ? 'center top' : side === 'left' ? 'left center' : 'right center' }}
            // Opacity and transform only: a blur filter repaints the whole
            // panel every frame and stutters on big content like Chats.
            initial={{ opacity: 0, scale: 0.92, ...(atTop ? { y: -8 } : { x: side === 'left' ? -8 : 8 }) }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, ...(atTop ? { y: -8 } : { x: side === 'left' ? -8 : 8 }) }}
            transition={contentFade}
          >
            {showPanel ? (
              <Hub sys={sys} tab={tab} onTyping={setTyping} claude={claude} voice={voice} />
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
                <ClaudeCard id={p.primary.id} run={p.primary.run} onOpen={openClaude} />
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
            transition={spring}
          >
            <Rail tab={tab} onTab={setTab} usage={claude?.usage} />
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
