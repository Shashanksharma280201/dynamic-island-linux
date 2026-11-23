import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseTimerState, timerDue, timerRestored, timerStep, type TimerCmd, type TimerPrefs, type TimerState, type TimerView } from '@shared/dashboard'

type Deps = {
  /** Where the timer is kept between runs (left out: it isn't kept). */
  file?: string
  /** The lengths it runs with (Settings, or the tile). */
  prefs: () => TimerPrefs
  now?: () => number
  /** The timer changed: a button, or a phase ran out. */
  onChange: (v: TimerView) => void
  /** A phase ran out by itself. */
  onFinished: (which: 'focus' | 'break', v: TimerView) => void
}

/**
 * The focus timer: one wake-up, when the running phase ends (the island
 * counts the seconds down itself while it's showing). Kept on disk so a
 * session carries on when the island starts again.
 */
export class FocusTimer {
  private state: TimerState
  private wake: ReturnType<typeof setTimeout> | null = null
  private now: () => number

  constructor(private d: Deps) {
    this.now = d.now ?? Date.now
    this.state = timerRestored(this.load(), this.now())
    this.arm()
  }

  view(): TimerView {
    return { ...this.state, ...this.d.prefs() }
  }

  /** A button on the timer. */
  cmd(c: TimerCmd): TimerView {
    this.set(timerStep(this.state, c, this.d.prefs(), this.now()))
    return this.view()
  }

  /** The lengths changed: a timer at rest shows the new one at once. */
  prefsChanged(): void {
    this.d.onChange(this.view())
  }

  /** Look at the clock now (the computer just woke: a wake-up may be late). */
  check(): void {
    this.due()
  }

  stop(): void {
    if (this.wake) clearTimeout(this.wake)
    this.wake = null
  }

  private set(next: TimerState): void {
    const same = JSON.stringify(next) === JSON.stringify(this.state)
    this.state = next
    this.arm()
    if (same) return
    this.save()
    this.d.onChange(this.view())
  }

  private arm(): void {
    this.stop()
    if (this.state.endsAt === null) return
    // A little past the end, so the clock has passed it when we look; long waits are cut short (timers drift across sleep).
    const wait = Math.min(Math.max(0, this.state.endsAt - this.now()) + 20, 60 * 60_000)
    this.wake = setTimeout(() => this.due(), wait)
  }

  private due(): void {
    const r = timerDue(this.state, this.d.prefs(), this.now())
    // Not yet (or a new day began): keep what it says, and wait again.
    if (!r.finished) return this.set(r.state)
    this.set(r.state)
    this.d.onFinished(r.finished, this.view())
  }

  private load(): TimerState | null {
    if (!this.d.file) return null
    try {
      return parseTimerState(JSON.parse(readFileSync(this.d.file, 'utf8')))
    } catch {
      return null
    }
  }

  private save(): void {
    if (!this.d.file) return
    try {
      mkdirSync(dirname(this.d.file), { recursive: true })
      const tmp = this.d.file + '.tmp'
      writeFileSync(tmp, JSON.stringify(this.state) + '\n', { mode: 0o600 })
      renameSync(tmp, this.d.file)
    } catch {
      // Not kept this time; the timer still runs.
    }
  }
}
