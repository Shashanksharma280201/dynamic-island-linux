import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { TILE_NAMES, type TileKind } from '@shared/dashboard'
import {
  LANGUAGES,
  bytesText,
  hm,
  hourText,
  ranLine,
  screenShares,
  shelfBadge,
  type AppsView,
  type DevicesView,
  type PinnedApp,
  type ScreenView,
  type ShelfItem,
  type ShelfView,
  type TodoView,
  type Translation,
  type Weather,
  type WeatherView,
} from '@shared/extras'
import {
  AsteriskGlyph,
  BluetoothGlyph,
  CalendarLine,
  ChecklistGlyph,
  ChevGlyph,
  ChipGlyph,
  CloudSunGlyph,
  CrossGlyph,
  DayGlyph,
  DeviceGlyph,
  FolderGlyph,
  HourglassGlyph,
  MicGlyph,
  NoteGlyph,
  PlusGlyph,
  SwapGlyph,
  TickGlyph,
  TimerGlyph,
  TranslateGlyph,
  TrayGlyph,
  Wx,
} from '../extras/glyphs'
import { errorText, useLoad } from './common'
import { ownDrag } from '../extras/ownDrag'
import { useKeyboard } from './useKeyboard'

export const TILE_GLYPHS: Record<TileKind, (p: { size?: number }) => ReactNode> = {
  media: NoteGlyph,
  timer: TimerGlyph,
  assistant: MicGlyph,
  system: ChipGlyph,
  day: DayGlyph,
  next: CalendarLine,
  claude: AsteriskGlyph,
  weather: CloudSunGlyph,
  devices: BluetoothGlyph,
  screen: HourglassGlyph,
  todo: ChecklistGlyph,
  shelf: TrayGlyph,
  translate: TranslateGlyph,
}

/** The menu's order: across its two columns, like things side by side. */
export const TILE_MENU: TileKind[] = ['media', 'next', 'timer', 'todo', 'assistant', 'day', 'weather', 'screen', 'system', 'claude', 'devices', 'translate', 'shelf']

const quiet = () => {}
const call = <T,>(fn: Parameters<typeof window.island.os>[0], ...args: unknown[]) => window.island.os<T>(fn, ...args)

/** Loads something Island OS shows, again whenever it says it changed. */
function useOs<T>(fn: Parameters<typeof window.island.os>[0], topic: string, deps: unknown[] = []) {
  return useLoad<T>(
    () => call<T>(fn),
    deps,
    (reload) => window.island.onOs((t) => t === topic && reload()),
    `os:${fn}`,
  )
}

/** A text field that takes the keyboard for the island while you're in it. */
function Field({
  value,
  onChange,
  onEnter,
  placeholder,
  onTyping,
  className,
  maxLength = 200,
}: {
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  placeholder: string
  onTyping: (on: boolean) => void
  className?: string
  maxLength?: number
}) {
  const kb = useKeyboard(onTyping)
  const input = useRef<HTMLInputElement>(null)
  return (
    <input
      ref={input}
      className={className}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={placeholder}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={() => {
        kb.take()
        // Focus again once the window can take the keyboard.
        setTimeout(() => input.current?.focus(), 50)
      }}
      onFocus={kb.take}
      onBlur={kb.release}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') onEnter()
        if (e.key === 'Escape') {
          onChange('')
          input.current?.blur()
        }
      }}
    />
  )
}

// ---- Weather ---------------------------------------------------------------

const deg = (n: number) => `${n}°`

/** The weather's body, as the tile and the notch's card both show it. */
export function WeatherBody({ w, now }: { w: Weather; now: number }) {
  return (
    <div className="wx-body">
      <div className="wx-now">
        <div className="wx-temp">{deg(w.temp)}</div>
        <div className="wx-cond">
          <b>{w.text}</b>
          <span>
            H {deg(w.high)}&nbsp;&nbsp;L {deg(w.low)}
          </span>
        </div>
        <Wx kind={w.kind} size={36} />
      </div>
      {w.hours.length > 0 && (
        <div className="wx-hours" style={{ gridTemplateColumns: `repeat(${w.hours.length}, 1fr)` }}>
          {w.hours.map((h, i) => (
            <div key={h.at}>
              {i === 0 && h.at <= now ? 'Now' : hourText(new Date(h.at))}
              <Wx kind={h.kind} size={15} />
              <b>{deg(h.temp)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function useWeather() {
  return useOs<WeatherView>('weather.view', 'weather')
}

/** Naming your town turns the weather on (that's the one thing it sends). */
function WeatherSetup({ onTyping, error: shown }: { onTyping: (on: boolean) => void; error?: string | null }) {
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(shown ?? null)
  const go = async () => {
    if (busy || place.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      await call('weather.place', place.trim())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="wx-setup">
      <div className="caption">{error ?? 'Your town or city. Its place on the map goes to Open-Meteo, nothing else.'}</div>
      <div className="tile-row">
        <Field className="tile-input" value={place} onChange={setPlace} onEnter={() => void go()} placeholder="Town or city" onTyping={onTyping} maxLength={60} />
        <button className="mini primary" disabled={busy || place.trim().length < 2} onClick={() => void go()}>
          {busy ? 'Looking…' : 'Set'}
        </button>
      </div>
    </div>
  )
}

export function WeatherTile({ view, onTyping, now }: { view: WeatherView | null; onTyping: (on: boolean) => void; now: number }) {
  if (!view) return <div className="caption">Loading…</div>
  if (!view.config.on) return <WeatherSetup onTyping={onTyping} />
  if (view.weather) return <WeatherBody w={view.weather} now={now} />
  if (view.error)
    return (
      <div className="dash-empty">
        <div className="caption">{view.error}</div>
        <button className="mini" onClick={() => void call('weather.set', { on: true }).catch(quiet)}>
          Try again
        </button>
      </div>
    )
  return <div className="caption">Reading the sky…</div>
}

// ---- Devices ---------------------------------------------------------------

export function DevicesTile() {
  const { data } = useOs<DevicesView>('devices.view', 'devices')
  if (!data) return <div className="caption">Looking…</div>
  if (!data.supported || !data.list.length)
    return (
      <div className="dash-empty">
        <BluetoothGlyph size={18} />
        <div className="dash-line">{data.supported && data.on === false ? 'Bluetooth is off' : 'No devices yet'}</div>
        <div className="caption">{data.supported ? 'Headphones, a mouse, a keyboard: what you pair shows here.' : 'Bluetooth devices show here on Linux.'}</div>
      </div>
    )
  return (
    <div className="devs">
      {data.list.slice(0, 3).map((d) => (
        <div key={d.id} className={`dev${d.connected ? ' on' : ''}`} title={d.name}>
          <span className="dev-glyph">
            <DeviceGlyph kind={d.kind} size={15} />
          </span>
          <span className="dev-name">
            <span className="ellipsis">{d.name}</span>
            <small>{d.connected ? 'Connected' : 'Not connected'}</small>
          </span>
          {d.battery !== null && <span className={`dev-pct${d.battery <= 20 ? ' low' : ''}`}>{d.battery}%</span>}
        </div>
      ))}
    </div>
  )
}

// ---- Screen time -----------------------------------------------------------

const SHARE_INK = ['var(--blue)', '#bf5af2', 'var(--green)', 'rgba(var(--ink), 0.25)']

export function ScreenTile({ minute }: { minute: number }) {
  const { data, reload } = useOs<ScreenView>('screen.view', 'sources', [minute])
  if (!data) return <div className="caption">Loading…</div>
  if (!data.on)
    return (
      <div className="dash-empty">
        <div className="dash-line">Screen time is off</div>
        <div className="caption">Minutes in front of each app, kept on this computer.</div>
        <button
          className="mini primary"
          onClick={() =>
            void call('sources.set', { on: { screen: true } })
              .then(reload)
              .catch(quiet)
          }
        >
          Turn on
        </button>
      </div>
    )
  const shares = screenShares(data.day)
  const h = Math.floor(data.day.total / 60)
  const m = data.day.total % 60
  return (
    <div className="st">
      <div className="dash-big st-total" title={`${hm(data.day.total)} at the screen today`}>
        {h > 0 && (
          <>
            {h}
            <span>h</span>{' '}
          </>
        )}
        {m}
        <span>m</span>
      </div>
      {shares.length > 0 ? (
        <>
          <div className="st-bar" aria-hidden>
            {shares.map((s, i) => (
              <span key={s.app} style={{ width: `${Math.max(2, s.share * 100)}%`, background: s.app === 'Other' ? SHARE_INK[3] : SHARE_INK[i] }} />
            ))}
          </div>
          <div className="st-legend">
            {shares
              .filter((s) => s.app !== 'Other')
              .map((s, i) => (
                <div key={s.app}>
                  <i style={{ background: SHARE_INK[i] }} />
                  <span className="ellipsis">{s.app}</span>
                  <b>{hm(s.min)}</b>
                </div>
              ))}
          </div>
        </>
      ) : (
        <div className="caption">Counting from now. Check back in a while.</div>
      )}
    </div>
  )
}

// ---- To-do -----------------------------------------------------------------

export function useTodos() {
  return useOs<TodoView>('todo.view', 'todo')
}

export function TodoTile({ view, onTyping }: { view: TodoView | null; onTyping: (on: boolean) => void }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    setText('')
    void call('todo.add', t).catch(quiet)
  }
  const list = view?.list ?? []
  return (
    <div className="todo">
      <div className="todo-list" onWheel={(e) => e.stopPropagation()}>
        {list.map((t) => (
          <div key={t.id} className={`todo-row${t.done ? ' done' : ''}`} data-todo={t.text}>
            <button className="todo-box" role="checkbox" aria-checked={t.done} aria-label={t.done ? `Not done: ${t.text}` : `Done: ${t.text}`} onClick={() => void call('todo.toggle', t.id).catch(quiet)}>
              {t.done && <TickGlyph size={11} />}
            </button>
            <span className="ellipsis" title={t.text}>
              {t.text}
            </span>
            <button className="todo-x" aria-label={`Remove: ${t.text}`} onClick={() => void call('todo.remove', t.id).catch(quiet)}>
              <CrossGlyph size={10} />
            </button>
          </div>
        ))}
      </div>
      <div className="todo-row new">
        <span className="todo-box plus" aria-hidden>
          <PlusGlyph size={13} />
        </span>
        <Field className="todo-input" value={text} onChange={setText} onEnter={add} placeholder="New to-do" onTyping={onTyping} />
      </div>
    </div>
  )
}

// ---- The shelf -------------------------------------------------------------

export function useShelf() {
  return useOs<ShelfView>('shelf.view', 'shelf')
}

const BADGE_INK: Record<string, string> = { pdf: '#ff453a', sheet: '#30d158', doc: '#0a84ff', slides: '#ff9f0a', archive: '#8e8e93', audio: '#ff375f', video: '#bf5af2', code: '#5e5ce6', other: '#8e8e93' }

/** A file as a small picture: the picture itself, a folder, or a page with its kind on it. */
export function FileThumb({ item, onRemove }: { item: ShelfItem; onRemove?: () => void }) {
  const badge = shelfBadge(item.name, item.kind)
  return (
    <span
      className={`thumb ${item.kind}${item.thumb ? ' pic' : ''}`}
      data-file={item.name}
      title={`${item.name} · drag it out, or click to show it in its folder`}
      draggable
      onDragStart={(e) => {
        // The island's own drag: the system carries the real file (and the island doesn't offer to take it back).
        e.preventDefault()
        ownDrag.on = true
        window.island.shelf?.drag(item.id)
      }}
      onClick={(e) => {
        e.stopPropagation()
        void call('shelf.open', item.id).catch(quiet)
      }}
    >
      {item.thumb ? <img src={item.thumb} alt="" draggable={false} /> : item.kind === 'folder' ? <FolderGlyph size={18} /> : item.kind === 'image' ? null : <em style={{ background: BADGE_INK[item.kind] ?? BADGE_INK.other }}>{badge || 'FILE'}</em>}
      {onRemove && (
        <button
          className="thumb-x"
          aria-label={`Take ${item.name} off the shelf`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <CrossGlyph size={9} />
        </button>
      )}
    </span>
  )
}

function useShelfActions() {
  const [busy, setBusy] = useState<'' | 'zip' | 'phone'>('')
  const [note, setNote] = useState<string | null>(null)
  const run = async (what: 'zip' | 'phone') => {
    if (busy) return
    setBusy(what)
    setNote(null)
    try {
      await call(what === 'zip' ? 'shelf.zip' : 'shelf.phone')
      if (what === 'zip') setNote('Zipped into Downloads')
    } catch (e) {
      setNote(errorText(e))
    } finally {
      setBusy('')
    }
  }
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(t)
  }, [note])
  return { busy, note, run }
}

const filesText = (n: number) => (n === 1 ? '1 file' : `${n} files`)

export function ShelfTile({ view }: { view: ShelfView | null }) {
  const a = useShelfActions()
  const items = view?.items ?? []
  if (!items.length)
    return (
      <div className="dash-empty">
        <TrayGlyph size={18} />
        <div className="dash-line">Nothing on the shelf</div>
        <div className="caption">Drag files to the island to keep them at hand.</div>
      </div>
    )
  return (
    <div className="shelf-tile">
      <div className="fan" aria-hidden>
        {items.slice(0, 3).map((i, n) => (
          <div key={i.id} className={`fan-file n${n} ${i.kind}${i.thumb ? ' pic' : ''}`} style={i.thumb ? { backgroundImage: `url(${i.thumb})` } : undefined} />
        ))}
      </div>
      <div className="shelf-side">
        <div className="dash-line">{filesText(items.length)}</div>
        <div className="caption ellipsis">{a.note ?? bytesText(view!.bytes)}</div>
        <div className="shelf-btns">
          {view!.phone && (
            <button className="mini primary" disabled={!!a.busy} onClick={() => void a.run('phone')}>
              To phone
            </button>
          )}
          <button className={`mini${view!.phone ? '' : ' primary'}`} disabled={!!a.busy} onClick={() => void a.run('zip')}>
            {a.busy === 'zip' ? 'Zipping…' : 'Zip'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The shelf across the top of the Dashboard, while there's something on it. */
export function ShelfStrip({ view }: { view: ShelfView }) {
  const a = useShelfActions()
  return (
    <div className="module shelf-strip" onClick={(e) => e.stopPropagation()}>
      <div className="strip-title">
        Shelf
        <small className="ellipsis">{a.note ?? `${filesText(view.items.length)} · ${bytesText(view.bytes)}`}</small>
      </div>
      <div className="strip-files" onWheel={(e) => e.stopPropagation()}>
        {view.items.map((i) => (
          <FileThumb key={i.id} item={i} onRemove={() => void call('shelf.remove', i.id).catch(quiet)} />
        ))}
      </div>
      {view.phone && (
        <button className="mini primary" disabled={!!a.busy} title={`Send them to ${view.phone}`} onClick={() => void a.run('phone')}>
          To phone
        </button>
      )}
      <button className="mini" disabled={!!a.busy} title="One zip in Downloads, in their place here" onClick={() => void a.run('zip')}>
        {a.busy === 'zip' ? 'Zipping…' : 'Zip'}
      </button>
      <button className="mini" disabled={!!a.busy} title="Take everything off the shelf (the files stay where they are)" onClick={() => void call('shelf.clear').catch(quiet)}>
        Clear
      </button>
    </div>
  )
}

// ---- Translate -------------------------------------------------------------

/** The languages, as a small grid to pick from. */
export function LanguageGrid({ value, onPick }: { value: string; onPick: (lang: string) => void }) {
  return (
    <div className="lang-grid" role="radiogroup" aria-label="Translate into">
      {LANGUAGES.map((l) => (
        <button key={l} role="radio" aria-checked={l === value} className={l === value ? 'on' : ''} onClick={() => onPick(l)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function TranslateTile({ to, onTyping }: { to: string; onTyping: (on: boolean) => void }) {
  const [text, setText] = useState('')
  const [r, setR] = useState<Translation | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const go = async (consent = false) => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      setR(await call<Translation>('translate.text', t, to, consent))
    } catch (e) {
      setR({ source: t, to, phase: 'error', error: errorText(e) })
    } finally {
      setBusy(false)
    }
  }
  const ran = r?.phase === 'done' ? ranLine(r.meta) : null
  return (
    <div className="tr">
      <button className="lang-pill" aria-expanded={picking} title="Change the language" onClick={() => setPicking(!picking)}>
        {r?.phase === 'done' && r.from ? r.from : 'Detect'} <SwapGlyph size={12} /> {to} <ChevGlyph size={10} />
      </button>
      {picking ? (
        <LanguageGrid
          value={to}
          onPick={(lang) => {
            setPicking(false)
            setR(null)
            void call('translate.to', lang).catch(quiet)
          }}
        />
      ) : (
        <div className="tr-field">
          <Field className="tr-input" value={text} onChange={(v) => (setText(v), setR(null))} onEnter={() => void go()} placeholder="Type to translate" onTyping={onTyping} maxLength={500} />
          {busy ? (
            <small>Translating…</small>
          ) : r?.phase === 'done' ? (
            <small className="tr-out" title={ran?.text}>
              {r.text}
            </small>
          ) : r?.phase === 'consent' ? (
            <small>
              Send it to {r.cloud}?{' '}
              <button className="plain" onClick={() => void go(true)}>
                Send
              </button>
            </small>
          ) : r?.phase === 'error' ? (
            <small className="tr-err">{r.error}</small>
          ) : (
            <small>Press Enter. Or select text anywhere and use the shortcut.</small>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Choosing a tile: a menu, as on a Mac -----------------------------------

export function TileMenu({ current, nameOf, onPick, onClose }: { current: TileKind; nameOf: (k: TileKind) => string; onPick: (k: TileKind) => void; onClose: () => void }) {
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="tile-menu" role="menu" aria-label="Show in this tile" onClick={(e) => e.stopPropagation()}>
      {TILE_MENU.map((k) => {
        const G = TILE_GLYPHS[k]
        return (
          <button key={k} role="menuitemradio" aria-checked={k === current} className={k === current ? 'on' : ''} data-kind={k} onClick={() => onPick(k)}>
            <G size={15} />
            <span className="ellipsis">{nameOf(k)}</span>
            {k === current && (
              <em>
                <TickGlyph size={13} />
              </em>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---- The row of apps ---------------------------------------------------------

function AppIcon({ app }: { app: Pick<PinnedApp, 'name' | 'icon'> }) {
  return app.icon ? <img src={app.icon} alt="" draggable={false} /> : <span className="app-letter">{app.name.slice(0, 1).toUpperCase()}</span>
}

/**
 * Your apps under the tiles: click one to open it (a dot under those that
 * are running). Edit takes one out; the plus adds any app that's installed.
 */
export function AppsRow({ edit, onTyping }: { edit: boolean; onTyping: (on: boolean) => void }) {
  const { data, reload } = useOs<AppsView>('apps.view', 'apps')
  const [adding, setAdding] = useState(false)
  const [all, setAll] = useState<PinnedApp[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!adding) return
    setQ('')
    void call<PinnedApp[]>('apps.all')
      .then(setAll)
      .catch(() => setAll([]))
  }, [adding])
  // Which are running changes without the island being told: look again now and then.
  useEffect(() => {
    const t = setInterval(reload, 15_000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data?.supported) return null
  const pinned = new Set(data.pins.map((p) => p.id))
  const found = (all ?? []).filter((a) => !pinned.has(a.id) && a.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)
  const full = data.pins.length >= 8
  return (
    <div className="module apps-row" data-editing={edit ? 'yes' : undefined} onClick={(e) => e.stopPropagation()}>
      {data.pins.map((a) => (
        <button key={a.id} className={`app${a.running ? ' running' : ''}`} data-app={a.name} title={a.running ? `${a.name} (open)` : a.name} aria-label={`Open ${a.name}`} onClick={() => !edit && void call('apps.launch', a.id).catch(quiet)}>
          <AppIcon app={a} />
          {edit && (
            <span
              className="app-x"
              role="button"
              aria-label={`Take ${a.name} out of the row`}
              onClick={(e) => {
                e.stopPropagation()
                void call('apps.pin', a.id, false).catch(quiet)
              }}
            >
              <CrossGlyph size={9} />
            </span>
          )}
        </button>
      ))}
      {!data.pins.length && <span className="caption apps-none">Your apps, one click away. Add some with the plus.</span>}
      <span className="spacer" />
      {!full && (
        <button className={`app add${adding ? ' on' : ''}`} aria-label="Add an app" aria-expanded={adding} title="Add an app" onClick={() => setAdding(!adding)}>
          <PlusGlyph size={18} />
        </button>
      )}
      {adding && (
        <div className="app-menu" role="dialog" aria-label="Add an app">
          <Field className="app-search" value={q} onChange={setQ} onEnter={() => found[0] && void call('apps.pin', found[0].id, true).then(() => setAdding(false))} placeholder="Search your apps" onTyping={onTyping} maxLength={40} />
          <div className="app-list" onWheel={(e) => e.stopPropagation()}>
            {all === null ? (
              <div className="caption">Looking…</div>
            ) : found.length ? (
              found.map((a) => (
                <button
                  key={a.id}
                  data-app={a.name}
                  onClick={() =>
                    void call('apps.pin', a.id, true)
                      .then(() => setAdding(false))
                      .catch(quiet)
                  }
                >
                  <span className="app small">
                    <AppIcon app={a} />
                  </span>
                  <span className="ellipsis">{a.name}</span>
                </button>
              ))
            ) : (
              <div className="caption">No app by that name.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** What a tile is called (the assistant's tile goes by its name). */
export const tileName = (k: TileKind, assistant: string) => (k === 'assistant' ? assistant : TILE_NAMES[k])
