import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { PinIcon } from '../icons'

/** After a hover, a card gets this long before it closes (TransientCards' grace). */
const GRACE_MS = 2500

/**
 * How long until a card closes by itself: a thin bar that runs down, stops
 * while you hover the card (it stays open then), and finishes in a short
 * grace period once you leave. The pin keeps the card until you close it.
 */
export function CloseBar({ id, ms, held, showPin }: { id: string; ms: number; held: boolean; showPin: boolean }) {
  const bar = useRef<HTMLSpanElement | null>(null)
  // Each run: from what's left of the bar, over how long.
  const [run, setRun] = useState({ n: 0, from: 1, ms })
  const wasHeld = useRef(false)
  useEffect(() => {
    if (held) {
      wasHeld.current = true
      return
    }
    if (!wasHeld.current) return
    wasHeld.current = false
    const el = bar.current
    const left = el?.parentElement ? el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width : 1
    setRun((r) => ({ n: r.n + 1, from: Math.max(0.04, Math.min(1, left || 1)), ms: GRACE_MS }))
  }, [held])
  const pin = (e: MouseEvent) => {
    e.stopPropagation()
    window.island.pin(id)
  }
  return (
    <div className="close-row">
      <div className={`close-bar${held ? ' held' : ''}`} aria-hidden>
        <span
          key={run.n}
          ref={bar}
          style={{ ['--from' as string]: run.from, animationDuration: `${run.ms}ms`, animationPlayState: held ? 'paused' : 'running' }}
        />
      </div>
      {showPin && (
        <button className="pin-btn" title="Keep it open" aria-label="Keep it open" onClick={pin}>
          <PinIcon size={11} />
        </button>
      )}
    </div>
  )
}
