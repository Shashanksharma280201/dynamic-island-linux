import { isDue } from '@shared/loop'
import { parseRoutine, type Routine } from '@shared/jarvis'

export type RoutineDeps = {
  routines: () => Routine[]
  save: (r: Routine[]) => void
  /** Ask the assistant (it still asks before anything that sends or changes). Throws when busy. */
  ask: (prompt: string) => void
  /** Show that a routine started (a card on the island). */
  started: (r: Routine) => void
  now?: () => number
}

/**
 * Routines: standing orders you write ("wrap up my day at 18:30"), run by the
 * island's assistant at their time, or as soon as the computer wakes if it
 * slept through. Each runs at most once per time it comes round; one that
 * can't start (the assistant is busy) tries again on the next check.
 */
export class Routines {
  private timer: NodeJS.Timeout | null = null

  constructor(private d: RoutineDeps) {}

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  start(): void {
    this.stop()
    this.timer = setInterval(() => this.tick(), 60_000)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Run the first due routine (one at a time: the assistant does one thing). */
  tick(): Routine | null {
    const list = this.d.routines()
    const due = list.find((r) => r.on && isDue(r.when, r.lastRun, this.now()))
    if (!due) return null
    try {
      this.d.ask(`${due.ask}\n\n(This is your routine “${due.name}”. Ask before sending or changing anything.)`)
    } catch {
      return null // busy: next time
    }
    this.d.save(list.map((r) => (r.id === due.id ? { ...r, lastRun: this.now() } : r)))
    this.d.started(due)
    return due
  }

  /** Add or change one (validated), returning why not if it isn't valid. */
  upsert(raw: unknown): string | null {
    const r = parseRoutine(raw)
    if (!r) return 'A routine needs a name, a time and what to ask.'
    const list = this.d.routines()
    const i = list.findIndex((x) => x.id === r.id)
    // A new routine starts from now: it doesn't run for a time already past.
    const fresh = i < 0 ? { ...r, lastRun: this.now() } : { ...r, lastRun: list[i].lastRun }
    this.d.save(i < 0 ? [...list, fresh].slice(0, 20) : list.map((x, k) => (k === i ? fresh : x)))
    return null
  }

  remove(id: string): void {
    this.d.save(this.d.routines().filter((r) => r.id !== id))
  }
}
