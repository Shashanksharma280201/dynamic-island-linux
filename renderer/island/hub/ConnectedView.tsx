import { useEffect, useState } from 'react'
import type { ConnectedSection, ConnectedState } from '@shared/connected'
import { agoText } from '@shared/format'
import { Empty } from './common'
import { Character } from '../character/Character'
import { toneClass } from '../states/ConnectedActivity'

/** The connected package's state, kept current. */
export function useConnected(): ConnectedState | null {
  const [st, setSt] = useState<ConnectedState | null>(null)
  useEffect(() => {
    let live = true
    window.island.connected
      ?.view()
      .then((v) => live && setSt(v))
      .catch(() => {})
    const off = window.island.connected?.onChanged(setSt)
    return () => {
      live = false
      off?.()
    }
  }, [])
  return st
}

/** A button from the package, asked about first when it says so. */
function ActionButton({ a }: { a: Extract<ConnectedSection, { type: 'actions' }>['actions'][number] }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async () => {
    setBusy(true)
    const res = await window.island.connected.action(a.id).catch((e) => ({ ok: false, message: String(e?.message ?? e) }))
    setBusy(false)
    setConfirming(false)
    setMsg({ ok: res.ok, text: res.message || (res.ok ? 'Done' : 'It didn’t work') })
  }
  if (confirming)
    return (
      <div className="cv-confirm">
        <div className="caption">{a.confirm}</div>
        <div className="cv-confirm-row">
          <button className="pill" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button className={`pill ${a.style === 'danger' ? 'deny danger' : 'primary'}`} disabled={busy} onClick={() => void run()}>
            {busy ? 'Sending…' : a.label}
          </button>
        </div>
      </div>
    )
  return (
    <div className="cv-action">
      <button className={`pill ${a.style === 'danger' ? 'danger' : ''}`} disabled={busy} onClick={() => (a.confirm ? setConfirming(true) : void run())}>
        {a.label}
      </button>
      {msg && <span className={`hint ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</span>}
    </div>
  )
}

function Section({ s }: { s: ConnectedSection }) {
  switch (s.type) {
    case 'stats':
      return (
        <div className="cv-stats">
          {s.title && <div className="group-label">{s.title}</div>}
          <div className="cv-grid">
            {s.items.map((i, n) => (
              <div key={n} className="cv-stat">
                <span className="cv-stat-label">{i.label}</span>
                <span className={`cv-stat-value ${toneClass(i.tone)}`}>{i.value}</span>
              </div>
            ))}
          </div>
        </div>
      )
    case 'list':
      return (
        <div className="svc-section">
          {s.title && <div className="group-label">{s.title}</div>}
          {s.rows.length ? (
            s.rows.map((r, n) => (
              <div key={n} className="svc-row">
                {r.tone && r.tone !== 'neutral' && <span className={`svc-dot ${r.tone === 'up' ? 'good' : r.tone === 'down' ? 'bad' : 'busy'}`} />}
                <span className="svc-text">
                  <span className="svc-title ellipsis">{r.title}</span>
                  {r.subtitle && <span className="svc-sub ellipsis">{r.subtitle}</span>}
                </span>
                {r.value && <span className={`svc-side ${toneClass(r.tone)}`}>{r.value}</span>}
              </div>
            ))
          ) : (
            <div className="svc-empty">{s.empty ?? 'Nothing here'}</div>
          )}
        </div>
      )
    case 'actions':
      return (
        <div className="cv-actions">
          {s.actions.map((a) => (
            <ActionButton key={a.id} a={a} />
          ))}
        </div>
      )
    case 'note':
      return <div className={`svc-note cv-note ${toneClass(s.tone)}`}>{s.text}</div>
  }
}

/**
 * The connected package's tab: whatever it sends (for the trading engine:
 * today's P&L, open positions, today's trades, the kill switch). Approvals
 * show as cards on the island, not here.
 */
export function ConnectedView({ state }: { state: ConnectedState | null }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const title = state?.manifest?.tabTitle ?? 'Connected'
  if (!state?.configured)
    return (
      <div className="view connected-view">
        <div className="section-head">
          <span className="large-title">{title}</span>
        </div>
        <Empty
          icon={<Character mood="idle" size={56} track interactive />}
          title="Connect your trading engine"
          body="Start the Day-Trading server on this computer, then paste its address and token in Settings. Its P&L shows on the island, and each trade waits for your OK."
          action={
            <button className="pill primary" onClick={(e) => (e.stopPropagation(), window.island.openSettings('connected'))}>
              Set Up
            </button>
          }
        />
      </div>
    )
  const v = state.view
  return (
    <div className="view connected-view services-view" style={{ ['--svc' as string]: state.manifest?.color ?? '#30d158' }}>
      <div className="section-head">
        <span className="large-title">{title}</span>
        <span className="spacer" />
        <span className={`cv-live ${state.phase}`} title={state.error ?? state.phase}>
          {state.phase === 'live' ? 'Live' : state.phase === 'connecting' ? 'Connecting…' : state.phase === 'off' ? 'Off' : 'Offline'}
        </span>
        <button className="chip" onClick={() => window.island.openSettings('connected')}>
          Settings
        </button>
      </div>
      {!state.on && <div className="svc-note">Turned off in Settings → Connected.</div>}
      {state.error && <div className="svc-note bad">{state.error}</div>}
      {v ? (
        <section className="svc-card">
          <div className="cv-big">
            <b className={toneClass(v.status.tone)}>{v.status.text || 'No data yet'}</b>
            <span>{v.status.detail}</span>
          </div>
          {v.asks.length > 0 && (
            <div className="svc-note">
              {v.asks.length === 1 ? 'A trade is waiting for your answer on the island.' : `${v.asks.length} trades are waiting for your answer on the island.`}
            </div>
          )}
          {v.sections.map((s, i) => (
            <Section key={i} s={s} />
          ))}
          {state.seenAt && <div className="caption cv-seen">Updated {agoText(state.seenAt, now)}</div>}
        </section>
      ) : (
        state.on && !state.error && <div className="svc-note">Connecting…</div>
      )}
    </div>
  )
}
