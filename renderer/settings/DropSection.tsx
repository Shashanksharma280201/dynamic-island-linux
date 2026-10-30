import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'

/**
 * Settings → Phone Drop: files you flick from your phone (the Island Drop
 * app) land on this computer. On, where they go, and the QR the app scans to
 * pair (it carries this computer's addresses and a token made here).
 */
export function DropSection({ s }: { s: SettingsState }) {
  const d = s.drop
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    if (!showQr || !d.link) return setQr(null)
    let live = true
    void window.settings.qr(d.link).then((q) => live && setQr(q))
    return () => {
      live = false
    }
  }, [showQr, d.link])

  const set = async (patch: { on?: boolean; folder?: string; forget?: boolean }) => {
    setBusy(true)
    setErr(null)
    const e = await window.settings.setDrop(patch).catch((x) => String(x?.message ?? x))
    setBusy(false)
    setErr(e)
  }
  const custom = d.folder !== 'downloads' && d.folder !== 'desktop'

  return (
    <section id="drop">
      <h2>Phone Drop</h2>
      <p className="hint section-hint">
        Hold a file in the Island Drop app on your Android phone and flick it toward this screen: it comes out of a glow at the edge and lands in the island. Your phone and this computer need the same Wi-Fi (or Tailscale on both).
      </p>
      <div className="service-row" data-service="drop">
        <label className="toggle-row">
          <div>
            <div>Receive files from your phone</div>
            <div className="hint">Only phones that scanned this computer’s QR can send. Nothing is ever overwritten.</div>
          </div>
          <input className="switch" type="checkbox" aria-label="Receive files from your phone" checked={d.on} disabled={busy} onChange={(e) => void set({ on: e.target.checked })} />
        </label>
        {d.on && (
          <label className="toggle-row">
            <div>Save them to</div>
            <select
              className="display-select"
              aria-label="Where files from your phone go"
              value={custom ? 'custom' : d.folder}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value === 'pick') void window.settings.pickDropFolder()
                else if (e.target.value !== 'custom') void set({ folder: e.target.value })
              }}
            >
              <option value="downloads">Downloads</option>
              <option value="desktop">Desktop</option>
              {custom && <option value="custom">{d.folderLabel}</option>}
              <option value="pick">Choose a folder…</option>
            </select>
          </label>
        )}
        {d.on && (err || d.problem) && <div className="hint service-status bad">{err || d.problem}</div>}
        {d.on && !err && !d.problem && d.listening && <div className="hint service-status ok">Ready on port {d.port}</div>}
      </div>
      {d.on && d.link && (
        <div className="service-row connected-phone">
          <div className="toggle-row">
            <div>
              <div>Pair your phone</div>
              <div className="hint">Open Island Drop on your phone and scan this. It finds “{d.name}” on your Wi-Fi or over Tailscale.</div>
            </div>
            <button className="secondary" onClick={() => setShowQr(!showQr)}>
              {showQr ? 'Hide QR' : 'Show QR'}
            </button>
          </div>
          {showQr && qr && <img className="connected-qr" src={qr} alt="Pairing QR for the Island Drop app" width={240} height={240} />}
          {showQr && <div className="hint">This QR lets a phone send files here. Don’t share a screenshot of it.</div>}
          <div className="toggle-row">
            <div className="hint">Lost a phone, or shared the QR by mistake? Make a new one: phones paired before can’t send until they scan it.</div>
            <button className="secondary" disabled={busy} onClick={() => void set({ forget: true })}>
              Forget paired phones
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
