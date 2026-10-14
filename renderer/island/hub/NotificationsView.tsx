import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThinkingOrb } from 'thinking-orbs'
import { clearedText, groupByApp, type CenterEntry, type CenterView } from '@shared/notifCenter'
import { relativeTime } from '@shared/format'
import { BellIcon, MoonIcon, XIcon } from '../icons'
import { Avatar, useNow } from './common'
import { pop } from '../../anim/spring'

/** How many of an app's notifications show before "N more". */
const PEEK = 2
/** Drag a row this far left (or flick it) to dismiss it. */
const SWIPE = 90

/**
 * Every notification and message the island showed (or kept quiet about in
 * Do Not Disturb), newest first and grouped by app: dismiss one (×, or swipe
 * it left), clear them all (with Undo), or open the chat or mail it's from.
 */
export function NotificationsView({ center, onOpen }: { center: CenterView; onOpen: (tab: 'chats' | 'mail') => void }) {
  const now = useNow()
  const [undo, setUndo] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [leaving, setLeaving] = useState(false)

  // Looking at the list marks what's in it as seen (and anything arriving while it's open).
  useEffect(() => {
    if (center.unseen > 0) void window.island.notifications.seen()
  }, [center.unseen])
  useEffect(() => {
    if (undo === null) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  const clearAll = async () => {
    setLeaving(true)
    // Let the rows sweep away before the list empties.
    await new Promise((r) => setTimeout(r, 220))
    const n = await window.island.notifications.clearAll()
    setLeaving(false)
    if (n > 0) setUndo(n)
  }
  const groups = groupByApp(center.entries)
  const empty = center.entries.length === 0

  return (
    <div className="nc" onClick={(e) => e.stopPropagation()}>
      <div className="nc-head">
        <div className="nc-title">Notifications</div>
        <button
          className={`nc-dnd${center.dnd ? ' on' : ''}`}
          aria-pressed={center.dnd}
          title={center.dnd ? 'Do Not Disturb is on: notifications arrive here quietly' : 'Hold notifications and messages here, quietly'}
          onClick={() => void window.island.notifications.setDnd(!center.dnd)}
        >
          <MoonIcon size={12} />
          {center.dnd ? 'Do Not Disturb' : 'Focus'}
        </button>
        <button className="nc-clear" disabled={empty || leaving} onClick={() => void clearAll()}>
          Clear all
        </button>
      </div>

      {center.dnd && (
        <div className="nc-banner">
          <MoonIcon size={12} />
          <span>Do Not Disturb is on. New notifications wait here without popping up.</span>
          <button className="plain" onClick={() => void window.island.notifications.setDnd(false)}>
            Turn off
          </button>
        </div>
      )}

      {empty ? (
        <div className="nc-empty">
          <ThinkingOrb state="breathing" size={64} theme="dark" dots={0.6} speed={0.7} aria-label="All caught up" />
          <div className="title">You're all caught up</div>
          <div className="caption">Notifications and messages land here, so nothing gets lost when a card closes.</div>
        </div>
      ) : (
        <div className="nc-list">
          <AnimatePresence initial={false}>
            {groups.map((g, gi) => {
              const open = expanded.has(g.app) || g.entries.length <= PEEK + 1
              const shown = open ? g.entries : g.entries.slice(0, PEEK)
              return (
                <motion.section
                  key={g.app}
                  className="nc-group"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={leaving ? { opacity: 0, x: 60, transition: { delay: gi * 0.03, duration: 0.18 } } : { opacity: 1, y: 0, x: 0 }}
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                  transition={pop}
                >
                  <div className="nc-group-head">
                    <span className="nc-app">{g.app}</span>
                    {g.entries.length > PEEK + 1 && (
                      <button
                        className="plain"
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s)
                            if (n.has(g.app)) n.delete(g.app)
                            else n.add(g.app)
                            return n
                          })
                        }
                      >
                        {expanded.has(g.app) ? 'Show less' : `${g.entries.length - PEEK} more`}
                      </button>
                    )}
                    <button
                      className="nc-x"
                      title={`Clear ${g.app}`}
                      aria-label={`Clear ${g.app}`}
                      onClick={() => g.entries.forEach((e) => void window.island.notifications.dismiss(e.id))}
                    >
                      <XIcon size={9} />
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {shown.map((e) => (
                      <Row key={e.id} e={e} now={now} onOpen={onOpen} />
                    ))}
                  </AnimatePresence>
                </motion.section>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {undo !== null && (
          <motion.div className="nc-toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={pop}>
            <span>{clearedText(undo)}</span>
            <button
              className="plain"
              onClick={() => {
                void window.island.notifications.undo()
                setUndo(null)
              }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Row({ e, now, onOpen }: { e: CenterEntry; now: number; onOpen: (tab: 'chats' | 'mail') => void }) {
  const opens = e.source === 'whatsapp' ? 'chats' : e.source === 'mail' ? 'mail' : null
  const dismiss = () => void window.island.notifications.dismiss(e.id)
  return (
    <motion.div
      className={`nc-row${e.seen ? '' : ' unseen'}${e.urgency === 'critical' ? ' critical' : ''}${opens ? ' opens' : ''}`}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, x: -260, transition: { duration: 0.2 } }}
      transition={pop}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.9, right: 0.05 }}
      onDragEnd={(_ev, info) => {
        if (info.offset.x < -SWIPE || info.velocity.x < -600) dismiss()
      }}
      onClick={() => opens && onOpen(opens)}
      title={opens ? `Open in ${opens === 'chats' ? 'Chats' : 'Mail'}` : undefined}
    >
      <span className="nc-icon">{e.icon ? <Avatar name={e.title} src={e.icon} small /> : e.source === 'notification' ? <span className="nc-bell"><BellIcon /></span> : <Avatar name={e.title} small />}</span>
      <span className="nc-text">
        <span className="nc-line">
          <span className="nc-what ellipsis">{e.title}</span>
          <span className="nc-when">{relativeTime(e.at, now)}</span>
        </span>
        {e.body && <span className="nc-body clamp2">{e.body}</span>}
        {e.count > 1 && <span className="nc-count">{e.count} messages</span>}
      </span>
      <button
        className="nc-x"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={(ev) => {
          ev.stopPropagation()
          dismiss()
        }}
      >
        <XIcon size={9} />
      </button>
    </motion.div>
  )
}
