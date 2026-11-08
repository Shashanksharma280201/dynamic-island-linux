import type { BrainView } from '@shared/brain'
import type { JobId } from '@shared/loop'
import { whenText } from '@shared/privacy'
import { useAction } from './Settings'

const at = (t: number) => {
  const d = new Date(t)
  const day = d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString([], { weekday: 'short' })
  return `${day} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/** Settings › Second brain › The loop: each job and how it last went, the evening filing, and today's card. */
export function LoopBlock({ b }: { b: BrainView }) {
  const loop = b.loop
  const { run, error, busy } = useAction()
  if (!loop) return null
  const f = loop.filing
  return (
    <>
      <div className="brain-block loop-block">
        <div>The loop</div>
        <div className="hint">Jobs that keep your brain up to date. One the computer slept through runs as soon as it wakes. Each says how it went; one that didn’t run says so.</div>
        <div className="loop-jobs">
          {loop.jobs.map((j) => (
            <div key={j.id} className="loop-job" data-job={j.id}>
              <span className={`loop-dot ${!j.on ? 'off' : j.ok === null ? 'none' : j.ok ? 'ok' : 'bad'}`} aria-hidden="true" />
              <div className="loop-main">
                <div>
                  {j.label}
                  {loop.running === j.id && <span className="hint"> · running…</span>}
                </div>
                <div className="hint">
                  {!j.on ? 'Off.' : j.ok === null ? 'Not run yet.' : `${j.note} (${whenText(j.lastRun)})`} Next: {at(j.next)}.
                </div>
              </div>
              <button className="secondary small" disabled={!!loop.running || busy || !j.on} onClick={() => run(() => window.settings.brain.runJob(j.id as JobId))}>
                Run now
              </button>
              <input type="checkbox" className="switch" checked={j.on} aria-label={`${j.label} on`} onChange={(e) => run(() => window.settings.brain.jobOn(j.id as JobId, e.target.checked))} />
            </div>
          ))}
        </div>
      </div>
      {f && f.moves.length > 0 && (
        <div className="brain-block loop-filing">
          <div>{f.applied ? 'Filed' : 'Tonight’s filing'}</div>
          <div className="hint">{f.applied ? 'These notes left the inbox. Undo puts them back.' : 'Where each inbox note would go. Nothing moves until you apply it; every move can be undone.'}</div>
          <div className="loop-moves">
            {f.moves.slice(0, 30).map((m) => (
              <div key={m.from} className="loop-move">
                <span className="loop-from">{m.from.replace(/^01-inbox\//, '')}</span>
                <span className="hint"> → {m.to.split('/').slice(0, -1).join('/')}/ · {m.why}</span>
              </div>
            ))}
          </div>
          <div className="row">
            {f.applied ? (
              <button className="secondary" disabled={busy} onClick={() => run(() => window.settings.brain.filing('undo'))}>
                Undo
              </button>
            ) : (
              <>
                <button disabled={busy} onClick={() => run(() => window.settings.brain.filing('apply'))}>
                  Apply
                </button>
                <button className="secondary" disabled={busy} onClick={() => run(() => window.settings.brain.filing('dismiss'))}>
                  Not now
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {loop.card && loop.card.state !== 'done' && (
        <div className="brain-block loop-card">
          <div>This morning’s one thing</div>
          <div className="loop-one">{loop.card.one}</div>
          {loop.card.why && <div className="hint">{loop.card.why}</div>}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </>
  )
}
