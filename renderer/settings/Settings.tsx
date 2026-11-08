import { DesktopSection } from './DesktopSection'
import { BuddySection } from './BuddySection'
import { PrivacySection } from './PrivacySection'
import { ACCENTS, accentOf } from '@shared/theme'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SettingsState, WaState } from '@shared/types'
import { MailSection } from './MailSection'
import { CharacterSection } from './CharacterSection'
import { AiSection } from './AiSection'
import { PackagesSection } from './PackagesSection'
import { SettingsProblem } from './Problem'
import { ShortcutsSection } from './ShortcutsSection'
import { ServicesSection } from './ServicesSection'
import { ConnectedSection } from './ConnectedSection'
import { DropSection } from './DropSection'
import { DragSection } from './DragSection'
import { BrainSection } from './BrainSection'
import { YouSection } from './YouSection'
import { WallpaperSection } from './WallpaperSection'
import { SIDE_ICONS } from './SideIcons'
import { ModelSection } from './ModelSection'
import { shortcutLabel } from '@shared/shortcuts'
import { SOUND_INFO, SOUND_KINDS } from '@shared/sounds'

export function Toggle({
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

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
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
        label="Follow every Claude Code session on the island"
        hint="Adds hooks to ~/.claude/settings.json: each session in your terminals shows live (steps, changes, when it needs you) and its approvals, questions and plans can be answered here. Commands started from the island always ask here."
        on={hookInstalled}
        onChange={(v) => run(() => window.settings.setHook(v))}
      />
      {s.agentHooks?.length > 0 && (
        <>
          <div className="hint">Other coding agents: show their sessions on the island too (their approvals stay in the agent).</div>
          {s.agentHooks.map((a) => (
            <Toggle
              key={a.id}
              label={a.name}
              hint={a.installed ? `On, in ${a.path}. ${a.note}` : `Adds a hook to ${a.path} (backed up first).`}
              on={a.installed}
              onChange={(v) => run(() => window.settings.setAgentHook(a.id, v))}
            />
          ))}
        </>
      )}
      <Toggle
        label={`Talk shortcut ${shortcutLabel(s.keys.voice, s.mac)}`}
        hint={
          c.voiceShortcut && !c.voiceShortcutActive
            ? `Another app is already using ${shortcutLabel(s.keys.voice, s.mac)}, so it could not be registered`
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

function SpotifySection({ s }: { s: SettingsState }) {
  const sp = s.spotify
  const { run, error, busy } = useAction()
  const [id, setId] = useState(sp.clientId)
  const [copied, setCopied] = useState(false)
  useEffect(() => setId(sp.clientId), [sp.clientId])
  const connected = sp.status === 'ready'
  return (
    <section id="spotify">
      <h2>Spotify</h2>
      <div className="toggle-row">
        <div>
          <div>
            {connected
              ? `Connected as ${sp.user}${sp.premium === false ? ' (Free)' : ''}`
              : sp.status === 'signing-in'
                ? 'Waiting for you to log in in your browser…'
                : 'Not connected'}
          </div>
          <div className="hint">
            {connected
              ? 'Browse, search and play from the Music tab on the island.'
              : 'Your library, search and playback control on the island, in Spotify\u2019s own style.'}
          </div>
        </div>
        {connected ? (
          <button className="secondary" onClick={() => run(() => window.settings.spotifySignOut())}>
            Disconnect
          </button>
        ) : (
          <button disabled={!sp.clientId || busy || sp.status === 'signing-in'} onClick={() => run(() => window.settings.spotifySignIn())}>
            Connect
          </button>
        )}
      </div>
      {!connected && (
        <ol className="hint steps">
          <li>
            Open <b>developer.spotify.com/dashboard</b>, log in, and click <b>Create app</b>.
          </li>
          <li>
            Give it any name and description. Under <b>Redirect URIs</b> add{' '}
            <code>{sp.redirectUri}</code>{' '}
            <button
              className="link"
              onClick={() => {
                void navigator.clipboard.writeText(sp.redirectUri).then(() => setCopied(true))
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>{' '}
            and tick <b>Web API</b>. Save.
          </li>
          <li>
            Open the app&apos;s <b>Settings</b>, copy its <b>Client ID</b> and paste it below, then press Connect.
          </li>
          <li>Spotify asks that the app&apos;s owner has Premium, and allows up to 5 people per app.</li>
        </ol>
      )}
      <div className="row">
        <input className="grow" placeholder="Client ID" value={id} spellCheck={false} onChange={(e) => setId(e.target.value.trim())} />
        <button className="secondary" disabled={id === sp.clientId} onClick={() => run(() => window.settings.setSpotifyClient(id))}>
          Use Client ID
        </button>
      </div>
      {(error || sp.error) && <p className="error">{error || sp.error}</p>}
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

/** The sidebar: its groups and sections, in order (some only when they apply). */
const NAV: { id: string; label: string; when?: (s: SettingsState) => boolean }[][] = [
  [
    { id: 'you', label: 'You', when: (s) => s.brain.exists },
    { id: 'brain', label: 'Second brain' },
    { id: 'buddy', label: 'Buddy' },
    { id: 'wallpaper', label: 'Wallpaper' },
  ],
  [
    { id: 'character', label: 'Character' },
    { id: 'ai', label: 'AI' },
    { id: 'model', label: 'Model' },
    { id: 'packages', label: 'Packages' },
  ],
  [
    { id: 'general', label: 'General' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'desktop', label: 'Desktop' },
    { id: 'shortcuts', label: 'Keyboard shortcuts' },
    { id: 'drag', label: 'Drag actions' },
    { id: 'drop', label: 'Phone Drop' },
  ],
  [
    { id: 'claude', label: 'Claude Code', when: (s) => !!s.claude },
    { id: 'connected', label: 'Connected' },
    { id: 'services', label: 'Services' },
    { id: 'spotify', label: 'Spotify', when: (s) => !!s.spotify },
    { id: 'notes', label: 'Notes' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'mail', label: 'Mail' },
  ],
]

/** The rows a search can light up inside a section. */
const ROWS = '.toggle-row, .row, .privacy-row, .package-row, .service-row, .brain-tool, .brain-item, .wall-block, .wall-now, .me-editor, .character-grid, .wardrobe-row, .slider-row, .range-row'

export function Settings() {
  const [s, setS] = useState<SettingsState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const general = useAction()
  const [section, setSection] = useState(() => location.hash.slice(1))
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<string[] | null>(null)
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const on = () => {
      setSection(location.hash.slice(1))
      setQuery('')
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

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

  const items = useMemo(() => (s ? NAV.map((g) => g.filter((it) => !it.when || it.when(s))) : []), [s])
  const ids = items.flat().map((it) => it.id)
  const current = ids.includes(section) ? section : (ids[0] ?? '')
  // Searching: the sections (and rows) whose words match.
  useEffect(() => {
    const pane = paneRef.current
    pane?.querySelectorAll('.hit').forEach((e) => e.classList.remove('hit'))
    const q = query.trim().toLowerCase()
    if (!q || !pane) return setMatches(null)
    const found = ids.filter((id) => document.getElementById(id)?.textContent?.toLowerCase().includes(q))
    setMatches(found)
    for (const id of found) {
      document.getElementById(id)?.querySelectorAll<HTMLElement>(ROWS).forEach((r) => {
        if (r.textContent?.toLowerCase().includes(q) && !r.querySelector('.hit')) r.classList.add('hit')
      })
    }
  }, [query, s]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => paneRef.current?.scrollTo(0, 0), [current])
  // Light or dark, as the island says (it follows the desktop, or your choice), and the accent.
  useEffect(() => {
    if (s) document.documentElement.dataset.theme = s.dark ? 'dark' : 'light'
  }, [s?.dark]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!s) return
    const a = accentOf(s.accent)
    document.documentElement.style.setProperty('--accent-dark', a.dark)
    document.documentElement.style.setProperty('--accent-light', a.light)
  }, [s?.accent]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <SettingsProblem detail={loadError} />
  if (!s) return <main>Loading…</main>

  const shown = matches ?? [current]
  const go = (id: string) => {
    if (location.hash.slice(1) === id) {
      setSection(id)
      setQuery('')
    } else location.hash = id
  }
  return (
    <div className="settings-app">
      <aside className="side" aria-label="Settings sections">
        <div className="side-search">
          <input type="search" placeholder="Search" aria-label="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
        </div>
        <nav>
          {items.map((group, i) =>
            group.filter((it) => !matches || matches.includes(it.id)).length ? (
              <div className="side-group" key={i}>
                {group
                  .filter((it) => !matches || matches.includes(it.id))
                  .map((it) => (
                    <button key={it.id} className={`side-item${!matches && it.id === current ? ' on' : ''}`} data-section={it.id} aria-current={!matches && it.id === current ? 'page' : undefined} onClick={() => go(it.id)}>
                      <span className="side-icon">{SIDE_ICONS[it.id]}</span>
                      <span className="ellipsis">{it.label}</span>
                    </button>
                  ))}
              </div>
            ) : null,
          )}
          {matches && !matches.length && <div className="side-empty">No results</div>}
        </nav>
      </aside>
      <main ref={paneRef}>
      {/* One pane at a time (or every match while searching). */}
      <style>{shown.length ? `main > section:not(${shown.map((id) => `#${id}`).join(', ')}) { display: none; }` : 'main > section { display: none; }'}</style>
      {matches && !matches.length && <div className="no-results">No settings match “{query}”.</div>}

      <YouSection s={s} />
      <BrainSection s={s} />
      <WallpaperSection s={s} />
      <PrivacySection s={s} />
      <BuddySection s={s} />
      <DesktopSection s={s} />
      <CharacterSection s={s} />
      <AiSection s={s} />
      <ModelSection s={s} />
      <PackagesSection s={s} />

      <section id="general">
        <h2>General</h2>
        <Toggle
          label="Show desktop notifications"
          on={s.notifications}
          onChange={(v) => general.run(() => window.settings.setNotifications(v))}
        />
        <div className="toggle-row">
          <div>
            <div>Light or dark</div>
            <div className="hint">
              For Settings and the island. {s.theme === 'system' ? `Following your desktop: ${s.dark ? 'dark' : 'light'} now.` : ''}
            </div>
          </div>
          <Segmented
            value={s.theme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => general.run(() => window.settings.setTheme(v))}
          />
        </div>
        <div className="toggle-row">
          <div>
            <div>Island colours</div>
            <div className="hint">The panel and cards in light or dark with everything else, or always dark, like the notch it’s named after.</div>
          </div>
          <Segmented
            value={s.islandTheme}
            options={[
              { value: 'match', label: 'Match' },
              { value: 'dark', label: 'Always dark' },
            ]}
            onChange={(v) => general.run(() => window.settings.setLook({ island: v }))}
          />
        </div>
        <div className="toggle-row">
          <div>
            <div>Accent colour</div>
            <div className="hint">Buttons, links and what’s selected, on the island and here.</div>
          </div>
          <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={s.accent === a.id}
                aria-label={a.name}
                title={a.name}
                className={`accent-swatch${s.accent === a.id ? ' on' : ''}`}
                style={{ background: s.dark ? a.dark : a.light }}
                onClick={() => general.run(() => window.settings.setLook({ accent: a.id }))}
              />
            ))}
          </div>
        </div>
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
        <Toggle
          label="Sounds"
          hint="Soft tones when the island opens, asks for approval, or Claude finishes. Quiet, and never more than one at a time"
          on={s.sounds}
          onChange={(v) => general.run(() => window.settings.setSounds(v))}
        />
        {s.sounds && (
          <div className="toggle-row">
            <div>
              <div>Your own sounds</div>
              <div className="hint">
                {s.customSounds?.length
                  ? `Using yours for: ${s.customSounds.join(', ')}. `
                  : 'Put a sound file in the folder named after what it replaces: '}
                {s.customSounds?.length ? 'Add or remove files any time.' : `${SOUND_KINDS.slice(3, 7).map((k) => `${k}.mp3 (${SOUND_INFO[k]})`).join(', ')}, and more. WAV, MP3, OGG or M4A.`}
              </div>
            </div>
            <button className="secondary" onClick={() => general.run(() => window.settings.openSounds())}>
              Open Folder
            </button>
          </div>
        )}
        <div className="toggle-row">
          <div>
            <div>Island position</div>
            <div className="hint">Or drag the island: along an edge, across to the other side, or up to the top center</div>
          </div>
          <div className="segmented">
            {(['left', 'top', 'right'] as const).map((side) => (
              <button
                key={side}
                className={s.dockSide === side ? 'on' : 'secondary'}
                onClick={() => general.run(() => window.settings.setDockSide(side))}
              >
                {side === 'left' ? 'Left' : side === 'top' ? 'Top' : 'Right'}
              </button>
            ))}
          </div>
        </div>
        <div className="toggle-row">
          <div>
            <div>Island lives on</div>
            <div className="hint">With “the display with the pointer” it moves to whichever screen you’re working on</div>
          </div>
          <select className="display-select" value={s.displays.some((d) => d.key === s.display) || s.display === 'cursor' ? s.display : 'primary'} onChange={(e) => general.run(() => window.settings.setDisplay(e.target.value))}>
            <option value="primary">Main display</option>
            <option value="cursor">The display with the pointer</option>
            {s.displays.length > 1 && s.displays.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <Toggle
          label={`Dictate anywhere with ${shortcutLabel(s.keys.dictate, s.mac)}`}
          hint={
            s.dictation && !s.dictationActive
              ? `Another app is already using ${shortcutLabel(s.keys.dictate, s.mac)}, so it could not be registered. Pick other keys under Keyboard shortcuts`
              : 'Press it, speak, and what you said is typed into the app you’re in. It stops when you stop talking (or press it again). Speech stays on this computer'
          }
          on={s.dictation}
          onChange={(v) => general.run(() => window.settings.setDictation(v))}
        />
        <Toggle
          label="Open the panel when the pointer rests on the island"
          hint="No click needed: rest on the resting island for a moment and it opens"
          on={s.openOnHover}
          onChange={(v) => general.run(() => window.settings.setOpenOnHover(v))}
        />
        <Toggle
          label={`Keyboard shortcut ${shortcutLabel(s.keys.panel, s.mac)}`}
          hint={
            s.shortcut && !s.shortcutActive
              ? `Another app is already using ${shortcutLabel(s.keys.panel, s.mac)}, so it could not be registered`
              : `Opens and closes the island from any app (${shortcutLabel(s.keys.panel, s.mac)} then no longer reaches other apps). Change the keys under Keyboard shortcuts`
          }
          on={s.shortcut}
          onChange={(v) => general.run(() => window.settings.setShortcut(v))}
        />
        <Toggle label="Start at login" on={s.autostart} onChange={(v) => general.run(() => window.settings.setAutostart(v))} />
        <Toggle
          label="Weekly recap"
          hint="Every Monday, a short recap of last week with your coding agents: time, sessions, files, lines, commands. Only counts and project folder names are kept (12 weeks, on this computer)"
          on={s.recap}
          onChange={(v) => general.run(() => window.settings.setRecap(v))}
        />
        {s.recap && (
          <div className="toggle-row">
            <div>
              <div>Last week’s recap</div>
              <div className="hint">Or from the tray menu, any time</div>
            </div>
            <div className="key-actions">
              <button className="link" onClick={() => general.run(() => window.settings.clearRecap())}>
                Clear history
              </button>
              <button className="secondary" onClick={() => general.run(() => window.settings.showRecap())}>
                Show
              </button>
            </div>
          </div>
        )}
        <div className="toggle-row">
          <div>
            <div>Show me around</div>
            <div className="hint">A one-minute tour on the island of what it can do, with example cards</div>
          </div>
          <button className="secondary" onClick={() => general.run(() => window.settings.tour())}>
            Start Tour
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <div>Uninstall</div>
            <div className="hint">Removes the app, starting at login and its Claude Code setup. You choose whether your settings and data go too</div>
          </div>
          <button className="secondary" onClick={() => general.run(() => window.settings.uninstall())}>
            Uninstall…
          </button>
        </div>
        {general.error && <p className="error">{general.error}</p>}
      </section>

      <ShortcutsSection s={s} />

      <DragSection s={s} />

      <DropSection s={s} />

      <ConnectedSection s={s} />

      <ServicesSection s={s} />

      {s.claude && <ClaudeSection s={s} hookInstalled={s.hookInstalled} />}

      {s.spotify && <SpotifySection s={s} />}

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
    </div>
  )
}
