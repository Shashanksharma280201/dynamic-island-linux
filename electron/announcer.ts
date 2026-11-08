import { alertDecision, type AlertPriority, type AlertsConfig } from '@shared/jarvis'
import { keepForDigest, type DigestItem } from '@shared/digest'

/**
 * Speaking up, sparingly: only what's urgent is said out loud (a Claude Code
 * session waiting on you, work it handed off that finished), never in quiet
 * hours, never the same thing twice in three days, a few an hour at most,
 * and not a kind you keep dismissing. Everything else is only shown, and
 * what isn't urgent, or would have been said but wasn't, is kept for the
 * evening digest.
 */
export class Announcer {
  private spoken: Record<string, number> = {}
  private dismissedKinds: Record<string, number> = {}

  constructor(private d: { config: () => AlertsConfig; say: (line: string) => void; kept?: (item: DigestItem) => void; now?: () => number }) {}

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  /** Something happened: say it, or not. Returns what was decided. */
  event(e: { key: string; kind: string; priority: AlertPriority; line: string }): 'speak' | 'show' | 'digest' {
    const now = this.now()
    // Forget what's older than three days.
    for (const [k, t] of Object.entries(this.spoken)) if (now - t > 72 * 3_600_000) delete this.spoken[k]
    const { way, why } = alertDecision({ priority: e.priority, key: e.key, kind: e.kind, now, config: this.d.config(), spoken: this.spoken, dismissed: this.dismissedKinds })
    if (way === 'speak') {
      this.spoken[e.key] = now
      this.d.say(e.line)
    } else if (why && keepForDigest(e.kind, why)) this.d.kept?.({ at: now, key: e.key, kind: e.kind, line: e.line, why })
    return way
  }

  /** You waved it away without acting: after three, that kind is only shown. */
  dismissed(kind: string): void {
    this.dismissedKinds[kind] = (this.dismissedKinds[kind] ?? 0) + 1
  }

  /** You acted on it: it's worth saying again. */
  acted(kind: string): void {
    delete this.dismissedKinds[kind]
  }
}
