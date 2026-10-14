import { useState } from 'react'
import type { SettingsState } from '@shared/types'
import { SERVICES, type ServiceId } from '@shared/services'

/** One service: on/off, its address and key (tried before it's kept). */
function ServiceRow({ s, info }: { s: SettingsState['services'][number]; info: (typeof SERVICES)[number] }) {
  const [url, setUrl] = useState(s.url)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const save = async (patch: { on?: boolean; url?: string; token?: string }) => {
    setBusy(true)
    setMsg(null)
    const err = await window.settings.setService(info.id, patch).catch((e) => String(e?.message ?? e))
    setBusy(false)
    if (err) setMsg({ ok: false, text: err })
    else if (patch.token !== undefined || patch.url !== undefined) {
      setToken('')
      setMsg({ ok: true, text: 'Connected' })
    }
  }
  const status = s.on ? (s.error ? { ok: false, text: s.error } : s.hasKey ? { ok: true, text: s.checkedAt ? 'Working' : 'Saved' } : null) : null
  return (
    <div className="service-row" data-service={info.id}>
      <label className="toggle-row">
        <div>
          <div>
            <span className="svc-swatch" style={{ background: info.color }} /> {info.name}
          </div>
          <div className="hint">{info.help}</div>
        </div>
        <input className="switch" type="checkbox" checked={s.on} disabled={busy} onChange={(e) => void save({ on: e.target.checked })} />
      </label>
      {s.on && (
        <div className="service-fields">
          {info.fields.map((f) =>
            f.key === 'url' ? (
              <input key={f.key} className="grow" placeholder={f.placeholder} aria-label={`${info.name} ${f.label}`} value={url} onChange={(e) => setUrl(e.target.value)} />
            ) : (
              <input
                key={f.key}
                className="grow"
                type="password"
                placeholder={s.hasKey ? '•••••••• (saved; paste a new one to replace it)' : f.placeholder}
                aria-label={`${info.name} ${f.label}`}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            ),
          )}
          <button className="secondary" disabled={busy || (!token.trim() && url === s.url)} onClick={() => void save({ ...(token.trim() ? { token } : {}), ...(url !== s.url ? { url } : {}) })}>
            {busy ? 'Checking…' : 'Save'}
          </button>
        </div>
      )}
      {s.on && (msg || status) && <div className={`hint service-status ${(msg ?? status)!.ok ? 'ok' : 'bad'}`}>{(msg ?? status)!.text}</div>}
    </div>
  )
}

/** Settings → Services: the ones you follow on the island. */
export function ServicesSection({ s }: { s: SettingsState }) {
  return (
    <section id="services">
      <h2>Services</h2>
      <p className="hint section-hint">Follow them in the Services tab, with a heads-up on the island for failed deploys, CI, reviews, payments and workflows. Keys are encrypted on this computer and only sent to the service itself.</p>
      {SERVICES.map((info) => {
        const st = s.services.find((x) => x.id === info.id) ?? { id: info.id as ServiceId, on: false, hasKey: false, url: '' }
        return <ServiceRow key={info.id} s={st} info={info} />
      })}
    </section>
  )
}
