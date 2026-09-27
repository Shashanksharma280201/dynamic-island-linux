import { useEffect, useState } from 'react'
import type { SettingsState, WaState } from '@shared/types'
import { MailSection } from './MailSection'

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <div>
        <div>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** Runs an async settings call, surfacing errors inline. */
export function useAction() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e: any) {
      setError(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run, setError }
}

function WhatsAppStatus({ s }: { s: WaState }) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const { error, busy, run } = useAction()
  switch (s.state) {
    case 'starting':
      return <p className="hint">Starting WhatsApp Web…</p>
    case 'qr':
      return (
        <div className="qr-block">
          <img className="qr" src={s.qr} alt="WhatsApp QR code" />
          <ol className="hint">
            <li>Open WhatsApp on your phone</li>
            <li>Settings → Linked devices → Link a device</li>
            <li>Scan this code</li>
          </ol>
          <div className="row">
            <input
              placeholder="Or link with phone number, e.g. +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button disabled={busy || !phone} onClick={() => run(async () => setCode(await window.settings.whatsappPair(phone)))}>
              Get code
            </button>
          </div>
          {code && (
            <p>
              Enter <b className="code">{code}</b> on your phone under Linked devices → Link with phone number.
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )
    case 'ready':
      return (
        <div className="row">
          <span className="dot ok" /> Connected{s.me ? ` as ${s.me}` : ''}
          <button className="danger" onClick={() => window.settings.whatsappLogout()}>
            Unlink
          </button>
        </div>
      )
    case 'disconnected':
      return <p className="error">Disconnected{s.reason ? `: ${s.reason}` : ''}. Toggle WhatsApp off and on to reconnect.</p>
    case 'error':
      return <p className="error">Couldn't start WhatsApp: {s.error}</p>
    default:
      return null
  }
}

export function Settings() {
  const [s, setS] = useState<SettingsState | null>(null)
  const general = useAction()

  useEffect(() => {
    window.settings.get().then(setS)
    return window.settings.onChange(setS)
  }, [])

  useEffect(() => {
    const id = location.hash.slice(1)
    if (id && s) document.getElementById(id)?.scrollIntoView()
  }, [s !== null])

  if (!s) return <main>Loading…</main>

  return (
    <main>
      <h1>Dynamic Island</h1>

      <section id="general">
        <h2>General</h2>
        <Toggle
          label="Show desktop notifications"
          on={s.notifications}
          onChange={(v) => general.run(() => window.settings.setNotifications(v))}
        />
        <div className="toggle-row">
          <div>
            <div>Island position</div>
            <div className="hint">Or drag the island along the edge, or across to the other side</div>
          </div>
          <div className="segmented">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                className={s.dockSide === side ? 'on' : 'secondary'}
                onClick={() => general.run(() => window.settings.setDockSide(side))}
              >
                {side === 'left' ? 'Left' : 'Right'}
              </button>
            ))}
          </div>
        </div>
        <Toggle label="Start at login" on={s.autostart} onChange={(v) => general.run(() => window.settings.setAutostart(v))} />
        <Toggle
          label="Claude Code approvals"
          hint="Installs a PermissionRequest hook in ~/.claude/settings.json"
          on={s.hookInstalled}
          onChange={(v) => general.run(() => window.settings.setHook(v))}
        />
        {general.error && <p className="error">{general.error}</p>}
      </section>

      <section id="whatsapp">
        <h2>WhatsApp</h2>
        <Toggle
          label="Show WhatsApp messages and reply from the island"
          hint="Runs WhatsApp Web as a linked device inside the island"
          on={s.whatsapp.enabled}
          onChange={(v) => general.run(() => window.settings.setWhatsApp(v))}
        />
        {s.whatsapp.needsRestart ? (
          <div className="row">
            <span className="hint">The island needs a restart to start WhatsApp.</span>
            <button onClick={() => window.settings.restart()}>Restart now</button>
          </div>
        ) : (
          s.whatsapp.enabled && <WhatsAppStatus s={s.whatsapp.status} />
        )}
      </section>

      <section id="mail">
        <h2>Mail</h2>
        {!s.secureStorage && (
          <p className="warn">
            No desktop keyring found, so mail passwords are stored only obfuscated. Install and unlock GNOME Keyring for
            real encryption.
          </p>
        )}
        <MailSection accounts={s.mail} />
      </section>
    </main>
  )
}
