import { useEffect, useState } from 'react'
import type { SettingsState, WaState } from '@shared/types'
import { MailSection } from './MailSection'
import { SettingsProblem } from './Problem'

function Toggle({
  on,
  onChange,
  label,
  hint,
  disabled,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className={`toggle-row${disabled ? ' disabled' : ''}`}>
      <div>
        <div>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <input className="switch" type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : 'secondary'} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const PERMISSIONS = [
  { value: 'default' as const, label: 'Ask me', hint: 'Claude asks on the island before running commands or editing files.' },
  { value: 'acceptEdits' as const, label: 'Allow edits', hint: 'File edits go ahead; commands still ask on the island.' },
  { value: 'auto' as const, label: 'Auto', hint: 'Claude Code’s classifier approves safe actions and asks about the rest.' },
]

function ClaudeSection({ s, hookInstalled }: { s: SettingsState; hookInstalled: boolean }) {
  const { run, error } = useAction()
  const c = s.claude
  const [path, setPath] = useState(c.binaryOverride)
  useEffect(() => setPath(c.binaryOverride), [c.binaryOverride])
  const perm = PERMISSIONS.find((p) => p.value === c.permissionMode) ?? PERMISSIONS[0]
  return (
    <section id="claude">
      <h2>Claude Code</h2>
      <div className="toggle-row">
        <div>
          <div>{c.binary ? 'Claude Code found' : 'Claude Code not found'}</div>
          <div className="hint">
            {c.binary
              ? c.binary
              : 'Install Claude Code and log in once in a terminal, or enter the path to the claude command.'}
          </div>
        </div>
      </div>
      <div className="row">
        <input
          className="grow"
          placeholder="Path to claude (leave empty to find it automatically)"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button className="secondary" disabled={path === c.binaryOverride} onClick={() => run(() => window.settings.setClaude({ binary: path }))}>
          Use Path
        </button>
      </div>
      <div className="toggle-row">
        <div>
          <div>Project folder</div>
          <div className="hint">Where your spoken or typed commands run: {c.cwd}</div>
        </div>
        <button className="secondary" onClick={() => run(() => window.settings.pickClaudeFolder())}>
          Choose…
        </button>
      </div>
      <div className="toggle-row">
        <div>
          <div>Permissions for island commands</div>
          <div className="hint">{perm.hint}</div>
        </div>
        <Segmented value={c.permissionMode} options={PERMISSIONS} onChange={(v) => run(() => window.settings.setClaude({ permissionMode: v }))} />
      </div>
      <Toggle
        label="Show my plan limits"
        hint="Adds a small status line to Claude Code that also sends your 5-hour and weekly usage to the island. A status line you already have keeps working."
        on={c.usageBridge}
        onChange={(v) => run(() => window.settings.setUsageBridge(v))}
      />
      <Toggle
        label="Approvals on the island for every Claude Code session"
        hint="Installs a PermissionRequest hook in ~/.claude/settings.json. Commands started from the island always ask here."
        on={hookInstalled}
        onChange={(v) => run(() => window.settings.setHook(v))}
      />
      <Toggle
        label="Talk shortcut Ctrl+Alt+Space"
        hint={
          c.voiceShortcut && !c.voiceShortcutActive
            ? 'Another app is already using Ctrl+Alt+Space, so it could not be registered'
            : 'Press it anywhere to start talking to Claude; press again (or stop talking) to send'
        }
        on={c.voiceShortcut}
        onChange={(v) => run(() => window.settings.setClaude({ voiceShortcut: v }))}
      />
      <div className="toggle-row">
        <div>
          <div>Speech recognition</div>
          <div className="hint">Whisper runs on this computer. The model is downloaded once from Hugging Face the first time you talk.</div>
        </div>
        <Segmented
          value={c.sttModel}
          options={c.sttModels.map((m) => ({ value: m.value, label: m.value === 'tiny' ? 'Fast' : 'Accurate' }))}
          onChange={(v) => run(() => window.settings.setClaude({ sttModel: v }))}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </section>
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const general = useAction()

  useEffect(() => {
    if (!window.settings) return setLoadError('The settings bridge is missing.')
    // Retry briefly: the island may still be starting its services.
    let live = true
    const load = (n: number) =>
      window.settings
        .get()
        .then((v) => live && setS(v))
        .catch((e) =>
          n > 0 ? setTimeout(() => live && load(n - 1), 700) : live && setLoadError(String(e?.message ?? e)),
        )
    load(10)
    const off = window.settings.onChange(setS)
    return () => {
      live = false
      off()
    }
  }, [])

  useEffect(() => {
    const id = location.hash.slice(1)
    if (id && s) document.getElementById(id)?.scrollIntoView()
  }, [s !== null])

  if (loadError) return <SettingsProblem detail={loadError} />
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
            <div>Appearance</div>
            <div className="hint">Glass is translucent; the desktop behind is blurred on KDE Plasma</div>
          </div>
          <div className="segmented">
            {(['glass', 'solid'] as const).map((a) => (
              <button
                key={a}
                className={s.appearance === a ? 'on' : 'secondary'}
                onClick={() => general.run(() => window.settings.setAppearance(a))}
              >
                {a === 'glass' ? 'Glass' : 'Solid'}
              </button>
            ))}
          </div>
        </div>
        {s.appearance === 'glass' && (
          <Toggle
            label="Frosted glass"
            hint={
              s.frostedAvailable
                ? 'Blurs a snapshot of the desktop behind the island. The snapshot stays in memory and is never saved'
                : 'Not available on Wayland'
            }
            on={s.frosted && s.frostedAvailable}
            disabled={!s.frostedAvailable}
            onChange={(v) => general.run(() => window.settings.setFrosted(v))}
          />
        )}
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
        <Toggle
          label="Keyboard shortcut Ctrl+I"
          hint={
            s.shortcut && !s.shortcutActive
              ? 'Another app is already using Ctrl+I, so it could not be registered'
              : 'Opens and closes the island from any app (Ctrl+I then no longer reaches other apps)'
          }
          on={s.shortcut}
          onChange={(v) => general.run(() => window.settings.setShortcut(v))}
        />
        <Toggle label="Start at login" on={s.autostart} onChange={(v) => general.run(() => window.settings.setAutostart(v))} />
        {general.error && <p className="error">{general.error}</p>}
      </section>

      {s.claude && <ClaudeSection s={s} hookInstalled={s.hookInstalled} />}

      <section id="notes">
        <h2>Notes</h2>
        <div className="toggle-row">
          <div>
            <div>Notes folder</div>
            <div className="hint">Each note is a Markdown file in {s.notesFolder}</div>
          </div>
          <button className="secondary" onClick={() => general.run(() => window.settings.openNotesFolder())}>
            Open Folder
          </button>
        </div>
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
