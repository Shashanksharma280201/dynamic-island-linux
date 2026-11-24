import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  BREAK_SECONDS,
  BREAK_SNOOZE_MIN,
  SHELF_MAX,
  addTodo,
  breakTick,
  brightnessChanged,
  deviceChanged,
  forecastUrl,
  geocodeUrl,
  parseDeviceInfo,
  parseDeviceList,
  parseForecast,
  parseGeocode,
  parseShelf,
  parseTodos,
  readTranslation,
  removeTodo,
  shelfKind,
  sinkChanged,
  sortDevices,
  soundHud,
  tidyTodos,
  toggleTodo,
  translatePrompt,
  visibleTodos,
  zipName,
  zipNames,
  TRANSLATE_MAX,
  type BreakConfig,
  type Device,
  type DevicesView,
  type Hud,
  type ShelfItem,
  type TodoView,
  type Translation,
  type Weather,
  type WeatherConfig,
  type WeatherView,
} from '@shared/extras'
import type { AnswerMeta } from '@shared/engine'
import { parseBluetooth, parseMuted, parseVolume } from '../providers/system'

type Run = (cmd: string, args: string[]) => Promise<string | null>

/** Runs a command; its output, or null if it failed or isn't installed. */
const run: Run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000 }, (err, stdout) => resolve(err ? null : stdout.toString()))
  })

const id = () => `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`

function saveJson(file: string, value: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(value))
    renameSync(`${file}.tmp`, file)
  } catch (e) {
    console.error(`[island] couldn't save ${basename(file)}:`, (e as Error).message)
  }
}

function loadJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * A command that keeps running and says things line by line (`pactl
 * subscribe`, `gdbus monitor`). If it stops it's started again a little
 * later; one that never stays up (not installed, no such service) is left alone.
 */
export class LineWatch {
  private child: ChildProcess | null = null
  private stopped = true
  private quick = 0
  private timer: NodeJS.Timeout | null = null

  constructor(
    private cmd: string,
    private args: string[],
    private onLine: (line: string) => void,
  ) {}

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.spawn()
  }

  private spawn(): void {
    if (this.stopped) return
    const began = Date.now()
    let buf = ''
    let child: ChildProcess
    try {
      child = spawn(this.cmd, this.args, { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      return
    }
    this.child = child
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString()
      let at: number
      while ((at = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, at)
        buf = buf.slice(at + 1)
        try {
          this.onLine(line)
        } catch (e) {
          console.error('[island] watch:', (e as Error).message)
        }
      }
      // A line that never ends isn't one of ours.
      if (buf.length > 20_000) buf = ''
    })
    const again = () => {
      if (this.child !== child) return
      this.child = null
      if (this.stopped) return
      // Gone at once, three times running: it isn't there to watch.
      this.quick = Date.now() - began < 3000 ? this.quick + 1 : 0
      if (this.quick >= 3) return
      this.timer = setTimeout(() => this.spawn(), 5000)
      this.timer.unref?.()
    }
    child.on('error', again)
    child.on('exit', again)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.child?.kill()
    this.child = null
  }
}

/**
 * The volume and the screen's brightness as you change them (with the
 * keyboard's keys, the system's own slider, anything): the island hears of
 * it from PulseAudio or PipeWire and from the desktop's power service, and
 * shows the new level on the notch. Linux.
 */
export class HudWatch {
  private watches: LineWatch[] = []
  private sound: { volume: number; muted: boolean } | null = null
  private reading = false
  private again = false
  private timer: NodeJS.Timeout | null = null

  constructor(private d: { onHud: (h: Hud) => void; platform?: NodeJS.Platform; run?: Run }) {}

  get supported(): boolean {
    return (this.d.platform ?? process.platform) === 'linux'
  }

  start(): void {
    if (!this.supported || this.watches.length) return
    void this.readSound(true)
    this.watches = [
      new LineWatch('pactl', ['subscribe'], (line) => {
        if (!sinkChanged(line)) return
        // A drag of the slider is many changes: read once they pause for a moment.
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => void this.readSound(false), 30)
      }),
      new LineWatch('gdbus', ['monitor', '--session', '--dest', 'org.gnome.SettingsDaemon.Power', '--object-path', '/org/gnome/SettingsDaemon/Power'], (line) => {
        const v = brightnessChanged(line)
        if (v !== null) this.d.onHud({ what: 'brightness', value: v })
      }),
    ]
    for (const w of this.watches) w.start()
  }

  private async readSound(first: boolean): Promise<void> {
    if (this.reading) {
      this.again = true
      return
    }
    this.reading = true
    try {
      const r = this.d.run ?? run
      const [vol, mute] = await Promise.all([r('pactl', ['get-sink-volume', '@DEFAULT_SINK@']), r('pactl', ['get-sink-mute', '@DEFAULT_SINK@'])])
      const volume = parseVolume(vol ?? '')
      if (volume === null) return
      const next = { volume: Math.min(100, volume), muted: parseMuted(mute ?? '') }
      const hud = first ? null : soundHud(this.sound, next)
      this.sound = next
      if (hud) this.d.onHud(hud)
    } finally {
      this.reading = false
      if (this.again) {
        this.again = false
        void this.readSound(false)
      }
    }
  }

  stop(): void {
    for (const w of this.watches) w.stop()
    this.watches = []
    if (this.timer) clearTimeout(this.timer)
  }
}

/** The Bluetooth devices this computer knows (bluetoothctl), and a word when one connects. */
export class Devices {
  private cache: { at: number; view: DevicesView } | null = null
  private watch: LineWatch | null = null
  private told = new Map<string, number>()

  constructor(private d: { onConnected?: (dev: Device) => void; onChange?: () => void; platform?: NodeJS.Platform; run?: Run; now?: () => number } = {}) {}

  private get run(): Run {
    return this.d.run ?? run
  }
  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  async view(fresh = false): Promise<DevicesView> {
    if ((this.d.platform ?? process.platform) !== 'linux') return { supported: false, on: null, list: [] }
    if (!fresh && this.cache && this.now() - this.cache.at < 8000) return this.cache.view
    const show = await this.run('bluetoothctl', ['show'])
    if (show === null) return this.keep({ supported: false, on: null, list: [] })
    const on = parseBluetooth(show)
    const known = parseDeviceList((await this.run('bluetoothctl', ['devices'])) ?? '').slice(0, 16)
    const list = await Promise.all(known.map(async (k) => parseDeviceInfo(k.id, (await this.run('bluetoothctl', ['info', k.id])) ?? '', k.name)))
    return this.keep({ supported: true, on, list: sortDevices(list) })
  }

  private keep(view: DevicesView): DevicesView {
    this.cache = { at: this.now(), view }
    return view
  }

  /** Watch for devices connecting (the system bus says so). */
  start(): void {
    if ((this.d.platform ?? process.platform) !== 'linux' || this.watch) return
    this.watch = new LineWatch('gdbus', ['monitor', '--system', '--dest', 'org.bluez'], (line) => {
      const c = deviceChanged(line)
      if (!c) return
      this.cache = null
      this.d.onChange?.()
      if (!c.connected) return
      // Some devices connect twice in a moment (audio, then controls): say it once.
      const last = this.told.get(c.id) ?? 0
      if (this.now() - last < 15_000) return
      this.told.set(c.id, this.now())
      // Its battery is known a moment after it connects.
      setTimeout(() => void this.announce(c.id), 1500).unref?.()
    })
    this.watch.start()
  }

  private async announce(mac: string): Promise<void> {
    const info = await this.run('bluetoothctl', ['info', mac])
    if (info === null) return
    const dev = parseDeviceInfo(mac, info)
    if (dev.connected) this.d.onConnected?.(dev)
  }

  stop(): void {
    this.watch?.stop()
    this.watch = null
  }
}

const WEATHER_EVERY = 20 * 60_000

/**
 * The weather where you said you are, from Open-Meteo (no account, no key).
 * Off until you name a place; what's sent is that place's coordinates, and
 * it goes through the same pause and log as everything else that leaves.
 */
export class WeatherService {
  private weather: Weather | null = null
  private error: string | null = null
  private loading: Promise<void> | null = null

  constructor(
    private d: {
      config: () => WeatherConfig
      save: (c: WeatherConfig) => void
      blocked: (host: string) => string | null
      note: (to: string, what: string) => void
      onChange: () => void
      /** Tests: one stand-in for both of Open-Meteo's sites. */
      base?: string
      now?: () => number
    },
  ) {}

  private now(): number {
    return (this.d.now ?? Date.now)()
  }
  private get forecastBase(): string {
    return this.d.base || 'https://api.open-meteo.com'
  }
  private get geoBase(): string {
    return this.d.base || 'https://geocoding-api.open-meteo.com'
  }

  view(): WeatherView {
    const config = this.d.config()
    // Still fresh, or being read: show what there is.
    if (config.on && (!this.weather || this.now() - this.weather.at > WEATHER_EVERY)) void this.refresh()
    return { config, weather: config.on ? this.weather : null, error: config.on ? this.error : null }
  }

  private async get(url: string, what: string): Promise<unknown> {
    const host = new URL(url).host
    const paused = this.d.blocked(host)
    if (paused) throw new Error(paused)
    this.d.note(host, what)
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error(`The weather service answered ${r.status}.`)
    return r.json()
  }

  refresh(force = false): Promise<void> {
    const c = this.d.config()
    if (!c.on || c.lat === null || c.lon === null) return Promise.resolve()
    if (this.loading) return this.loading
    if (!force && this.weather && this.now() - this.weather.at < WEATHER_EVERY) return Promise.resolve()
    this.loading = (async () => {
      try {
        const w = parseForecast(await this.get(forecastUrl(this.forecastBase, c.lat!, c.lon!, c.unit), 'the place you chose for the weather'), c.place, c.unit, this.now())
        if (!w) throw new Error('The weather service sent something I couldn’t read.')
        this.weather = w
        this.error = null
      } catch (e) {
        this.error = friendly(e)
      } finally {
        this.loading = null
        this.d.onChange()
      }
    })()
    return this.loading
  }

  /** Look a place up by name, keep it, and turn the weather on. */
  async setPlace(name: string): Promise<WeatherView> {
    const q = name.trim()
    if (q.length < 2) throw new Error('Type the name of a town or city.')
    const found = parseGeocode(await this.get(geocodeUrl(this.geoBase, q), 'the name of the place you typed').catch((e) => Promise.reject(new Error(friendly(e)))))
    if (!found) throw new Error(`I couldn’t find “${q}”. Try the nearest town or city.`)
    this.d.save({ ...this.d.config(), on: true, place: found.place, lat: found.lat, lon: found.lon })
    this.weather = null
    this.error = null
    await this.refresh(true)
    return this.view()
  }

  /** On or off, Celsius or Fahrenheit. */
  async set(o: { on?: unknown; unit?: unknown }): Promise<WeatherView> {
    const c = this.d.config()
    const next: WeatherConfig = { ...c, ...(typeof o.on === 'boolean' ? { on: o.on && c.lat !== null } : {}), ...(o.unit === 'c' || o.unit === 'f' ? { unit: o.unit } : {}) }
    this.d.save(next)
    if (next.unit !== c.unit || !next.on) this.weather = null
    if (next.on) await this.refresh(true)
    else this.d.onChange()
    return this.view()
  }

  lastError(): string | null {
    return this.error
  }
}

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/abort|timeout/i.test(m)) return 'The weather service took too long to answer.'
  if (/fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|network/i.test(m)) return 'I couldn’t reach the weather service. Check the internet connection.'
  return m
}

/** A short list of things to do, kept in a file. */
export class Todos {
  private list = parseTodos(null)

  constructor(private d: { file: string; onChange: () => void; now?: () => number }) {
    this.list = parseTodos(loadJson(d.file))
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  view(): TodoView {
    const list = visibleTodos(this.list, this.now())
    return { list, left: list.filter((t) => !t.done).length }
  }

  private set(next: typeof this.list): TodoView {
    if (next !== this.list) {
      this.list = tidyTodos(next, this.now())
      saveJson(this.d.file, this.list)
      this.d.onChange()
    }
    return this.view()
  }

  add(text: string): TodoView {
    return this.set(addTodo(this.list, text, this.now(), id()))
  }
  toggle(todo: string): TodoView {
    return this.set(toggleTodo(this.list, todo, this.now()))
  }
  remove(todo: string): TodoView {
    return this.set(removeTodo(this.list, todo))
  }
}

const ZIP_MAX_BYTES = 300 * 1024 * 1024
const ZIP_MAX_FILES = 2000

/**
 * The shelf: files you dropped on the island to keep at hand. It remembers
 * where they are (nothing is copied), and can zip them or hand them on.
 */
export class Shelf {
  private items: ShelfItem[] = []
  private thumbs = new Map<string, string | undefined>()

  constructor(private d: { file: string; downloads: () => string; thumb?: (path: string) => string | undefined; onChange: () => void; now?: () => number }) {
    this.items = parseShelf(loadJson(d.file))
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  /** What's on it now: files that have since been moved or deleted are gone from it too. */
  list(): ShelfItem[] {
    const still = this.items.filter((i) => existsSync(i.path))
    if (still.length !== this.items.length) {
      this.items = still
      saveJson(this.d.file, this.items)
    }
    return this.items.map((i) => (i.kind === 'image' ? { ...i, thumb: this.thumb(i.path) } : i))
  }

  private thumb(path: string): string | undefined {
    if (!this.thumbs.has(path)) {
      let t: string | undefined
      try {
        t = this.d.thumb?.(path)
      } catch {
        t = undefined
      }
      this.thumbs.set(path, t)
    }
    return this.thumbs.get(path)
  }

  bytes(): number {
    return this.items.reduce((n, i) => n + i.size, 0)
  }

  paths(): string[] {
    return this.list().map((i) => i.path)
  }

  path(item: string): string | null {
    return this.items.find((i) => i.id === item)?.path ?? null
  }

  /** Put files on the shelf (the newest first); says how many were new. */
  async add(paths: unknown): Promise<number> {
    const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string' && !!p).slice(0, SHELF_MAX) : []
    let added = 0
    for (const p of list) {
      if (this.items.some((i) => i.path === p)) continue
      const s = await stat(p).catch(() => null)
      if (!s) continue
      const name = basename(p)
      this.items = [{ id: id(), path: p, name, size: s.isDirectory() ? 0 : s.size, kind: shelfKind(name, s.isDirectory()), at: this.now() }, ...this.items].slice(0, SHELF_MAX)
      added++
    }
    if (added) this.changed()
    return added
  }

  remove(item: string): void {
    const next = this.items.filter((i) => i.id !== item)
    if (next.length === this.items.length) return
    this.items = next
    this.changed()
  }

  clear(): void {
    if (!this.items.length) return
    this.items = []
    this.thumbs.clear()
    this.changed()
  }

  private changed(): void {
    saveJson(this.d.file, this.items)
    this.d.onChange()
  }

  /** Everything on the shelf as one zip in Downloads; the zip takes their place on the shelf. */
  async zip(): Promise<string> {
    const items = this.list()
    if (!items.length) throw new Error('The shelf is empty.')
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const names = zipNames(items.map((i) => i.name))
    let bytes = 0
    let files = 0
    const addFile = async (path: string, as: string) => {
      const s = await stat(path)
      bytes += s.size
      files++
      if (bytes > ZIP_MAX_BYTES) throw new Error('That’s more than 300 MB: too much to zip here.')
      if (files > ZIP_MAX_FILES) throw new Error('That’s more than 2,000 files: too many to zip here.')
      zip.file(as, await readFile(path))
    }
    const addDir = async (dir: string, as: string): Promise<void> => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) await addDir(join(dir, e.name), `${as}/${e.name}`)
        else if (e.isFile()) await addFile(join(dir, e.name), `${as}/${e.name}`)
      }
    }
    for (const [n, item] of items.entries()) {
      if (statSync(item.path).isDirectory()) await addDir(item.path, names[n])
      else await addFile(item.path, names[n])
    }
    const dir = this.d.downloads()
    mkdirSync(dir, { recursive: true })
    let out = join(dir, zipName(new Date(this.now())))
    for (let n = 2; existsSync(out); n++) out = join(dir, zipName(new Date(this.now())).replace(/\.zip$/, ` (${n}).zip`))
    await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }))
    const s = await stat(out)
    this.items = [{ id: id(), path: out, name: basename(out), size: s.size, kind: 'archive', at: this.now() }]
    this.thumbs.clear()
    this.changed()
    return out
  }
}

/**
 * A reminder to look away from the screen: after so many minutes at it
 * (minutes away don't count, and a few of them count as the break), a card
 * for twenty seconds. Off until you turn it on.
 */
export class EyeBreak {
  private active = 0
  private tick: NodeJS.Timeout | null = null
  private snooze: NodeJS.Timeout | null = null

  constructor(private d: { config: () => BreakConfig; idleSeconds: () => number; show: (seconds: number) => void; hide: () => void; busy?: () => boolean; minuteMs?: number }) {}

  start(): void {
    if (this.tick) return
    this.tick = setInterval(() => this.minute(), this.d.minuteMs ?? 60_000)
    this.tick.unref?.()
  }

  private minute(): void {
    const r = breakTick(this.active, this.d.idleSeconds(), this.d.config())
    // On a call, in the middle of something: ask again next minute.
    if (r.due && this.d.busy?.()) return
    this.active = r.activeMin
    if (r.due) this.d.show(BREAK_SECONDS)
  }

  /** Not now. */
  skip(): void {
    this.d.hide()
  }

  /** In five minutes. */
  later(): void {
    this.d.hide()
    if (this.snooze) clearTimeout(this.snooze)
    this.snooze = setTimeout(() => {
      this.snooze = null
      if (this.d.config().on) this.d.show(BREAK_SECONDS)
    }, BREAK_SNOOZE_MIN * (this.d.minuteMs ?? 60_000))
    this.snooze.unref?.()
  }

  /** The setting changed: count from now. */
  changed(): void {
    this.active = 0
    if (!this.d.config().on) {
      if (this.snooze) clearTimeout(this.snooze)
      this.snooze = null
      this.d.hide()
    }
  }

  /** Show one now (Settings' "Try it", and the tests). */
  now(): void {
    this.d.show(BREAK_SECONDS)
  }

  stop(): void {
    if (this.tick) clearInterval(this.tick)
    if (this.snooze) clearTimeout(this.snooze)
    this.tick = null
    this.snooze = null
  }
}

type Asked = { ok: true; text: string; meta: AnswerMeta } | { ok: false; needsConsent: string } | { ok: false; error: string }

/**
 * Translating: what you selected in any app (it opens as a card on the
 * island), or what you typed in the Dashboard's tile. The model on this
 * computer does it when there is one; the cloud only with your yes.
 */
export class Translator {
  private cur: Translation | null = null
  private run = 0

  constructor(
    private d: {
      ask: (o: { system: string; prompt: string; consent: boolean }) => Promise<Asked>
      show: (t: Translation | null) => void
      to: () => string
    },
  ) {}

  current(): Translation | null {
    return this.cur
  }

  private set(t: Translation | null): void {
    this.cur = t
    this.d.show(t)
  }

  /** Translate `text` and say how it went (the tile uses this; nothing is shown on the island). */
  async text(text: string, to: string, consent: boolean): Promise<Translation> {
    const source = text.trim().slice(0, TRANSLATE_MAX)
    if (!source) return { source: '', to, phase: 'error', error: 'There’s nothing to translate.' }
    const p = translatePrompt(source, to)
    const r = await this.d.ask({ ...p, consent })
    if (r.ok) {
      const t = readTranslation(r.text)
      if (!t.text) return { source, to, phase: 'error', error: 'The model sent nothing back. Try again.' }
      return { source, to, phase: 'done', from: t.from || undefined, text: t.text, meta: r.meta }
    }
    if ('needsConsent' in r) return { source, to, phase: 'consent', cloud: r.needsConsent }
    return { source, to, phase: 'error', error: r.error }
  }

  /** What you selected: a card on the island, filled in when the translation is ready. */
  async card(text: string, to = this.d.to(), consent = false): Promise<void> {
    const source = text.trim().slice(0, TRANSLATE_MAX)
    const run = ++this.run
    if (!source) return this.set({ source: '', to, phase: 'error', error: 'Select some text in any app first, then press the shortcut again.' })
    this.set({ source, to, phase: 'working' })
    const done = await this.text(source, to, consent)
    // Closed, or another one started, while this was being made.
    if (run === this.run && this.cur) this.set(done)
  }

  /** Into another language. */
  retarget(to: string): void {
    if (this.cur?.source) void this.card(this.cur.source, to)
  }

  /** Yes, send it to the cloud this once. */
  allow(): void {
    if (this.cur?.phase === 'consent') void this.card(this.cur.source, this.cur.to, true)
  }

  close(): void {
    this.run++
    this.set(null)
  }
}
