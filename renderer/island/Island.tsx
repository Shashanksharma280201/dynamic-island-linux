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
import { squirclePath } from './squircle'

export function Island({ activities }: { activities: Activity[] }) {
  const [hover, setHover] = useState(false)
  const [panel, setPanel] = useState(false)
  const [sys, setSys] = useState<SystemState | null>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  const setH = (b: boolean) => {
    setHover(b)
    ;(window as any).island.setHover(b)
  }

  useEffect(() => {
    ;(window as any).island.onSysState((s: SystemState) => setSys(s))
  }, [])

  const p = present(activities, { expanded: hover })
  const isApproval = p.mode !== 'idle' && p.primary.kind === 'approval'
  // The Control Center takes over when opened, unless an approval needs you.
  const showPanel = panel && !isApproval
  const sysOrDefault: SystemState = sys ?? {
    volume: 0,
    muted: false,
    wifi: false,
    bluetooth: false,
    brightness: null,
  }

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const outer = outerRef.current
      if (outer) {
        const b = outer.getBoundingClientRect()
        ;(window as any).island.reportRect({ x: b.x, y: b.y, width: b.width, height: b.height })
      }
      const shell = shellRef.current
      if (shell) {
        const s = shell.getBoundingClientRect()
        if (s.width > 1 && s.height > 1) {
          const r = Math.min(s.height / 2, 28)
          shell.style.clipPath = `path('${squirclePath(s.width, s.height, r, 0.7)}')`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const key = showPanel
    ? 'panel'
    : p.mode === 'idle'
      ? 'idle'
      : `${p.mode}:${p.primary.kind}:${p.primary.id}`

  return (
    <div
      ref={outerRef}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        filter: 'drop-shadow(0 10px 26px rgba(0,0,0,0.5))',
      }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => {
        if (!isApproval) setPanel((v) => !v)
      }}
    >
      <motion.div ref={shellRef} className="island" layout transition={spring}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={key}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={contentFade}
          >
            {showPanel && <ControlCenter sys={sysOrDefault} />}
            {!showPanel && p.mode === 'idle' && <IdlePill />}
            {!showPanel &&
              (p.mode === 'compact' || p.mode === 'expanded') &&
              p.primary.kind === 'media' && <MediaCard media={p.primary.media} />}
            {!showPanel &&
              (p.mode === 'compact' || p.mode === 'expanded') &&
              p.primary.kind === 'approval' && <ApprovalCard request={p.primary.request} />}
            {!showPanel &&
              (p.mode === 'compact' || p.mode === 'expanded') &&
              p.primary.kind === 'notification' && (
                <NotificationCard notification={p.primary.notification} />
              )}
            {!showPanel && p.mode === 'minimal' && p.primary.kind === 'media' && (
              <CompactMedia media={p.primary.media} />
            )}
            {!showPanel && p.mode === 'minimal' && p.primary.kind === 'approval' && (
              <ApprovalCard request={p.primary.request} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {!showPanel && p.mode === 'minimal' && (
        <motion.div
          layout
          className="island"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
          style={{ borderRadius: 999 }}
        >
          <DetachedCircle activity={p.detached} />
        </motion.div>
      )}
    </div>
  )
}
