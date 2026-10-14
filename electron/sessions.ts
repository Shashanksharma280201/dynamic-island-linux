import { applyEvent, pruneSessions, sortSessions, type AgentEvent, type AgentSession } from '@shared/sessions'

/** Whether a process is still running (signal 0 only checks). */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    return e?.code === 'EPERM'
  }
}

/**
 * The agent sessions running in your terminals, from their hooks. Reports
 * every change, a turn that just finished and a session that just got stuck
 * waiting for you; forgets sessions whose process quit or that went quiet.
 */
export class SessionTracker {
  private sessions: Record<string, AgentSession> = {}
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private d: {
      onChange: (list: AgentSession[]) => void
      onFinished: (s: AgentSession) => void
      onWaiting: (s: AgentSession) => void
      alive?: (pid: number) => boolean
      now?: () => number
    },
  ) {}

  start(everyMs = 30_000): void {
    this.timer ??= setInterval(() => this.prune(), everyMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  event(e: AgentEvent): void {
    const before = this.sessions[e.sessionId]
    this.sessions = applyEvent(this.sessions, e)
    const after = this.sessions[e.sessionId]
    if (after && after.phase === 'done' && before?.phase !== 'done' && (after.prompt || after.turnSteps > 0)) this.d.onFinished(after)
    if (after && after.phase === 'waiting' && before?.phase !== 'waiting') this.d.onWaiting(after)
    this.d.onChange(this.list())
  }

  get(id: string): AgentSession | undefined {
    return this.sessions[id]
  }

  list(): AgentSession[] {
    return sortSessions(Object.values(this.sessions))
  }

  /** Forget a session (you closed it on the island). */
  forget(id: string): void {
    if (!this.sessions[id]) return
    const { [id]: _gone, ...rest } = this.sessions
    this.sessions = rest
    this.d.onChange(this.list())
  }

  prune(): void {
    const now = (this.d.now ?? Date.now)()
    const alive = this.d.alive ?? processAlive
    let next = pruneSessions(this.sessions, now)
    for (const [id, s] of Object.entries(next)) if (s.pid && !alive(s.pid)) next = Object.fromEntries(Object.entries(next).filter(([k]) => k !== id))
    if (Object.keys(next).length === Object.keys(this.sessions).length) return
    this.sessions = next
    this.d.onChange(this.list())
  }
}
