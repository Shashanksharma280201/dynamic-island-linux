import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { Activity, SystemState } from '@shared/types'
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
import { squirclePath } from './squircle'
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
  const shellRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [areaH, setAreaH] = useState(window.innerHeight)
  const { side, anchor, dragging, handlers, consumeDragClick } = useDock()
  const top = islandTop(anchor, size.h, areaH)

  useEffect(() => window.island.onSysState(setSys), [])
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
    p.mode !== 'idle' && (p.primary.kind === 'notification' || p.primary.kind === 'message')
      ? p.primary.id
      : null
  const holding = hover || replying
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
    if (!panel || hover || typing || pinned.current) return
    const t = setTimeout(() => setPanel(false), PANEL_CLOSE_MS)
    return () => clearTimeout(t)
  }, [panel, hover, typing])

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
    const ox = side === 'left' ? EDGE_MARGIN : window.innerWidth - EDGE_MARGIN - outer.offsetWidth
    outer.querySelectorAll<HTMLElement>(':scope > .island').forEach((el) => {
      el.style.setProperty('--bgx', `${FROST_BLEED - (ox + el.offsetLeft)}px`)
      el.style.setProperty('--bgy', `${FROST_BLEED - (top + el.offsetTop)}px`)
    })
  })

  // Report the hit area: the settled position and size, not the mid-animation one.
  useLayoutEffect(() => {
    if (!size.w) return
    window.island.reportRect({
      x: side === 'left' ? EDGE_MARGIN : window.innerWidth - EDGE_MARGIN - size.w,
      y: top,
      width: size.w,
      height: size.h,
    })
  }, [side, top, size.w, size.h, areaH])

  // Squircle clip in the shell's own (untransformed) coordinate space.
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const ro = new ResizeObserver(() => {
      const w = shell.offsetWidth
      const h = shell.offsetHeight
      if (w > 1 && h > 1) {
        shell.style.clipPath = `path('${squirclePath(w, h, Math.min(w / 2, h / 2, 26), 0.7)}')`
      }
    })
    ro.observe(shell)
    return () => ro.disconnect()
  }, [])

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
    }
    if (!isApproval) {
      setPanel((v) => !v)
    }
  }

  return (
    <div
      ref={outerRef}
      className={`island-outer ${side}${dragging ? ' dragging' : ''}${showPanel ? ' with-rail' : ''}`}
      style={{ top, [side]: EDGE_MARGIN }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      {...handlers}
    >
      <motion.div ref={shellRef} className="island" layout transition={spring}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={key}
            layout
            // Content grows out of / sinks back into the docked edge.
            style={{ transformOrigin: side === 'left' ? 'left center' : 'right center' }}
            initial={{ opacity: 0, scale: 0.85, x: side === 'left' ? -10 : 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.85, x: side === 'left' ? -10 : 10, filter: 'blur(4px)' }}
            transition={contentFade}
          >
            {showPanel ? (
              <Hub sys={sys} tab={tab} onTyping={setTyping} />
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
            initial={{ opacity: 0, scale: 0.6, x: side === 'left' ? -16 : 16 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: side === 'left' ? -16 : 16 }}
            transition={spring}
          >
            <Rail tab={tab} onTab={setTab} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!showPanel && p.mode === 'minimal' && (
          // Buds off the bottom of the capsule and merges back into it.
          <motion.div
            key="detached"
            className="island detached"
            initial={{ opacity: 0, scale: 0.3, y: -24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.3, y: -24 }}
            transition={spring}
          >
            <DetachedCircle activity={p.detached} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
