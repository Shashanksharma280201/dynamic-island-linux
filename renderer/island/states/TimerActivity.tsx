import { useEffect, useState, type MouseEvent } from 'react'
import { clockLeft, timerFraction, timerLeft, timerLine, timerPaused, timerRunning, type TimerCmd, type TimerView } from '@shared/dashboard'

/** The time now, turning over each second while `on` (and not at all otherwise). */
export function useSecond(on: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [on])
  return now
}

export const timerCmd = (cmd: TimerCmd) => void window.island.os('timer.cmd', cmd).catch(() => {})

/** A ring that fills as the phase goes by; whatever is given sits in its middle. */
export function TimerRing({ fraction, size, stroke = 3, children }: { fraction: number; size: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="timer-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        {/* Nothing gone yet: no mark at all (a round end would leave a dot). */}
        {fraction > 0 && (
          <circle
            className="fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${Math.min(1, fraction) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      {children !== undefined && <span className="timer-ring-in">{children}</span>}
    </span>
  )
}

const PauseGlyph = ({ size = 9 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
    <rect x="1.5" y="1" width="2.6" height="8" rx="1" fill="currentColor" />
    <rect x="5.9" y="1" width="2.6" height="8" rx="1" fill="currentColor" />
  </svg>
)

/** Minutes left, rounded up, for the small places a whole clock doesn't fit. */
const minutesLeft = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))

/**
 * The focus timer on the resting island: what's left beside a ring that
 * fills (on a side edge, where the capsule is narrow, the minutes in the ring).
 */
export function CompactTimer({ timer, notch = false }: { timer: TimerView; notch?: boolean }) {
  const now = useSecond(timerRunning(timer))
  const left = timerLeft(timer, timer, now)
  const paused = timerPaused(timer)
  return (
    <div className="capsule timer-capsule" data-phase={timer.phase} data-paused={paused ? 'yes' : undefined} title={`${timerLine(timer, timer, now)} · click for the Dashboard`}>
      <span className="timer-time">{clockLeft(left)}</span>
      <TimerRing fraction={timerFraction(timer, timer, now)} size={notch ? 28 : 34} stroke={notch ? 3 : 3.5}>
        {paused ? <PauseGlyph /> : <span className="timer-min">{minutesLeft(left)}</span>}
      </TimerRing>
    </div>
  )
}

/** As a second activity's small bubble: the ring, with the minutes left. */
export function TimerBubble({ timer }: { timer: TimerView }) {
  const now = useSecond(timerRunning(timer))
  const left = timerLeft(timer, timer, now)
  return (
    <div className="detached-glyph timer-bubble" data-phase={timer.phase} data-paused={timerPaused(timer) ? 'yes' : undefined} title={timerLine(timer, timer, now)}>
      <TimerRing fraction={timerFraction(timer, timer, now)} size={26} stroke={2.5}>
        {timerPaused(timer) ? <PauseGlyph size={8} /> : minutesLeft(left)}
      </TimerRing>
    </div>
  )
}

/** Hovered: the whole clock, and its buttons. */
export function TimerCard({ timer, onOpen }: { timer: TimerView; onOpen: () => void }) {
  const now = useSecond(timerRunning(timer))
  const paused = timerPaused(timer)
  const act = (e: MouseEvent, fn: () => void) => {
    e.stopPropagation()
    fn()
  }
  return (
    <div className="card timer-card" data-phase={timer.phase} data-paused={paused ? 'yes' : undefined} onClick={(e) => e.stopPropagation()}>
      <div className="card-head">
        <span className="app-name">Focus timer</span>
        <span className="spacer" />
        <span className="when">{timer.done ? `${timer.done} done today` : `${timer.focusMin} minute sessions`}</span>
      </div>
      <div className="timer-card-body">
        <TimerRing fraction={timerFraction(timer, timer, now)} size={58} stroke={5}>
          {paused ? <PauseGlyph size={14} /> : null}
        </TimerRing>
        <div className="timer-card-text">
          <div className="timer-big">{clockLeft(timerLeft(timer, timer, now))}</div>
          <div className="caption">{timer.phase === 'break' ? (paused ? 'Break, paused' : 'Break') : paused ? 'Focus, paused' : 'Focus'}</div>
        </div>
      </div>
      <div className="timer-actions">
        <button className="pill primary small" onClick={(e) => act(e, () => timerCmd(paused ? 'resume' : 'pause'))}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="pill small" onClick={(e) => act(e, () => timerCmd('reset'))}>
          {timer.phase === 'break' ? 'Skip break' : 'Stop'}
        </button>
        <span className="spacer" />
        <button className="plain muted" onClick={(e) => act(e, onOpen)}>
          Dashboard
        </button>
      </div>
    </div>
  )
}
