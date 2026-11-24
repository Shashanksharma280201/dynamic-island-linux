import { useEffect, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { BREAK_SNOOZE_MIN, ranLine, type Device, type Hud, type Translation, type Weather } from '@shared/extras'
import { Orb, AGENT_INK } from '../../orb/Orb'
import { useMinute } from '../states/NotchClock'
import { errorText } from '../hub/common'
import { LanguageGrid, WeatherBody } from '../hub/DashTiles'
import { BatteryGlyph, BrightnessGlyph, ChevGlyph, CrossGlyph, DeviceGlyph, DocGlyph, PhoneGlyph, Ring, SwapGlyph, TranslateGlyph, TrayGlyph, VolumeGlyph, Wx } from './glyphs'

const os = <T = unknown,>(fn: Parameters<typeof window.island.os>[0], ...args: unknown[]) => window.island.os<T>(fn, ...args)
const quiet = () => {}
const act = (e: MouseEvent, fn: () => void) => {
  e.stopPropagation()
  fn()
}

export { ownDrag } from './ownDrag'

// ---- Volume and brightness ---------------------------------------------------

/** The level, across the notch, while you change it. */
export function HudBar({ hud }: { hud: Hud }) {
  const muted = hud.what === 'volume' && !!hud.muted
  const text = muted ? 'Muted' : `${hud.value}%`
  return (
    <div className={`hud${muted ? ' muted' : ''}`} data-what={hud.what} role="status" aria-label={hud.what === 'volume' ? `Volume ${text}` : `Brightness ${text}`}>
      {hud.what === 'volume' ? <VolumeGlyph muted={muted} /> : <BrightnessGlyph />}
      <div className="hud-level">
        <span style={{ width: `${muted ? 0 : hud.value}%` }} />
      </div>
      <span className="hud-val">{text}</span>
    </div>
  )
}

// ---- A device connected ------------------------------------------------------

export function DeviceNote({ device }: { device: Device }) {
  return (
    <div className="device-note" role="status" aria-label={`${device.name} connected`}>
      <span className="device-glyph">
        <DeviceGlyph kind={device.kind} size={16} />
      </span>
      <span className="device-text">
        <span className="ellipsis">{device.name}</span>
        <small>Connected</small>
      </span>
      {device.battery !== null && (
        <span className="device-batt">
          <BatteryGlyph pct={device.battery} />
          {device.battery}%
        </span>
      )}
    </div>
  )
}

// ---- Translate ---------------------------------------------------------------

/** What you selected, and what it says: copy it, hear it, or put it where the selection is. */
export function TranslateCard({ t, keys }: { t: Translation; keys: string }) {
  const [picking, setPicking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const run = async (fn: 'translate.copy' | 'translate.replace' | 'translate.speak', done?: string) => {
    try {
      await os(fn)
      setNote(done ?? null)
    } catch (e) {
      setNote(errorText(e))
    }
  }
  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(null), 3500)
    return () => clearTimeout(timer)
  }, [note])
  const ran = ranLine(t.meta)
  return (
    <div className="card translate-card" data-phase={t.phase} onClick={(e) => e.stopPropagation()}>
      <div className="xcard-head">
        <TranslateGlyph size={15} />
        Translate
        <span className="spacer" />
        {t.source && (
          <button className="lang-pill" aria-expanded={picking} title="Change the language" onClick={() => setPicking(!picking)}>
            {t.from || 'Detect'} <SwapGlyph size={12} /> {t.to} <ChevGlyph size={11} />
          </button>
        )}
        <button className="x-btn" aria-label="Close" title="Close" onClick={(e) => act(e, () => void os('translate.close').catch(quiet))}>
          <CrossGlyph size={11} />
        </button>
      </div>
      {picking && (
        <LanguageGrid
          value={t.to}
          onPick={(lang) => {
            setPicking(false)
            void os('translate.to', lang).catch(quiet)
          }}
        />
      )}
      {t.source && <div className="tr-src">{t.source}</div>}
      {t.phase === 'working' ? (
        <div className="tr-working">
          <Orb state="solving" size={18} color={AGENT_INK} />
          Translating…
        </div>
      ) : t.phase === 'done' ? (
        <div className="tr-result" onWheel={(e) => e.stopPropagation()}>
          {t.text}
        </div>
      ) : t.phase === 'consent' ? (
        <div className="tr-ask">There’s no model on this computer for this. Send the text to {t.cloud}?</div>
      ) : (
        <div className="tr-ask">{t.error ?? `Select some text in any app, then press ${keys}.`}</div>
      )}
      <div className="xcard-foot">
        {note ? <span className="caption ellipsis">{note}</span> : ran && <span className={`ran-chip${ran.local ? ' local' : ''}`}>{ran.text}</span>}
        <span className="spacer" />
        {t.phase === 'consent' && (
          <button className="pill primary small" onClick={() => void os('translate.allow').catch(quiet)}>
            Send
          </button>
        )}
        {t.phase === 'done' && (
          <>
            <button className="pill small" onClick={() => void run('translate.speak')}>
              Speak
            </button>
            <button className="pill small" onClick={() => void run('translate.copy', 'Copied')}>
              Copy
            </button>
            <button className="pill primary small" title="Type it over what you selected" onClick={() => void run('translate.replace')}>
              Replace
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---- An eye break ------------------------------------------------------------

function useTick(ms: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function BreakCard({ rest }: { rest: { endsAt: number; seconds: number } }) {
  const now = useTick(250)
  const left = Math.max(0, Math.ceil((rest.endsAt - now) / 1000))
  return (
    <div className="card break-card" role="status" aria-label="Time to look away" onClick={(e) => e.stopPropagation()}>
      <Ring size={58} stroke={5} fraction={1 - left / rest.seconds} tone="var(--green)">
        {left}
      </Ring>
      <div className="break-text">
        <div className="headline">Look away for a moment</div>
        <div className="caption">Something far off, for {rest.seconds} seconds.</div>
        <div className="break-btns">
          <button className="pill small" onClick={() => void os('break.skip').catch(quiet)}>
            Skip
          </button>
          <button className="pill small" onClick={() => void os('break.later').catch(quiet)}>
            In {BREAK_SNOOZE_MIN} minutes
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Dropping files: three places ----------------------------------------------

export type Well = 'shelf' | 'docs' | 'phone'
const WELLS: Record<Well, { name: string; sub: string; icon: ReactNode }> = {
  shelf: { name: 'Shelf', sub: 'Keep them here for now', icon: <TrayGlyph size={20} /> },
  docs: { name: 'Documents', sub: 'Merge, split, convert', icon: <DocGlyph size={20} /> },
  phone: { name: 'Phone', sub: 'Send to your phone', icon: <PhoneGlyph size={20} /> },
}

/** What the island turns into while files are dragged over it: where they can go. Let go over one. */
export function DropWells({ count, wells, hot, onHot }: { count: number; wells: Well[]; hot: Well; onHot: (w: Well) => void }) {
  const files = count > 1 ? `${count} files` : count === 1 ? '1 file' : 'files'
  const over = (w: Well) => (e: DragEvent) => {
    e.preventDefault()
    onHot(w)
  }
  return (
    <div className="card drop-wells" data-wells={wells.length}>
      <div className="xcard-head">
        <TrayGlyph size={15} />
        Drop {files}
        <span className="spacer" />
        <span>PDF, images, anything</span>
      </div>
      <div className="wells" style={{ gridTemplateColumns: `repeat(${wells.length}, 1fr)` }}>
        {wells.map((w) => (
          <div key={w} className={`well${w === hot ? ' hot' : ''}`} data-well={w} onDragEnter={over(w)} onDragOver={over(w)}>
            <span className="well-ring">{WELLS[w].icon}</span>
            <b>{WELLS[w].name}</b>
            <small>{WELLS[w].sub}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- The weather, taking its turn -----------------------------------------------

export function CompactWeather({ weather }: { weather: Weather }) {
  return (
    <div className="capsule weather-capsule" title={`${weather.place}: ${weather.temp}°, ${weather.text.toLowerCase()} · click for the Dashboard`}>
      <span className="weather-temp">{weather.temp}°</span>
      <Wx kind={weather.kind} size={24} />
    </div>
  )
}

export function WeatherBubble({ weather }: { weather: Weather }) {
  return (
    <div className="detached-glyph weather-bubble" title={`${weather.place}: ${weather.temp}°, ${weather.text.toLowerCase()}`}>
      <Wx kind={weather.kind} size={19} />
    </div>
  )
}

export function WeatherCard({ weather, onOpen }: { weather: Weather; onOpen: () => void }) {
  const now = useMinute().getTime()
  return (
    <div className="card weather-card" onClick={(e) => act(e, onOpen)}>
      <div className="xcard-head">
        Weather
        <span className="spacer" />
        <span>{weather.place}</span>
      </div>
      <WeatherBody w={weather} now={now} />
    </div>
  )
}
