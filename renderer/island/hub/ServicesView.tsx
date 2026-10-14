import { useEffect, useState } from 'react'
import { serviceInfo, type Row, type ServiceState } from '@shared/services'
import { agoText, resetText } from '@shared/format'
import { RefreshIcon } from '../icons'
import { Empty } from './common'
import { Character } from '../character/Character'

/** The services you follow, kept current. */
export function useServices(): ServiceState[] {
  const [list, setList] = useState<ServiceState[]>([])
  useEffect(() => {
    let live = true
    window.island.services
      ?.view()
      .then((v) => live && setList(v))
      .catch(() => {})
    const off = window.island.services?.onChanged(setList)
    return () => {
      live = false
      off?.()
    }
  }, [])
  return list
}

const when = (at: number | undefined, now: number) => (!at ? '' : at > now + 60_000 ? resetText(at, now) : agoText(at, now))

function ServiceRow({ r, now }: { r: Row; now: number }) {
  return (
    <button className={`svc-row${r.url ? ' opens' : ''}`} disabled={!r.url} onClick={() => r.url && void window.island.services.open(r.url)} title={r.url ? 'Open' : undefined}>
      {r.tone && r.tone !== 'none' && <span className={`svc-dot ${r.tone}`} aria-label={r.tone === 'good' ? 'OK' : r.tone === 'bad' ? 'Problem' : 'In progress'} />}
      <span className="svc-text">
        <span className="svc-title ellipsis">{r.title}</span>
        {(r.sub || r.at) && (
          <span className="svc-sub ellipsis">
            {[r.sub, when(r.at, now)].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {r.side && <span className={`svc-side ${r.tone ?? ''}`}>{r.side}</span>}
    </button>
  )
}

/**
 * Services: one card per service you follow (Settings → Services): GitHub's
 * pull requests and CI, Vercel's deployments, Stripe's payments, Resend's
 * emails, Notion's pages, Cal.com's calls, n8n's workflows.
 */
export function ServicesView({ list }: { list: ServiceState[] }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!list.length)
    return (
      <div className="view services-view">
        <div className="section-head">
          <span className="large-title">Services</span>
        </div>
        <Empty
          icon={<Character mood="idle" size={56} track interactive />}
          title="Follow your services here"
          body="GitHub pull requests and CI, Vercel deploys, Stripe payments, Resend emails, Notion pages, Cal.com calls and n8n workflows, with a heads-up on the island when something needs you."
          action={
            <button className="pill primary" onClick={(e) => (e.stopPropagation(), window.island.openSettings('services'))}>
              Set Up
            </button>
          }
        />
      </div>
    )
  return (
    <div className="view services-view">
      <div className="section-head">
        <span className="large-title">Services</span>
        <span className="spacer" />
        <button className="chip" onClick={() => window.island.openSettings('services')}>
          Settings
        </button>
      </div>
      {list.map((s) => {
        const info = serviceInfo(s.id)
        return (
          <section key={s.id} className="svc-card" data-service={s.id} style={{ ['--svc' as string]: info.color }}>
            <div className="svc-head">
              <span className="svc-badge" aria-hidden />
              <span className="svc-name">{info.name}</span>
              {s.checkedAt && <span className="caption">{agoText(s.checkedAt, now)}</span>}
              <span className="spacer" />
              <button className="icon-btn" title="Look again now" aria-label={`Refresh ${info.name}`} onClick={() => void window.island.services.refresh(s.id)}>
                <RefreshIcon />
              </button>
            </div>
            {!s.ready ? (
              <div className="svc-note">
                Add its key in{' '}
                <button className="link" onClick={() => window.island.openSettings('services')}>
                  Settings
                </button>
              </div>
            ) : s.error ? (
              <div className="svc-note bad">{s.error}</div>
            ) : !s.snapshot ? (
              <div className="svc-note">Looking…</div>
            ) : null}
            {s.snapshot?.big && (
              <div className="svc-big">
                <b>{s.snapshot.big.value}</b> <span>{s.snapshot.big.label}</span>
              </div>
            )}
            {s.snapshot?.sections.map((sec) => (
              <div key={sec.title} className="svc-section">
                <div className="group-label">{sec.title}</div>
                {sec.rows.length ? sec.rows.map((r) => <ServiceRow key={r.id} r={r} now={now} />) : <div className="svc-empty">{sec.empty}</div>}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
