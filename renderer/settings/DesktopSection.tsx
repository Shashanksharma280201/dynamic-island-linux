import type { SettingsState } from '@shared/types'
import { shortcutLabel } from '@shared/shortcuts'
import { Toggle, useAction } from './Settings'

/** Settings › Desktop: Ubuntu in the island's look (and back), and the command bar. */
export function DesktopSection({ s }: { s: SettingsState }) {
  const d = s.desktop
  const { run, error, busy } = useAction()
  const key = shortcutLabel(d.commandKey, navigator.platform.startsWith('Mac'))
  return (
    <section id="desktop">
      <h2>Desktop</h2>
      <div className="toggle-row">
        <div>
          <div>Make Ubuntu match the island</div>
          <div className="hint">
            {d.applied
              ? 'On: Ubuntu follows the island’s light or dark and its accent colour. Undo puts back exactly what was there.'
              : 'Light or dark and the accent colour of the island for all of Ubuntu (its own Yaru themes), in one click and back in one click. Nothing needs your password.'}
          </div>
          {d.last && (d.last.changed.length > 0 || d.last.skipped.length > 0) && (
            <div className="hint desktop-last">
              {d.last.changed.length > 0 && <>Changed: {d.last.changed.join(', ')}. </>}
              {d.last.skipped.length > 0 && <>Not on this desktop: {d.last.skipped.join(', ')}.</>}
            </div>
          )}
        </div>
        {d.applied ? (
          <button className="secondary" disabled={busy} onClick={() => run(() => window.settings.desktop.undo())}>
            Undo
          </button>
        ) : (
          <button disabled={busy || !d.supported} onClick={() => run(() => window.settings.desktop.apply())}>
            Apply
          </button>
        )}
      </div>
      <Toggle label="The Dock at the bottom" hint="Like macOS’s: only as wide as its icons, and out of the way when a window needs the room." on={d.dock} onChange={(v) => run(() => window.settings.desktop.set({ dock: v }))} />
      <Toggle label="Window buttons on the left" hint="Close, minimise and maximise where a Mac has them." on={d.buttonsLeft} onChange={(v) => run(() => window.settings.desktop.set({ buttonsLeft: v }))} />
      <div className="brain-subhead">
        <div>GNOME extensions</div>
        <div className="hint">They finish the look. Each comes from extensions.gnome.org (the version for your GNOME) and is turned on with the rest; Undo turns it off again.</div>
      </div>
      {d.extensions.map((e) => {
        const use = e.id === 'blur' ? d.blur : d.hideClock
        const status = e.busy
          ? 'Getting it…'
          : e.error
            ? e.error
            : e.justInstalled
              ? 'Installed. GNOME starts it after you log out and back in (on Xorg, Alt+F2 then r restarts GNOME now).'
              : e.installed
                ? null
                : 'Not installed.'
        return (
          <div key={e.id} className="toggle-row desktop-ext" data-ext={e.id}>
            <div>
              <div>{e.name}</div>
              <div className="hint">{e.what}</div>
              {status && <div className={`hint${e.error ? ' warn' : ''}`}>{status}</div>}
            </div>
            {e.installed || e.justInstalled ? (
              <input className="switch" type="checkbox" aria-label={`Use ${e.name}`} checked={use} onChange={(ev) => run(() => window.settings.desktop.set(e.id === 'blur' ? { blur: ev.target.checked } : { hideClock: ev.target.checked }))} />
            ) : (
              <button className="secondary" disabled={busy || e.busy || !d.supported} onClick={() => run(() => window.settings.desktop.getExtension(e.id))}>
                Get it
              </button>
            )}
          </div>
        )
      })}
      <div className="toggle-row desktop-system">
        <div>
          <div>The login screen and boot splash</div>
          <div className="hint">
            {d.system.busy === 'apply'
              ? 'Ubuntu asks for your password; then the boot image is rebuilt, which takes a minute…'
              : d.system.busy === 'undo'
                ? 'Putting them back (Ubuntu asks for your password)…'
                : d.system.applied
                  ? 'In the island’s look: the login screen in its accent, light or dark, and the island’s orb while Ubuntu starts. They don’t follow later changes on their own (each needs your password): Apply again.'
                  : 'The login screen in the island’s accent, light or dark, and a boot splash with the island’s orb. These belong to the system, so Ubuntu asks for your password once; Undo puts back what was there.'}
          </div>
          {d.system.note && <div className="hint desktop-system-note">{d.system.note}</div>}
          {d.system.error && <div className="hint warn desktop-system-error">{d.system.error}</div>}
        </div>
        <span className="row">
          {d.system.applied && (
            <button className="secondary" disabled={!!d.system.busy || !d.supported} onClick={() => run(() => window.settings.desktop.system('undo'))}>
              Undo
            </button>
          )}
          <button disabled={!!d.system.busy || !d.supported} onClick={() => run(() => window.settings.desktop.system('apply'))}>
            {d.system.applied ? 'Apply again' : 'Apply…'}
          </button>
        </span>
      </div>
      <Toggle
        label={`Command bar (${key})`}
        hint="Open apps, files you had open, notes and settings, work out sums, change the system (“dark mode”, “volume 40”), or ask, from anywhere. Change the key in Keyboard shortcuts."
        on={d.commandBar}
        onChange={(v) => run(() => window.settings.desktop.set({ commandBar: v }))}
      />
      {!d.supported && <div className="warn">This needs GNOME’s settings (gsettings), as on Ubuntu.</div>}
      {error && <div className="error">{error}</div>}
    </section>
  )
}
