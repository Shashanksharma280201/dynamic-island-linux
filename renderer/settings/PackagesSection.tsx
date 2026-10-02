import type { ReactNode } from 'react'
import type { SettingsState } from '@shared/types'
import { PACKAGES, type PackageId } from '@shared/packages'
import { MailAppIcon, NotesAppIcon, SettingsAppIcon, SpotifyAppIcon, WhatsAppIcon } from '../island/hub/AppIcons'
import { useAction } from './Settings'

const ICONS: Record<PackageId, ReactNode> = {
  basics: <SettingsAppIcon />,
  notes: <NotesAppIcon />,
  chats: <WhatsAppIcon />,
  mail: <MailAppIcon />,
  music: <SpotifyAppIcon />,
}

/** Settings → Packages: what the island and its agent can do. */
export function PackagesSection({ s }: { s: SettingsState }) {
  const { run, error } = useAction()
  return (
    <section id="packages">
      <h2>Packages</h2>
      {PACKAGES.map((p) => {
        const on = p.required || !s.packages.disabled.includes(p.id)
        return (
          <div key={p.id} className={`package-row${on ? '' : ' off'}`} data-package={p.id}>
            <span className="package-icon">{ICONS[p.id]}</span>
            <div className="package-text">
              <div className="package-name">
                {p.name}
                {p.required && <span className="hint"> · always on</span>}
              </div>
              <div className="hint">{p.description}</div>
              <div className="package-tools">
                {p.tools.map((t) => (
                  <span key={t.name} className={`package-tool${t.asks ? ' asks' : ''}`} title={t.asks ? 'Asks you first' : undefined}>
                    {t.summary}
                    {t.asks && ' · asks first'}
                  </span>
                ))}
              </div>
              <div className="hint package-perms">Uses: {p.permissions.join(', ')}</div>
            </div>
            {!p.required && (
              <input
                className="switch"
                type="checkbox"
                aria-label={`${p.name} package`}
                checked={on}
                onChange={(e) => run(() => window.settings.setPackage(p.id, e.target.checked))}
              />
            )}
          </div>
        )
      })}
      <div className="hint">Turning a package off hides its tab and takes its tools away from the agent. More packages (Documents, CRM…) are on the way.</div>
      {error && <div className="error">{error}</div>}
    </section>
  )
}
