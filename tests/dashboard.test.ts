import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FocusTimer } from '../electron/os/timer'
import {
  DEFAULT_TILES,
  TIMER_DEFAULTS,
  clockLeft,
  cpuPercent,
  cpuTotals,
  dayProgress,
  isTimerCmd,
  leftText,
  localDay,
  memPercent,
  parseBattery,
  parseDashboardConfig,
  parseMemAvailable,
  parseTiles,
  parseTimerPrefs,
  parseTimerState,
  soonEvent,
  setTile,
  timerDue,
  timerFraction,
  timerIdle,
  timerLeft,
  timerLine,
  timerPaused,
  timerRestored,
  timerRunning,
  timerStep,
  untilShort,
  untilText,
} from '../shared/dashboard'

const MIN = 60_000
const P = TIMER_DEFAULTS
// A fixed local moment well inside a day, so a day's rollover doesn't interfere.
const T0 = new Date(2026, 10, 23, 10, 0, 0).getTime()

test('the four tiles: known kinds once each, gaps filled from the defaults', () => {
  expect(parseTiles(undefined)).toEqual(DEFAULT_TILES)
  expect(DEFAULT_TILES).toEqual(['media', 'timer', 'assistant', 'system'])
  expect(parseTiles(['claude', 'next'])).toEqual(['claude', 'next', 'media', 'timer'])
  expect(parseTiles(['claude', 'claude', 'nonsense', 7, 'day', 'system', 'next', 'media'])).toEqual(['claude', 'day', 'system', 'next'])
  // Choosing a kind another slot has swaps the two: each shows once.
  expect(setTile(['media', 'timer', 'day', 'system'], 0, 'day')).toEqual(['day', 'timer', 'media', 'system'])
  expect(setTile(['media', 'timer', 'day', 'system'], 3, 'claude')).toEqual(['media', 'timer', 'day', 'claude'])
  expect(setTile(['media', 'timer', 'day', 'system'], 9, 'claude')).toEqual(['media', 'timer', 'day', 'system'])
  expect(setTile(['media', 'timer', 'day', 'system'], 1, 'nonsense' as never)).toEqual(['media', 'timer', 'day', 'system'])
})

test('the focus timer: start, pause, resume, then the break, then rest', () => {
  let s = timerIdle(T0)
  expect(timerLeft(s, P, T0)).toBe(25 * MIN) // at rest it shows a whole session
  expect(clockLeft(timerLeft(s, P, T0))).toBe('25:00')

  s = timerStep(s, 'start', P, T0)
  expect(s).toMatchObject({ phase: 'focus', endsAt: T0 + 25 * MIN, left: null })
  expect(timerRunning(s)).toBe(true)
  expect(clockLeft(timerLeft(s, P, T0 + 1))).toBe('25:00') // rounded up to the second
  expect(clockLeft(timerLeft(s, P, T0 + 1000))).toBe('24:59')
  expect(timerFraction(s, P, T0 + 5 * MIN)).toBeCloseTo(0.2)

  // Paused at 20 minutes left: the clock stops however long it waits.
  s = timerStep(s, 'pause', P, T0 + 5 * MIN)
  expect(timerPaused(s)).toBe(true)
  expect(timerLeft(s, P, T0 + 50 * MIN)).toBe(20 * MIN)
  expect(timerDue(s, P, T0 + 50 * MIN).finished).toBe(null)
  expect(timerLine(s, P, T0 + 50 * MIN)).toBe('Focus · 20:00 paused')

  // Start on a paused timer carries on (it doesn't start over).
  s = timerStep(s, 'start', P, T0 + 60 * MIN)
  expect(s.endsAt).toBe(T0 + 80 * MIN)
  expect(timerDue(s, P, T0 + 79 * MIN).finished).toBe(null)

  // Focus runs out: one session counted, and the break starts by itself.
  let d = timerDue(s, P, T0 + 80 * MIN)
  expect(d.finished).toBe('focus')
  expect(d.state).toMatchObject({ phase: 'break', endsAt: T0 + 85 * MIN, done: 1 })
  expect(timerLine(d.state, P, T0 + 80 * MIN)).toBe('Break · 05:00 left')

  // The break runs out: back to rest, the count kept.
  d = timerDue(d.state, P, T0 + 85 * MIN)
  expect(d.finished).toBe('break')
  expect(d.state).toMatchObject({ phase: 'idle', endsAt: null, done: 1 })
  expect(timerLine(d.state, P, T0)).toBe('Focus timer · 25 min')
})

test('the focus timer: stopping early counts nothing, and a new day starts the count again', () => {
  let s = timerStep(timerIdle(T0, 3), 'start', P, T0)
  expect(timerStep(s, 'reset', P, T0 + MIN)).toMatchObject({ phase: 'idle', done: 3 })
  // Out of a break early: back to rest, the session it followed still counted.
  expect(timerStep(timerDue(s, P, T0 + 25 * MIN).state, 'reset', P, T0 + 26 * MIN)).toMatchObject({ phase: 'idle', done: 4 })
  // Buttons that don't apply change nothing.
  expect(timerStep(s, 'resume', P, T0 + MIN)).toEqual(s)
  expect(timerStep(timerIdle(T0), 'pause', P, T0)).toEqual(timerIdle(T0))
  expect(timerStep(timerIdle(T0), 'reset', P, T0)).toEqual(timerIdle(T0))
  // Tomorrow: yesterday's sessions aren't today's.
  const tomorrow = T0 + 24 * 60 * MIN
  s = timerStep(timerIdle(T0, 3), 'start', P, tomorrow)
  expect(s).toMatchObject({ phase: 'focus', done: 0, day: localDay(tomorrow) })
})

test('lengths are kept within reason, and long ones show hours', () => {
  expect(parseTimerPrefs(null)).toEqual(TIMER_DEFAULTS)
  expect(parseTimerPrefs({ focusMin: 45, breakMin: 10 })).toEqual({ focusMin: 45, breakMin: 10 })
  expect(parseTimerPrefs({ focusMin: 0, breakMin: 999 })).toEqual({ focusMin: 1, breakMin: 60 })
  expect(parseTimerPrefs({ focusMin: 'x', breakMin: NaN })).toEqual(TIMER_DEFAULTS)
  expect(clockLeft(65 * MIN)).toBe('1:05:00')
  expect(clockLeft(0)).toBe('00:00')
  expect(clockLeft(-5)).toBe('00:00')
})

test('the day: how much has gone and how much is left', () => {
  const noon = dayProgress(new Date(2026, 10, 23, 12, 0, 0))
  expect(noon.fraction).toBeCloseTo(0.5)
  expect(noon.hour).toBe(12)
  expect(noon.leftMin).toBe(720)
  expect(dayProgress(new Date(2026, 10, 23, 0, 0, 0)).fraction).toBe(0)
  expect(leftText(720)).toBe('12 h left')
  expect(leftText(552)).toBe('9 h 12 min left')
  expect(leftText(42)).toBe('42 min left')
  expect(untilText(T0 + 42 * MIN, T0)).toBe('in 42 min')
  expect(untilText(T0 + 125 * MIN, T0)).toBe('in 2 h 5 min')
  expect(untilText(T0 + 120 * MIN, T0)).toBe('in 2 h')
  expect(untilText(T0 - MIN, T0)).toBe('now')
  expect(untilText(T0 + 26 * 60 * MIN, T0)).toBe('tomorrow')
  expect(untilText(T0 + 3 * 24 * 60 * MIN, T0)).toBe('in 3 days')
})

test('the computer: processor use between two readings, and memory in use', () => {
  const cpu = (user: number, idle: number) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } })
  const a = cpuTotals([cpu(100, 900), cpu(200, 800)])
  const b = cpuTotals([cpu(150, 950), cpu(300, 800)])
  expect(a).toEqual({ idle: 1700, total: 2000 })
  // 200 more in all, 50 of it idle: three quarters busy.
  expect(cpuPercent(a, b)).toBe(75)
  expect(cpuPercent(a, a)).toBe(0)
  expect(parseMemAvailable('MemTotal:       16000000 kB\nMemFree:          500000 kB\nMemAvailable:    8000000 kB\n')).toBe(8000000 * 1024)
  expect(parseMemAvailable('MemTotal: 1 kB')).toBe(null)
  expect(memPercent(16, 8)).toBe(50)
  expect(memPercent(0, 0)).toBe(0)
})

test('what is saved: the tiles and lengths, and a timer read back after the island was closed', () => {
  expect(parseDashboardConfig(null)).toEqual({ tiles: DEFAULT_TILES, timer: TIMER_DEFAULTS })
  expect(parseDashboardConfig({ tiles: ['claude'], timer: { focusMin: 50, breakMin: 10 } })).toEqual({ tiles: ['claude', 'media', 'timer', 'assistant'], timer: { focusMin: 50, breakMin: 10 } })
  expect(isTimerCmd('start')).toBe(true)
  expect(isTimerCmd('explode')).toBe(false)
  expect(isTimerCmd('skip')).toBe(false)
  expect(isTimerCmd(3)).toBe(false)

  const running = timerStep(timerIdle(T0, 2), 'start', P, T0)
  expect(parseTimerState(JSON.parse(JSON.stringify(running)))).toEqual(running)
  const paused = timerStep(running, 'pause', P, T0 + MIN)
  expect(parseTimerState(JSON.parse(JSON.stringify(paused)))).toEqual(paused)
  expect(parseTimerState({ phase: 'focus', endsAt: null, left: null, done: 0, day: '2026-11-23' })).toBe(null) // neither running nor paused
  expect(parseTimerState({ phase: 'focus', endsAt: 5, left: 5, done: 0, day: '2026-11-23' })).toBe(null)
  expect(parseTimerState({ phase: 'nap', endsAt: 5, left: null, done: 0, day: '2026-11-23' })).toBe(null)
  expect(parseTimerState({ phase: 'idle', endsAt: null, left: null, done: 1, day: 'today' })).toBe(null)
  expect(parseTimerState('x')).toBe(null)

  // Still running when the island comes back: it carries on.
  expect(timerRestored(running, T0 + 10 * MIN)).toEqual(running)
  // It ran out meanwhile: the session counts, and it's at rest.
  expect(timerRestored(running, T0 + 40 * MIN)).toMatchObject({ phase: 'idle', done: 3 })
  // A break that ran out counts nothing more.
  const onBreak = timerDue(running, P, T0 + 25 * MIN).state
  expect(timerRestored(onBreak, T0 + 40 * MIN)).toMatchObject({ phase: 'idle', done: 3 })
  // Paused timers wait as long as it takes; nothing saved is rest.
  expect(timerRestored(paused, T0 + 300 * MIN)).toEqual(paused)
  expect(timerRestored(null, T0)).toEqual(timerIdle(T0))
  // Back the next day: yesterday's count is gone, and a session that ended overnight isn't today's.
  expect(timerRestored(running, T0 + 24 * 60 * MIN)).toMatchObject({ phase: 'idle', done: 0 })
})

test('the battery, from what Linux says about it', () => {
  expect(parseBattery('83\n', 'Discharging\n')).toEqual({ pct: 83, charging: false })
  expect(parseBattery('100', 'Full')).toEqual({ pct: 100, charging: true })
  expect(parseBattery('41', 'Charging')).toEqual({ pct: 41, charging: true })
  expect(parseBattery('', 'Unknown')).toBe(null)
  expect(parseBattery('abc', 'Charging')).toBe(null)
})

describe('the focus timer in the island', () => {
  const dir = mkdtempSync(join(tmpdir(), 'di-timer-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  beforeEach(() => vi.useFakeTimers({ now: T0 }))
  afterEach(() => vi.useRealTimers())

  const make = (file?: string, prefs: () => typeof P = () => P) => {
    const seen: string[] = []
    const t = new FocusTimer({ file, prefs, onChange: (v) => seen.push(`${v.phase}:${v.done}`), onFinished: (which) => seen.push(`finished ${which}`) })
    return { t, seen }
  }

  it('runs a session into its break and back to rest, waking only when a phase ends', () => {
    const { t, seen } = make()
    expect(t.view()).toMatchObject({ phase: 'idle', focusMin: 25, breakMin: 5 })
    expect(vi.getTimerCount()).toBe(0) // at rest it costs nothing
    t.cmd('start')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(24 * MIN)
    expect(seen).toEqual(['focus:0'])
    vi.advanceTimersByTime(MIN + 100)
    expect(seen).toEqual(['focus:0', 'break:1', 'finished focus'])
    vi.advanceTimersByTime(5 * MIN + 100)
    expect(seen).toEqual(['focus:0', 'break:1', 'finished focus', 'idle:1', 'finished break'])
    expect(vi.getTimerCount()).toBe(0)
    t.stop()
  })

  it('paused, nothing runs out; a button that changes nothing tells no one', () => {
    const { t, seen } = make()
    t.cmd('start')
    t.cmd('pause')
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(3 * 60 * MIN)
    expect(t.view()).toMatchObject({ phase: 'focus', endsAt: null, left: 25 * MIN })
    t.cmd('pause')
    expect(seen).toEqual(['focus:0', 'focus:0'])
    t.cmd('resume')
    vi.advanceTimersByTime(25 * MIN + 100)
    expect(seen.at(-1)).toBe('finished focus')
    t.stop()
  })

  it('a session longer than an hour still ends on time (the wait is cut into hours)', () => {
    const { t, seen } = make(undefined, () => ({ focusMin: 150, breakMin: 5 }))
    t.cmd('start')
    vi.advanceTimersByTime(149 * MIN)
    expect(seen).toEqual(['focus:0'])
    vi.advanceTimersByTime(MIN + 100)
    expect(seen).toEqual(['focus:0', 'break:1', 'finished focus'])
    t.stop()
  })

  it('is kept between runs: a session carries on, and one that ran out while closed counts', () => {
    const file = join(dir, 'os-timer.json')
    const a = make(file)
    a.t.cmd('start')
    a.t.stop() // the island quits
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ phase: 'focus', endsAt: T0 + 25 * MIN })

    vi.setSystemTime(T0 + 10 * MIN)
    const b = make(file)
    expect(b.t.view()).toMatchObject({ phase: 'focus', endsAt: T0 + 25 * MIN })
    vi.advanceTimersByTime(15 * MIN + 100)
    expect(b.seen).toEqual(['break:1', 'finished focus'])
    b.t.cmd('reset')
    b.t.cmd('start')
    b.t.stop()

    vi.setSystemTime(T0 + 3 * 60 * MIN)
    const c = make(file)
    expect(c.t.view()).toMatchObject({ phase: 'idle', done: 2 })
    c.t.stop()

    writeFileSync(file, '{ not json')
    expect(make(file).t.view()).toMatchObject({ phase: 'idle', done: 0 })
  })
})

test('what is about to start: the next timed event within half an hour, until five minutes in', () => {
  const ev = (min: number, title: string, more: object = {}) => ({ start: T0 + min * MIN, title, allDay: false, ...more })
  expect(soonEvent([], T0)).toBe(null)
  expect(soonEvent([ev(45, 'Later')], T0)).toBe(null)
  expect(soonEvent([ev(30, 'Standup', { where: ' Room 2 ' })], T0)).toEqual({ title: 'Standup', at: T0 + 30 * MIN, where: 'Room 2' })
  // The earliest of them; whole-day events aren't "about to start".
  expect(soonEvent([ev(20, 'Review'), ev(10, 'Standup'), ev(5, 'Holiday', { allDay: true })], T0)?.title).toBe('Standup')
  // It stays for the first five minutes, then the next one has its turn.
  expect(soonEvent([ev(-3, 'Standup'), ev(12, 'Review')], T0)?.title).toBe('Standup')
  expect(soonEvent([ev(-6, 'Standup'), ev(12, 'Review')], T0)?.title).toBe('Review')
  expect(soonEvent([ev(-6, 'Standup')], T0)).toBe(null)
  expect(soonEvent([ev(3, '   ')], T0)?.title).toBe('Event')
  expect(untilShort(T0 + 12 * MIN, T0)).toBe('12m')
  expect(untilShort(T0 + 90 * MIN, T0)).toBe('2h')
  expect(untilShort(T0 - MIN, T0)).toBe('now')
})
