import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import type { SourceId, SourcesView } from '@shared/intake'
import { useAction } from './Settings'

const ago = (t: number | null) => {
  if (!t) return null
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

/**
 * Settings › Sources: what Island OS reads of what you do, each off until
 * you turn it on, all of it kept on this computer and filed into the brain
 * each evening.
 */
export function SourcesSection({ s }: { s: SettingsState }) {
  const v = s.os.sources
  const { run, error, busy } = useAction()
  const set = (patch: Record<string, unknown>) => run(() => window.settings.os<SourcesView>('sources.set', patch))
  const [cal, setCal] = useState(v.calendar)
  const [skip, setSkip] = useState(v.skip.join(', '))
  useEffect(() => setCal(v.calendar), [v.calendar])
  useEffect(() => setSkip(v.skip.join(', ')), [v.skip.join(', ')]) // eslint-disable-line react-hooks/exhaustive-deps
  const kept = (k: 'whatsapp' | 'mail' | 'phone', label: string, hint: string) => (
    <label className="toggle-row source-row" data-source={k}>
      <div>
        <div>{label}</div>
        <div className="hint">{hint}</div>
      </div>
      <input className="switch" type="checkbox" checked={v.kept[k]} onChange={(e) => run(() => window.settings.brain.set({ [k]: e.target.checked }))} />
    </label>
  )
  return (
    <section id="sources">
      <h2>Sources</h2>
      <p className="hint">
        What Island OS reads of what you do. Everything stays on this computer, and each one is off until you turn it on.
        {v.filing ? ' Each evening the brain keeps the day as notes (Your activity).' : ' Turn on the second brain to keep the days as notes; the Today panel uses them meanwhile.'}
      </p>
      {kept('mail', 'Mail', 'Sender, subject and first lines, one note a day.')}
      {kept('whatsapp', 'WhatsApp', 'One note a day; chats with a word you never keep are left out (Settings › Second brain).')}
      {v.list.map((src) => {
        const last = ago(src.last)
        const needsX = src.id === 'screen' && !v.screenable
        return (
          <div key={src.id} className={`toggle-row source-row${src.error ? ' failed' : ''}`} data-source={src.id}>
            <div>
              <div>{src.label}</div>
              <div className="hint">{src.what}</div>
              {src.on && (
                <div className={`hint source-status${src.error ? ' warn' : ''}`}>
                  {src.error ?? (needsX ? 'Screen time needs an X11 session.' : `${src.id === 'calendar' ? `${src.today} event${src.today === 1 ? '' : 's'} today` : `${src.today} today`}${last ? ` · looked ${last}` : ' · looking…'}`)}
                </div>
              )}
            </div>
            <span className="source-actions">
              {src.on && src.id !== 'screen' && (
                <button className="secondary small" disabled={busy} onClick={() => run(() => window.settings.os<SourcesView>('sources.check', src.id))}>
                  Check now
                </button>
              )}
              <input className="switch" type="checkbox" aria-label={`Keep ${src.label}`} checked={src.on} disabled={needsX && !src.on} onChange={(e) => set({ on: { [src.id as SourceId]: e.target.checked } })} />
            </span>
          </div>
        )
      })}
      <div className="toggle-row source-calendar">
        <div>
          <div>Calendar file or address</div>
          <div className="hint">A .ics file, or an https address (in Google Calendar: Settings › your calendar › Secret address in iCal format).</div>
        </div>
        <input
          type="text"
          aria-label="Calendar file or address"
          placeholder="~/calendar.ics"
          spellCheck={false}
          value={cal}
          onChange={(e) => setCal(e.target.value)}
          onBlur={() => cal.trim() !== v.calendar && void set({ calendar: cal.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="toggle-row source-skip">
        <div>
          <div>Never keep</div>
          <div className="hint">Commands, folders and window titles with any of these words, separated by commas.</div>
        </div>
        <input
          type="text"
          aria-label="Never keep"
          placeholder="vault, clients/acme"
          spellCheck={false}
          value={skip}
          onChange={(e) => setSkip(e.target.value)}
          onBlur={() => void set({ skip: skip.split(',').map((w) => w.trim()).filter(Boolean) })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      {error && <div className="error">{error}</div>}
    </section>
  )
}
