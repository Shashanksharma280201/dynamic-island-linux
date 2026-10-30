import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'

/**
 * Settings → Connected: the address and token of a service the island shows
 * and answers for (your Day-Trading engine), tried before they're kept, and
 * the QR your phone scans to pair with the same engine.
 */
export function ConnectedSection({ s }: { s: SettingsState }) {
  const c = s.connected
  const [url, setUrl] = useState(c.url || 'http://127.0.0.1:8765')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    if (!showQr || !c.pairingLink) return setQr(null)
    let live = true
    void window.settings.qr(c.pairingLink).then((d) => live && setQr(d))
    return () => {
      live = false
    }
  }, [showQr, c.pairingLink])

  const save = async (patch: { on?: boolean; url?: string; token?: string }) => {
    setBusy(true)
    setMsg(null)
    const err = await window.settings.setConnected(patch).catch((e) => String(e?.message ?? e))
    setBusy(false)
    if (err) setMsg({ ok: false, text: err })
    else if (patch.token !== undefined || patch.url !== undefined) {
      setToken('')
      setMsg({ ok: true, text: 'Connected' })
    }
  }
  const status = c.on
    ? c.error
      ? { ok: false, text: c.error }
      : c.phase === 'live'
        ? { ok: true, text: `Live${c.name ? `: ${c.name}` : ''}` }
        : c.hasKey
          ? { ok: true, text: c.phase === 'connecting' ? 'Connecting…' : 'Saved' }
          : null
    : null

  return (
    <section id="connected">
      <h2>Connected</h2>
      <p className="hint section-hint">
        Show your trading engine on the island: today’s P&amp;L on the capsule, every trade as a card you approve or skip, and its own tab. Start it with{' '}
        <code>python3 -m daytrader.cli serve</code>, then paste its address and the token from its <code>state/api_token</code> file. The token is encrypted on this computer and only sent to that address.
      </p>
      <div className="service-row" data-service="connected">
        <label className="toggle-row">
          <div>
            <div>
              <span className="svc-swatch" style={{ background: '#30d158' }} /> {c.name ?? 'Trading engine'}
            </div>
            <div className="hint">Only your click (or the approval shortcut) answers a trade. No answer means no trade.</div>
          </div>
          <input className="switch" type="checkbox" checked={c.on} disabled={busy} onChange={(e) => void save({ on: e.target.checked })} />
        </label>
        {c.on && (
          <div className="service-fields">
            <input className="grow" placeholder="http://127.0.0.1:8765" aria-label="Connected address" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input
              className="grow"
              type="password"
              placeholder={c.hasKey ? '•••••••• (saved; paste a new one to replace it)' : 'Token from state/api_token'}
              aria-label="Connected token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="secondary" disabled={busy || (!token.trim() && url === c.url)} onClick={() => void save({ ...(token.trim() ? { token } : {}), ...(url !== c.url ? { url } : {}) })}>
              {busy ? 'Checking…' : 'Save'}
            </button>
          </div>
        )}
        {c.on && (msg || status) && <div className={`hint service-status ${(msg ?? status)!.ok ? 'ok' : 'bad'}`}>{(msg ?? status)!.text}</div>}
      </div>
      {c.on && c.phase === 'live' && (
        <div className="service-row connected-phone">
          <div className="toggle-row">
            <div>
              <div>Your phone</div>
              <div className="hint">
                {c.pairingLink
                  ? `Scan this with the Day-Trading app to see the same P&L and approve trades from your phone (it reaches ${c.phoneUrl} over Tailscale).`
                  : 'Start the engine with --phone-host <your Tailscale IP> to pair the Android app.'}
              </div>
            </div>
            {c.pairingLink && (
              <button className="secondary" onClick={() => setShowQr(!showQr)}>
                {showQr ? 'Hide QR' : 'Show QR'}
              </button>
            )}
          </div>
          {showQr && qr && <img className="connected-qr" src={qr} alt="Pairing QR for the Day-Trading app" width={240} height={240} />}
          {showQr && <div className="hint">This QR contains the engine’s token. Don’t share a screenshot of it.</div>}
        </div>
      )}
    </section>
  )
}
