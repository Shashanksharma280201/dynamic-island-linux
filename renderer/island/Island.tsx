import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import type { Activity, SystemState } from '@shared/types'
import { present } from '@shared/present'
import { spring, contentFade } from '../anim/spring'
import { IdlePill } from './states/IdlePill'
import { MediaCard } from './states/MediaCard'
import { ApprovalCard } from './states/ApprovalCard'
import { CompactMedia } from './states/CompactMedia'
import { DetachedCircle } from './states/DetachedCircle'
import { NotificationCard } from './states/NotificationCard'
import { ControlCenter } from './states/ControlCenter'
import { MessageCard } from './states/MessageCard'
import { squirclePath } from './squircle'

/** Close the Control Center this long after the cursor leaves the island. */
const PANEL_CLOSE_MS = 1500

export function Island({ activities }: { activities: Activity[] }) {
  const [hover, setHover] = useState(false)
  const [panel, setPanel] = useState(false)
  const [sys, setSys] = useState<SystemState | null>(null)
  const [replying, setReplying] = useState(false)
  const outerRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

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

  // Auto-close the Control Center once the cursor has left for a moment.
  useEffect(() => {
    if (!panel || hover) return
    const t = setTimeout(() => setPanel(false), PANEL_CLOSE_MS)
    return () => clearTimeout(t)
  }, [panel, hover])

  // Report the hit area whenever the island's layout box changes. The outer
  // box is never transformed, so its rect is the settled (final) size.
  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const report = () => {
      const b = outer.getBoundingClientRect()
      window.island.reportRect({ x: b.x, y: b.y, width: b.width, height: b.height })
    }
    const ro = new ResizeObserver(report)
    ro.observe(outer)
    window.addEventListener('resize', report)
    report()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  // Squircle clip in the shell's own (untransformed) coordinate space.
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const ro = new ResizeObserver(() => {
      const w = shell.offsetWidth
      const h = shell.offsetHeight
      if (w > 1 && h > 1) {
        shell.style.clipPath = `path('${squirclePath(w, h, Math.min(h / 2, 28), 0.7)}')`
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
    if (p.mode !== 'idle' && !showPanel) {
      if (p.primary.kind === 'notification') return window.island.dismiss(p.primary.id)
      if (p.primary.kind === 'message') return // has its own buttons
    }
    if (!isApproval) setPanel((v) => !v)
  }

  return (
    <div
      ref={outerRef}
      className="island-outer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <motion.div ref={shellRef} className="island" layout transition={spring}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={key}
            layout
            initial={{ opacity: 0, scale: 0.85, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.85, filter: 'blur(4px)' }}
            transition={contentFade}
          >
            {showPanel ? (
              <ControlCenter sys={sys} />
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
        {!showPanel && p.mode === 'minimal' && (
          // Buds off the pill's trailing edge and merges back into it.
          <motion.div
            key="detached"
            className="island detached"
            initial={{ opacity: 0, scale: 0.3, x: -28 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.3, x: -28 }}
            transition={spring}
          >
            <DetachedCircle activity={p.detached} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
