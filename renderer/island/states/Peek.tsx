import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { pop } from '../../anim/spring'
import type { Activity } from '@shared/types'
import { moodFor, type CharacterMood } from '@shared/character'
import { Character, useCharacter } from '../character/Character'
import { formatTime, partOfDay } from '@shared/format'
import { runStatus } from './ClaudeActivity'

/** What a peek says about the island's state, in two short lines. Pure. */
export function peekLines(a: Activity | null, o: { name: string; canDrop: boolean; now: number }): { title: string; sub: string; mood: CharacterMood } {
  if (!a) return { title: `Ask ${o.name} anything`, sub: o.canDrop ? 'Click to open · drop files here' : 'Click to open', mood: 'listening' }
  if (a.kind === 'media') return { title: a.media.title || 'Playing', sub: a.media.artist || 'Now playing', mood: a.media.playing ? 'dancing' : 'idle' }
  if (a.kind === 'claude') {
    const r = a.run
    const project = r.cwd.split('/').filter(Boolean).pop() ?? '~'
    const steps = r.steps ? `${r.steps} step${r.steps === 1 ? '' : 's'} · ` : ''
    return { title: runStatus(r), sub: `${steps}${formatTime((o.now - r.startedAt) / 1000)} · ${project}`, mood: moodFor(r.phase, r.tool?.name) }
  }
  return { title: a.kind === 'notification' ? a.notification.summary : 'Activity', sub: '', mood: 'idle' }
}

/**
 * Hover peek: the capsule widens toward the screen with one line about what's
 * going on. Keep hovering and the full card opens; click to open it now.
 */
export function Peek({ activity, canDrop }: { activity: Activity | null; canDrop: boolean }) {
  const { name } = useCharacter()
  const [now, setNow] = useState(Date.now)
  const ticking = activity?.kind === 'claude'
  useEffect(() => {
    if (!ticking) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [ticking])
  const l = peekLines(activity, { name, canDrop, now })
  return (
    <div className="peek">
      <div className="peek-text">
        {/* A new step rolls up from below, like a departures board. */}
        <div className="peek-title-row">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={l.title} className="peek-title ellipsis" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={pop}>
              {l.title}
            </motion.div>
          </AnimatePresence>
        </div>
        {l.sub && <div className="peek-sub ellipsis">{l.sub}</div>}
      </div>
      <Character mood={l.mood} size={38} track />
    </div>
  )
}

/** Hello, once a day: the character introduces itself (and, the first time, a tip). */
export function Hello({ tip }: { tip: boolean }) {
  const { name } = useCharacter()
  return (
    <div className="peek hello">
      <div className="peek-text">
        <div className="peek-title ellipsis">{tip ? 'Click me or press Ctrl+I' : `Hi, I'm ${name}`}</div>
        <div className="peek-sub ellipsis">{tip ? 'Drag me to any screen edge' : partOfDay(new Date().getHours())}</div>
      </div>
      <Character mood="done" size={38} track />
    </div>
  )
}
