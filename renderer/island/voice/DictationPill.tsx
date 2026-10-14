import { useEffect, useRef, useState } from 'react'
import type { Dictation } from './useDictation'
import { Character } from '../character/Character'
import { AGENT_INK, Orb } from '../../orb/Orb'
import { useShortcutLabel } from '../useShortcuts'

/** Nine dots that rise and fall with your voice (a little wave even when quiet). */
function VoiceDots({ level }: { level: number }) {
  const [t, setT] = useState(0)
  const smooth = useRef(0)
  smooth.current += (level - smooth.current) * 0.35
  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      setT(now / 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const shape = [0.35, 0.55, 0.75, 0.9, 1, 0.9, 0.75, 0.55, 0.35]
  return (
    <span className="voice-dots" aria-hidden>
      {shape.map((k, i) => {
        const wave = 0.18 + 0.12 * Math.sin(t * 6 + i * 0.8)
        const h = 4 + 16 * Math.min(1, k * (wave + smooth.current * 1.4))
        return <span key={i} style={{ height: h }} />
      })}
    </span>
  )
}

/** Dictating: listening, writing it down, then what was typed (or why not). */
export function DictationPill({ d }: { d: Dictation }) {
  const key = useShortcutLabel('dictate')
  const label =
    d.phase === 'preparing'
      ? 'Getting speech ready…'
      : d.phase === 'listening'
        ? 'Listening'
        : d.phase === 'transcribing'
          ? 'Writing it down…'
          : d.phase === 'typed'
            ? d.text
            : d.text
  return (
    <div className={`dictate ${d.phase}`} data-phase={d.phase}>
      <Character mood={d.phase === 'error' ? 'error' : d.phase === 'typed' ? 'done' : d.phase === 'transcribing' ? 'writing' : 'listening'} size={26} ring={false} />
      {d.phase === 'listening' ? (
        <VoiceDots level={d.level} />
      ) : d.phase === 'transcribing' || d.phase === 'preparing' ? (
        <Orb state={d.phase === 'preparing' ? 'connecting' : 'weaving'} size={18} color={AGENT_INK} />
      ) : null}
      <span className={`dictate-text ellipsis${d.phase === 'typed' ? ' typed' : ''}`} title={label}>
        {d.phase === 'typed' ? `“${label}”` : label}
      </span>
      {d.phase === 'listening' && (
        <span className="dictate-hint">
          <kbd className="key">{key}</kbd> to finish
        </span>
      )}
      {(d.phase === 'listening' || d.phase === 'preparing') && (
        <button className="dictate-x" aria-label="Cancel" title="Cancel" onClick={(e) => (e.stopPropagation(), d.cancel())}>
          ×
        </button>
      )}
    </div>
  )
}
