import { existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dateOf } from '@shared/brain'
import {
  MAX_ACTIVITY,
  SOURCE_IDS,
  SOURCE_INFO,
  addScreenSample,
  appName,
  displayApp,
  cleanActivity,
  commandProject,
  keepCommand,
  parseActivities,
  parseCodexSession,
  parseGeminiLog,
  parseGhEvents,
  parseHistory,
  parseIcs,
  privateWindow,
  redact,
  screenActivities,
  type Activity,
  type CalEvent,
  type ShellKind,
  type SourceId,
  type SourceStatus,
  type SourcesConfig,
} from '@shared/intake'
import type { FrontApp } from './frontApp'
import { runGh } from './tools'

export type IntakeDeps = {
  config: () => SourcesConfig
  file: string
  home: string
  /** Runs gh (or the stand-in); resolves its output. */
  gh?: (args: string[]) => Promise<string>
  /** The window in front (X11), or null. */
  /** The window in front: its title, and its app (a name, a process name or a pid). */
  frontWindow?: () => Promise<FrontApp | null>
  /** Seconds since the last key or pointer move. */
  idleSeconds?: () => number
  /** Window titles with these words are private (Settings › Buddy). */
  privateWords?: () => string[]
  fetch?: typeof fetch
  now?: () => number
  onChange?: () => void
}

type State = {
  list: Activity[]
  screen: Record<string, Record<string, number>>
  /** Bytes already read of each history file. */
  cursors: Record<string, number>
  /** Session files already read, with their size then. */
  seen: Record<string, number>
  last: Partial<Record<SourceId, number>>
  errors: Partial<Record<SourceId, string>>
  ghSince?: number
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * What you did, collected on this computer: each source you turned on in
 * Settings › Sources is read on its own clock (screen time each minute,
 * the terminal and Codex and Gemini every ten, GitHub and the calendar
 * hourly) into one log that the loop files into the brain each evening.
 */
export class Intake {
  private s: State = { list: [], screen: {}, cursors: {}, seen: {}, last: {}, errors: {} }
  private timers: NodeJS.Timeout[] = []
  private saveTimer: NodeJS.Timeout | null = null
  private events: CalEvent[] = []
  private busy = new Set<SourceId>()

  constructor(private d: IntakeDeps) {
    try {
      const raw = JSON.parse(readFileSync(d.file, 'utf8'))
      this.s = {
        list: parseActivities(raw.list),
        screen: raw.screen && typeof raw.screen === 'object' ? raw.screen : {},
        cursors: raw.cursors && typeof raw.cursors === 'object' ? raw.cursors : {},
        seen: raw.seen && typeof raw.seen === 'object' ? raw.seen : {},
        last: raw.last && typeof raw.last === 'object' ? raw.last : {},
        errors: {},
        ghSince: typeof raw.ghSince === 'number' ? raw.ghSince : undefined,
      }
      if (Array.isArray(raw.events)) this.events = raw.events.filter((e: CalEvent) => e && typeof e.start === 'number' && typeof e.title === 'string')
    } catch {
      // first run
    }
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  start(): void {
    this.stop()
    const every = (ms: number, f: () => void) => {
      const t = setInterval(f, ms)
      t.unref?.()
      this.timers.push(t)
    }
    every(60_000, () => void this.sampleScreen())
    every(10 * 60_000, () => {
      for (const id of ['shell', 'codex', 'gemini'] as const) void this.check(id)
    })
    every(HOUR, () => {
      for (const id of ['github', 'calendar'] as const) void this.check(id)
    })
    // A first look soon after starting.
    const t = setTimeout(() => {
      for (const id of ['shell', 'codex', 'gemini', 'github', 'calendar'] as const) void this.check(id)
    }, 15_000)
    t.unref?.()
    this.timers.push(t)
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }

  /** Everything waiting to be filed, with screen time as one entry per app and hour. */
  all(): Activity[] {
    return [...this.s.list, ...screenActivities(this.s.screen)].sort((a, b) => a.at - b.at)
  }

  /** Between two times (for the timeline). */
  between(from: number, to: number): Activity[] {
    return this.all().filter((a) => a.at >= from && a.at < to)
  }

  /** The calendar's events between two times. */
  calendar(from: number, to: number): CalEvent[] {
    return this.events.filter((e) => e.start < to && e.end > from)
  }

  anyOn(): boolean {
    const on = this.d.config().on
    return SOURCE_IDS.some((id) => on[id])
  }

  status(): SourceStatus[] {
    const cfg = this.d.config()
    const today = dateOf(this.now())
    const all = this.all()
    const d0 = new Date(this.now())
    d0.setHours(0, 0, 0, 0)
    return SOURCE_IDS.map((id) => ({
      id,
      label: SOURCE_INFO[id].label,
      what: SOURCE_INFO[id].what,
      on: cfg.on[id],
      last: this.s.last[id] ?? null,
      error: this.s.errors[id] ?? null,
      today: id === 'calendar' ? this.calendar(d0.getTime(), d0.getTime() + DAY).length : all.filter((a) => a.source === id && dateOf(a.at) === today).length,
    }))
  }

  /** Forget the days that were filed for good (before today). */
  dropDays(days: string[]): void {
    const drop = new Set(days)
    this.s.list = this.s.list.filter((a) => !drop.has(dateOf(a.at)))
    for (const k of Object.keys(this.s.screen)) if (drop.has(dateOf(Number(k)))) delete this.s.screen[k]
    this.save()
  }

  /** A source was turned off: forget what it kept (and, for the terminal, start again from now when it's back on). */
  clear(id: SourceId): void {
    if (id === 'screen') this.s.screen = {}
    else this.s.list = this.s.list.filter((a) => a.source !== id)
    if (id === 'shell') this.s.cursors = {}
    if (id === 'calendar') this.events = []
    delete this.s.last[id]
    delete this.s.errors[id]
    this.save()
    this.d.onChange?.()
  }

  /** Read one source now (when it's on). */
  async check(id: SourceId): Promise<void> {
    if (!this.d.config().on[id] || this.busy.has(id)) return
    this.busy.add(id)
    try {
      const n = await this.read(id)
      this.s.last[id] = this.now()
      delete this.s.errors[id]
      if (n) this.saveSoon()
    } catch (e) {
      this.s.errors[id] = (e as Error).message || String(e)
    } finally {
      this.busy.delete(id)
      this.saveSoon()
      this.d.onChange?.()
    }
  }

  private add(list: Activity[]): number {
    let n = 0
    for (const a of list) {
      const c = cleanActivity(a)
      if (!c) continue
      const i = c.key ? this.s.list.findIndex((x) => x.key === c.key) : -1
      if (i >= 0) this.s.list[i] = c
      else {
        this.s.list.push(c)
        n++
      }
    }
    if (this.s.list.length > MAX_ACTIVITY) this.s.list = this.s.list.slice(-MAX_ACTIVITY)
    return n
  }

  private async read(id: SourceId): Promise<number> {
    switch (id) {
      case 'github':
        return this.readGithub()
      case 'shell':
        return this.readShell()
      case 'calendar':
        return this.readCalendar()
      case 'codex':
        return this.readCodex()
      case 'gemini':
        return this.readGemini()
      case 'screen':
        return 0
    }
  }

  private async readGithub(): Promise<number> {
    const gh = this.d.gh ?? runGh
    const login = (await gh(['api', 'user', '--jq', '.login'])).trim()
    if (!/^[\w-]{1,39}$/.test(login)) throw new Error('gh didn’t say who you are: run “gh auth login”.')
    const raw = JSON.parse(await gh(['api', `users/${login}/events?per_page=100`]))
    // The first time: today's; after that, since the last look.
    const since = this.s.ghSince ?? new Date(this.now()).setHours(0, 0, 0, 0)
    const n = this.add(parseGhEvents(raw, since))
    this.s.ghSince = this.now() - HOUR
    return n
  }

  private historyFiles(): { path: string; kind: ShellKind }[] {
    const h = this.d.home
    const zdot = process.env.ZDOTDIR || h
    return [
      { path: process.env.DI_HISTFILE || join(h, '.bash_history'), kind: 'bash' as const },
      { path: join(zdot, '.zsh_history'), kind: 'zsh' as const },
      { path: join(h, '.local/share/fish/fish_history'), kind: 'fish' as const },
      // PowerShell's own history (PSReadLine), on Windows and where pwsh is installed.
      { path: process.platform === 'win32' && process.env.APPDATA ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt') : join(h, '.local/share/powershell/PSReadLine/ConsoleHost_history.txt'), kind: 'powershell' as const },
    ].filter((f) => existsSync(f.path))
  }

  private async readShell(): Promise<number> {
    const skip = this.d.config().skip
    let n = 0
    for (const f of this.historyFiles()) {
      const size = statSync(f.path).size
      const from = this.s.cursors[f.path]
      // Turned on now: from here on, not your whole history.
      if (from === undefined || from > size) {
        this.s.cursors[f.path] = size
        continue
      }
      if (from === size) continue
      const len = Math.min(size - from, 4 * 1024 * 1024)
      const buf = Buffer.alloc(len)
      const fd = openSync(f.path, 'r')
      try {
        readSync(fd, buf, 0, len, from)
      } finally {
        closeSync(fd)
      }
      // Up to the last whole line.
      const text = buf.toString('utf8')
      const end = text.lastIndexOf('\n')
      if (end < 0) continue
      this.s.cursors[f.path] = from + Buffer.byteLength(text.slice(0, end + 1))
      const now = this.now()
      const cmds = parseHistory(text.slice(0, end + 1), f.kind, now)
        .filter((c) => keepCommand(c.cmd, skip))
        .map((c) => ({ at: Math.min(c.at, now), source: 'shell' as const, kind: 'command', title: redact(c.cmd.split('\n')[0]).slice(0, 300), project: commandProject(c.cmd) }))
      n += this.add(cmds)
    }
    return n
  }

  private async readCalendar(): Promise<number> {
    const where = this.d.config().calendar.trim()
    if (!where) throw new Error('Add a .ics file or address below.')
    let text: string
    if (/^https:\/\//.test(where)) {
      const r = await (this.d.fetch ?? fetch)(where, { signal: AbortSignal.timeout(20_000) })
      if (!r.ok) throw new Error(`The calendar address answered ${r.status}.`)
      text = await r.text()
    } else {
      const p = where.replace(/^~(?=\/)/, this.d.home)
      if (!existsSync(p)) throw new Error(`There’s no file at ${where}.`)
      text = readFileSync(p, 'utf8')
    }
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('That isn’t a calendar (.ics).')
    const day = new Date(this.now())
    day.setHours(0, 0, 0, 0)
    // Yesterday to a week ahead: the morning card and the timeline.
    this.events = parseIcs(text, day.getTime() - DAY, day.getTime() + 8 * DAY).slice(0, 500)
    // Today's events are part of the day (as they happen).
    const today = this.events.filter((e) => e.start >= day.getTime() && e.start < day.getTime() + DAY && e.start <= this.now())
    return this.add(today.map((e) => ({ at: e.start, source: 'calendar' as const, kind: 'event', title: e.title, detail: e.where, key: `cal:${e.uid}:${e.start}` })))
  }

  private codexDir(): string {
    return process.env.CODEX_HOME || join(this.d.home, '.codex')
  }

  private async readCodex(): Promise<number> {
    const root = join(this.codexDir(), 'sessions')
    if (!existsSync(root)) throw new Error('No Codex sessions here yet (~/.codex/sessions).')
    let n = 0
    // Today's and yesterday's folders (sessions/YYYY/MM/DD).
    for (const back of [1, 0]) {
      const d = new Date(this.now() - back * DAY)
      const dir = join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue
        const p = join(dir, f)
        const size = statSync(p).size
        if (this.s.seen[p] === size) continue
        this.s.seen[p] = size
        const a = parseCodexSession(readFileSync(p, 'utf8'), f)
        if (a) n += this.add([a])
      }
    }
    return n
  }

  private async readGemini(): Promise<number> {
    const root = join(this.d.home, '.gemini', 'tmp')
    if (!existsSync(root)) throw new Error('No Gemini sessions here yet (~/.gemini/tmp).')
    let n = 0
    for (const h of readdirSync(root)) {
      const p = join(root, h, 'logs.json')
      if (!existsSync(p)) continue
      const st = statSync(p)
      if (this.now() - st.mtimeMs > 2 * DAY || this.s.seen[p] === st.size) continue
      this.s.seen[p] = st.size
      let project = ''
      try {
        project = readFileSync(join(root, h, '.project_root'), 'utf8').trim().split('/').filter(Boolean).pop() ?? ''
      } catch {
        // older Gemini CLIs don't say
      }
      try {
        n += this.add(parseGeminiLog(JSON.parse(readFileSync(p, 'utf8')), project))
      } catch {
        // half-written
      }
    }
    return n
  }

  /** One minute of screen time for the app in front (not when you're away, not private windows). */
  async sampleScreen(): Promise<void> {
    if (!this.d.config().on.screen || !this.d.frontWindow) return
    if ((this.d.idleSeconds?.() ?? 0) > 300) return
    const w = await this.d.frontWindow().catch(() => null)
    if (!w) return
    if (privateWindow(w.title, [...(this.d.privateWords?.() ?? []), ...this.d.config().skip])) return
    let comm = w.comm ?? ''
    if (!w.name && !comm && w.pid)
      try {
        comm = readFileSync(`/proc/${w.pid}/comm`, 'utf8').trim()
      } catch {
        // gone
      }
    this.s.screen = addScreenSample(this.s.screen, this.now(), w.name ? displayApp(w.name) : appName(comm, w.title), 1)
    this.s.last.screen = this.now()
    this.saveSoon()
  }

  private saveSoon(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save()
    }, 2000)
    this.saveTimer.unref?.()
  }

  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    try {
      mkdirSync(dirname(this.d.file), { recursive: true })
      const { errors: _e, ...keep } = this.s
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify({ ...keep, events: this.events }))
      renameSync(`${this.d.file}.tmp`, this.d.file)
    } catch (e) {
      console.error('[island] intake:', e)
    }
  }
}
