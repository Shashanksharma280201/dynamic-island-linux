import { useEffect, useState } from 'react'
import type { ExtrasView, WeatherView } from '@shared/extras'
import { Segmented, Toggle, useAction } from './Settings'

const EVERY = [10, 15, 20, 30, 45, 60]

/**
 * General › the notch's extras: the volume and brightness on the island, a
 * word when a device connects, the weather's place, eye breaks, a second set
 * of tiles for the evening, and staying out of screen shares.
 */
export function ExtrasToggles() {
  const [v, setV] = useState<ExtrasView | null>(null)
  const [place, setPlace] = useState('')
  const { run, error, busy } = useAction()
  const load = () =>
    window.settings
      .os<ExtrasView>('extras.view')
      .then((x) => {
        setV(x)
        setPlace(x.weather.place)
      })
      .catch(() => {})
  useEffect(() => void load(), [])
  const set = (patch: Record<string, unknown>) => run(async () => setV(await window.settings.os<ExtrasView>('extras.set', patch)))
  const weather = (fn: 'weather.place' | 'weather.set', arg: unknown) =>
    run(async () => {
      await window.settings.os<WeatherView>(fn, arg)
      await load()
    })
  if (!v) return null
  return (
    <>
      <Toggle
        label="Volume and brightness on the island"
        hint={v.canHud ? 'Change the volume or the screen’s brightness (the keys, a slider, anything) and the notch widens to show the level for a moment' : 'On Linux, the notch shows the level while you change it. Not on this system'}
        on={v.hud && v.canHud}
        disabled={!v.canHud}
        onChange={(on) => void set({ hud: on })}
      />
      <Toggle label="Say when a device connects" hint="Headphones, a mouse, a keyboard: its name and battery on the island for a few seconds (Bluetooth, on Linux)" on={v.deviceNotes} onChange={(on) => void set({ deviceNotes: on })} />
      <div className="toggle-row extras-weather">
        <div>
          <div>Weather</div>
          <div className="hint">
            {v.weather.on
              ? `In the Dashboard for ${v.weather.place}, and beside what else is on the island. The place’s position goes to Open-Meteo and nothing else (see Privacy)`
              : 'Name your town or city to see the weather in the Dashboard. Its position on the map goes to Open-Meteo, a free weather service, and nothing else'}
          </div>
        </div>
        <input
          type="text"
          aria-label="Town or city"
          placeholder="Town or city"
          value={place}
          spellCheck={false}
          onChange={(e) => setPlace(e.target.value)}
          onBlur={() => place.trim() && place.trim() !== v.weather.place && void weather('weather.place', place.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      {v.weather.place && (
        <div className="toggle-row extras-weather-on">
          <div>
            <div>Show the weather</div>
            {v.weatherError && v.weather.on && <div className="hint">{v.weatherError}</div>}
          </div>
          <Segmented value={v.weather.unit} options={[{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }]} onChange={(unit) => void weather('weather.set', { unit })} />
          <input className="switch" type="checkbox" aria-label="Show the weather" checked={v.weather.on} disabled={busy} onChange={(e) => void weather('weather.set', { on: e.target.checked })} />
        </div>
      )}
      <Toggle
        label="Eye breaks"
        hint={`After ${v.breaks.everyMin} minutes at the screen, the island asks you to look at something far off for 20 seconds. Minutes away from the computer don’t count`}
        on={v.breaks.on}
        onChange={(on) => void set({ breaks: { on } })}
      />
      {v.breaks.on && (
        <div className="toggle-row extras-every">
          <div>Every</div>
          <select className="display-select" aria-label="How often" value={v.breaks.everyMin} onChange={(e) => void set({ breaks: { everyMin: Number(e.target.value) } })}>
            {EVERY.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => void run(() => window.settings.os('break.now'))}>
            Try it
          </button>
        </div>
      )}
      <Toggle
        label="Different tiles in the evening"
        hint="The Dashboard keeps a second set of four tiles for the evening (music, the weather, your to-dos, screen time, until you change them). Edit them there while it’s the evening"
        on={v.profiles.on}
        onChange={(on) => void set({ profiles: { on } })}
      />
      {v.profiles.on && (
        <div className="toggle-row extras-evening">
          <div>The evening runs from</div>
          <input type="time" aria-label="The evening starts" value={v.profiles.eveningFrom} onChange={(e) => e.target.value && void set({ profiles: { eveningFrom: e.target.value } })} />
          <span className="hint">until</span>
          <input type="time" aria-label="The day starts" value={v.profiles.dayFrom} onChange={(e) => e.target.value && void set({ profiles: { dayFrom: e.target.value } })} />
        </div>
      )}
      <Toggle
        label="Hide the island from screen sharing"
        hint={v.canHide ? 'The island stays out of screen shares, recordings and screenshots: only you see it' : 'Keeps the island out of screen shares and recordings on Mac and Windows. Linux has no way to do this yet'}
        on={v.hideFromCapture && v.canHide}
        disabled={!v.canHide}
        onChange={(on) => void set({ hideFromCapture: on })}
      />
      {error && <p className="error">{error}</p>}
    </>
  )
}
