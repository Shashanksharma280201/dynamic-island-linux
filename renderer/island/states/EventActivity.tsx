import type { MouseEvent } from 'react'
import { untilShort, untilText, type SoonEvent } from '@shared/dashboard'
import { clockText } from '@shared/clock'
import { useMinute } from './NotchClock'

/** A small calendar page with today's date (or whatever is given) on it. */
export function CalendarGlyph({ size = 28, children }: { size?: number; children?: React.ReactNode }) {
  return (
    <span className="event-glyph" style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }} aria-hidden>
      <span>{children ?? new Date().getDate()}</span>
    </span>
  )
}

/** One line on when and where: "in 12 min · 11:00 · Room 2". Pure. */
export function eventLine(e: SoonEvent, now: number): string {
  return [untilText(e.at, now), clockText(new Date(e.at)), e.where].filter(Boolean).join(' · ')
}

/**
 * Something on your calendar is about to start: how far off it is, beside a
 * calendar page (on a side edge, where the capsule is narrow, just "12m").
 */
export function CompactEvent({ event, notch = false }: { event: SoonEvent; notch?: boolean }) {
  const now = useMinute().getTime()
  return (
    <div className="capsule event-capsule" title={`${event.title} · ${eventLine(event, now)} · click for Today`}>
      <span className="event-in">{untilText(event.at, now)}</span>
      <CalendarGlyph size={notch ? 28 : 34} />
      <span className="event-in-short">{untilShort(event.at, now)}</span>
    </div>
  )
}

/** As a second activity's small bubble: the calendar page. */
export function EventBubble({ event }: { event: SoonEvent }) {
  const now = useMinute().getTime()
  return (
    <div className="detached-glyph event-bubble" title={`${event.title} · ${eventLine(event, now)}`}>
      <CalendarGlyph size={22} />
    </div>
  )
}

/** Hovered: what it is, when and where. */
export function EventCard({ event, onOpen }: { event: SoonEvent; onOpen: () => void }) {
  const now = useMinute().getTime()
  const act = (e: MouseEvent, fn: () => void) => {
    e.stopPropagation()
    fn()
  }
  return (
    <div className="card event-card" onClick={(e) => e.stopPropagation()}>
      <div className="card-head">
        <span className="app-name">Next up</span>
        <span className="spacer" />
        <span className="when">at {clockText(new Date(event.at))}</span>
      </div>
      <div className="event-card-body">
        <CalendarGlyph size={44} />
        <div className="event-card-text">
          <div className="headline ellipsis">{event.title}</div>
          <div className="caption ellipsis">{[untilText(event.at, now), event.where].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="timer-actions">
        <button className="pill primary small" onClick={(e) => act(e, onOpen)}>
          Today
        </button>
      </div>
    </div>
  )
}
