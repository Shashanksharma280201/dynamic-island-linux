import type { SettingsState } from '@shared/types'
import { FEATURE_NAMES, whenText } from '@shared/privacy'
import { Toggle, useAction } from './Settings'

const name = (f: string) => FEATURE_NAMES[f] ?? f

/** Settings › Privacy: what has left this computer, where to and when, and a switch to stop it. */
export function PrivacySection({ s }: { s: SettingsState }) {
  const p = s.privacy
  const { run, error } = useAction()
  return (
    <section id="privacy">
      <h2>Privacy</h2>
      <Toggle
        label="Pause AI and the web"
        hint="Nothing goes to an AI, a photo site or a service until you turn this off. Session notes are written without an AI meanwhile. WhatsApp, mail and Spotify keep working, and so does an AI on this computer (Ollama)."
        on={p.paused}
        onChange={(v) => run(() => window.settings.setPaused(v))}
      />
      <div className="privacy-block">
        <div>Where things went</div>
        <div className="hint">The island keeps this list on this computer for 30 days: what was sent and where, never what it said.</div>
        {p.places.length === 0 ? (
          <div className="privacy-empty hint">Nothing has left this computer yet.</div>
        ) : (
          <div className="privacy-list">
            {p.places.map((pl) => (
              <div key={pl.to} className="privacy-row">
                <div className="privacy-main">
                  <div className="privacy-to">{pl.to}</div>
                  <div className="hint">{pl.features.map(name).join(', ')}</div>
                </div>
                <div className="privacy-meta hint">
                  {pl.count} {pl.count === 1 ? 'time' : 'times'} · {whenText(pl.last)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {p.recent.length > 0 && (
        <div className="privacy-block">
          <div>Recently</div>
          <div className="privacy-list">
            {p.recent.slice(0, 25).map((e) => (
              <div key={`${e.feature}|${e.to}|${e.what}|${e.first}`} className="privacy-row">
                <div className="privacy-main">
                  <div>
                    <span className="privacy-feature">{name(e.feature)}</span> sent {e.what}
                  </div>
                  <div className="hint">to {e.to}</div>
                </div>
                <div className="privacy-meta hint">
                  {e.count > 1 ? `${e.count}× · ` : ''}
                  {whenText(e.at)}
                </div>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="secondary" onClick={() => run(() => window.settings.clearPrivacy())}>
              Clear the list
            </button>
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  )
}
