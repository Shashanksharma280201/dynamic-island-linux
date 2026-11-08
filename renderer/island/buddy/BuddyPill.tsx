import { walkthrough } from '@shared/buddy'
import type { Buddy } from './useBuddy'

/** Is there anything of the buddy's to show on the island? */
export function buddyShown(b: Buddy): boolean {
  return b.listen !== 'idle' || b.view.phase !== 'idle' || !!b.view.error || !!b.micError
}

/** The buddy on the island: listening, thinking, its captions, and the steps of a walkthrough. */
export function BuddyPill({ b, name }: { b: Buddy; name: string }) {
  const v = b.view
  const error = b.micError ?? v.error
  const steps = v.points.length
  // A walkthrough shows the step it's on; any other answer, what's being said (or all of it).
  const stepLine = steps > 1 ? walkthrough(v.reply, steps).steps?.[v.step] : undefined
  const status =
    b.listen === 'preparing'
      ? 'Getting speech ready…'
      : b.listen === 'listening'
        ? 'Listening…'
        : b.listen === 'transcribing'
          ? 'One moment…'
          : v.phase === 'thinking'
            ? 'Looking at your screen…'
            : ''
  return (
    <div className={`buddy-pill${error ? ' error' : ''}`} data-phase={b.listen !== 'idle' ? b.listen : v.phase}>
      <div className="buddy-head">
        <span className="buddy-glyph" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="14" height="14">
            <path d="M10 2.5l1.7 4.6 4.8 1.7-4.8 1.7L10 15.2l-1.7-4.7L3.5 8.8l4.8-1.7z" fill="currentColor" />
          </svg>
        </span>
        <span className="buddy-name">{name}</span>
        {steps > 1 && v.phase !== 'thinking' && (
          <span className="buddy-step">
            Step {v.step + 1} of {steps}
          </span>
        )}
        <span className="spacer" />
        {(v.phase === 'speaking' || v.phase === 'pointing' || error) && (
          <button className="buddy-x" aria-label="Stop" title="Stop" onClick={() => (error ? b.dismiss() : b.cmd('stop'))}>
            ×
          </button>
        )}
      </div>
      {b.listen === 'listening' && (
        <div className="buddy-level" aria-hidden="true">
          {[0.5, 0.8, 1, 0.8, 0.5].map((k, i) => (
            <span key={i} style={{ transform: `scaleY(${0.25 + Math.min(1, b.level * k * 1.6)})` }} />
          ))}
        </div>
      )}
      {error ? (
        <div className="buddy-text buddy-error" role="alert">
          {error}
        </div>
      ) : status ? (
        <div className="buddy-text muted">{status}</div>
      ) : (
        <div className="buddy-text" aria-live="polite">
          {v.caption || stepLine || v.reply}
        </div>
      )}
      {v.heard && !error && (v.phase === 'thinking' || b.listen === 'transcribing') && <div className="buddy-heard">“{v.heard}”</div>}
      {steps > 1 && (v.phase === 'pointing' || v.phase === 'speaking') && !error && (
        <div className="buddy-actions">
          <button className="pill small" disabled={v.step === 0} onClick={() => b.cmd('back')}>
            Back
          </button>
          <button className="pill primary small" onClick={() => b.cmd('next')}>
            {v.step + 1 < steps ? 'Next' : 'Done'}
          </button>
        </div>
      )}
      {v.blanked > 0 && v.phase !== 'thinking' && !error && (
        <div className="buddy-note">
          {v.blanked} private {v.blanked === 1 ? 'window was' : 'windows were'} blacked out
        </div>
      )}
    </div>
  )
}
