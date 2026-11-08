import { useEffect, useState } from 'react'
import type { CallsView } from '@shared/os'
import { moneyText } from '@shared/engine'

/** Call notes, kept fresh. */
export function useCalls(): [CallsView | null, () => void] {
  const [v, setV] = useState<CallsView | null>(null)
  const load = () =>
    window.island
      .os<CallsView>('calls.view')
      .then(setV)
      .catch(() => {})
  useEffect(() => {
    void load()
    const off = window.island.onOs((t) => t === 'calls' && void load())
    return off
  }, [])
  return [v, load]
}

const plain = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Record a call, or stop. */
export function RecordButton({ recording, onError }: { recording: boolean; onError: (e: string) => void }) {
  return (
    <button
      className={`today-record${recording ? ' on' : ''}`}
      title={recording ? 'Stop recording and make the notes' : 'Record a call: your microphone and speakers, made out on this computer'}
      onClick={() =>
        void window.island
          .os(recording ? 'calls.stop' : 'calls.start')
          .catch((e) => onError(plain(e)))
      }
    >
      <span className="rec-dot" aria-hidden="true" />
      {recording ? 'Stop' : 'Record call'}
    </button>
  )
}

/** The latest call's notes: a summary, to-dos, and Add to brain. */
export function CallNotesCard({ v }: { v: CallsView }) {
  const c = v.list.find((x) => x.state !== 'recording')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!c || Date.now() - c.started > 24 * 3_600_000) return null
  const act = (fn: Parameters<typeof window.island.os>[0], ...args: unknown[]) => {
    setError(null)
    void window.island.os(fn, ...args).catch((e) => setError(plain(e)))
  }
  const minutes = c.ended ? Math.max(1, Math.round((c.ended - c.started) / 60_000)) : 0
  return (
    <div className={`today-call ${c.state}`}>
      <div className="today-call-head">
        <span className="today-kicker">Call notes</span>
        <span className="today-call-meta">
          {new Date(c.started).toTimeString().slice(0, 5)}
          {minutes ? ` · ${minutes} min` : ''} · audio deleted
        </span>
        <button className="agent-x" aria-label="Forget these notes" title="Forget these notes" onClick={() => act('calls.forget', c.id)}>
          ×
        </button>
      </div>
      {c.state === 'done' ? (
        <>
          <div className="today-call-summary">{c.summary || 'No summary.'}</div>
          {!!c.todos?.length && (
            <ul className="today-call-todos">
              {c.todos.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          <div className="today-one-actions">
            {c.kept ? (
              <span className="today-call-kept">In the brain</span>
            ) : (
              <button className="pill primary small" onClick={() => act('calls.keep', c.id)}>
                Add to brain
              </button>
            )}
            <button className="pill small" onClick={() => setOpen(!open)}>
              {open ? 'Hide transcript' : 'Transcript'}
            </button>
            {c.where && c.where !== 'none' && <span className="today-call-meta">{c.where === 'local' ? 'local model' : 'cloud'} · {moneyText(c.cost ?? null)}</span>}
          </div>
          {open && <div className="today-call-transcript">{c.transcript}</div>}
        </>
      ) : c.state === 'consent' ? (
        <>
          <div className="today-call-summary">{c.line}</div>
          <div className="today-one-actions">
            <button className="pill small" onClick={() => act('calls.plain', c.id)}>
              Plain notes instead
            </button>
            <button className="pill primary small" onClick={() => act('calls.sum', c.id, true)}>
              Sum it up there
            </button>
          </div>
        </>
      ) : (
        <div className={`today-call-summary${c.state === 'failed' ? ' error' : ''}`}>{c.line}</div>
      )}
      {error && <div className="agents-error">{error}</div>}
    </div>
  )
}
