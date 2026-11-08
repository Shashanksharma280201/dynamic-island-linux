import { useEffect, useState } from 'react'
import { elapsed } from '@shared/calls'

function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

const hm = (t: number) => new Date(t).toTimeString().slice(0, 5)

/** On the capsule while a call is recorded: a red dot, "Call notes" and the time. */
export function CompactCall({ started }: { started: number }) {
  const now = useNow()
  return (
    <div className="compact call-compact" title="Recording a call: the audio stays on this computer and is deleted once it's made out">
      <span className="rec-dot" aria-hidden="true" />
      <span className="call-label">Call notes</span>
      <span className="call-time">{elapsed(now - started)}</span>
    </div>
  )
}

/** Opened: when it started, how long, and Stop. */
export function CallCard({ started }: { started: number }) {
  const now = useNow()
  return (
    <div className="card call-card" onClick={(e) => e.stopPropagation()}>
      <div className="card-head">
        <span className="rec-dot" aria-hidden="true" />
        <span className="app-name">Call notes</span>
        <span className="spacer" />
        <span className="time">since {hm(started)}</span>
      </div>
      <div className="call-big">{elapsed(now - started)}</div>
      <div className="caption">Your microphone and what your speakers play, made out on this computer. The audio is deleted after.</div>
      <div className="call-actions">
        <button className="pill danger small" onClick={() => void window.island.os('calls.stop')}>
          Stop and make notes
        </button>
      </div>
    </div>
  )
}
