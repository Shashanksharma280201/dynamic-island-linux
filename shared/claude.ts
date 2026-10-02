const base = (p: unknown) => String(p ?? '').split('/').filter(Boolean).pop() ?? ''
const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Present-tense line for a tool call: "Reading app.ts", "Running npm test". Pure. */
export function toolDetail(name: string, input: any): string {
  const i = input ?? {}
  switch (name) {
    case 'Read':
      return `Reading ${base(i.file_path)}`
    case 'Write':
      return `Writing ${base(i.file_path)}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editing ${base(i.file_path ?? i.notebook_path)}`
    case 'Bash':
      return `Running ${clip(String(i.description || i.command || '').split('\n')[0])}`
    case 'Grep':
      return `Searching for ${clip(String(i.pattern ?? ''), 40)}`
    case 'Glob':
      return `Finding ${clip(String(i.pattern ?? ''), 40)}`
    case 'WebFetch':
      try {
        return `Reading ${new URL(String(i.url)).hostname}`
      } catch {
        return 'Reading a web page'
      }
    case 'WebSearch':
      return `Searching the web for ${clip(String(i.query ?? ''), 40)}`
    case 'Task':
    case 'Agent':
      return `Delegating: ${clip(String(i.description ?? 'a subtask'), 50)}`
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Planning'
    default:
      return name.startsWith('mcp__') ? `Using ${name.split('__')[1] ?? 'a connector'}` : `Using ${name}`
  }
}

/** The thinking-orbs animation that fits what Claude is doing. Pure. */
export type OrbMood = 'listening' | 'solving' | 'working' | 'searching' | 'connecting' | 'shaping' | 'composing' | 'breathing'
/** One plan-limit window: how much is used and when it starts over. */
export type UsageWindow = { pct: number; resetsAt?: number; limited?: boolean }

/** Your Claude subscription limits (5-hour session and weekly). */
export type ClaudeUsage = {
  fiveHour?: UsageWindow
  sevenDay?: UsageWindow
  model?: string
  updatedAt: number
}

export type RunPhase = 'starting' | 'thinking' | 'tool' | 'writing' | 'done' | 'error' | 'stopped'

/** One Claude Code turn started from the island (voice or typed). */
export type ClaudeRun = {
  id: string
  prompt: string
  cwd: string
  phase: RunPhase
  /** The tool Claude is using right now. */
  tool?: { name: string; detail: string }
  /** Tool calls so far this turn. */
  steps: number
  /** What Claude has written so far (the final answer once done). */
  reply: string
  error?: string
  sessionId?: string
  startedAt: number
  finishedAt?: number
  costUsd?: number
  /** Text streamed so far in the current message (internal). */
  partial?: string
}

/** Local speech model: which one, and whether it's downloaded yet. */
export type SttStatus = { model: string; ready: boolean; downloading: boolean; progress: number; error?: string; sizeMb: number }

/** Everything the island's Claude tab shows. */
export type ClaudeView = ClaudeState & {
  stt: SttStatus
  permissionMode: 'default' | 'acceptEdits' | 'auto'
  /** Accelerator of the talk shortcut when registered, e.g. "Ctrl+Alt+Space". */
  voiceShortcut: string | null
}

export type ClaudeTurn = { prompt: string; reply: string; ok: boolean; at: number }

export type ClaudeState = {
  /** Path of the `claude` command, or null when Claude Code isn't installed. */
  binary: string | null
  /** Project folder commands run in. */
  cwd: string
  /** Conversation that follow-up commands continue. */
  sessionId?: string
  /** Finished turns of this conversation, oldest first (capped). */
  turns: ClaudeTurn[]
  run?: ClaudeRun
  usage?: ClaudeUsage
  /** Status line bridge installed (usage updates from every Claude Code session). */
  usageBridge: boolean
  /** Approvals hook installed globally. */
  approvals: boolean
}

export function newRun(id: string, prompt: string, cwd: string, now: number): ClaudeRun {
  return { id, prompt, cwd, phase: 'starting', steps: 0, reply: '', startedAt: now }
}

const textOf = (content: any[]): string =>
  content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()

/**
 * Fold one line of `claude -p --output-format stream-json` into the run.
 * Pure; unknown or malformed events leave the run as it was.
 */
export function applyStreamEvent(run: ClaudeRun, ev: any, now: number): ClaudeRun {
  if (!ev || typeof ev !== 'object' || run.phase === 'stopped') return run
  const sessionId = typeof ev.session_id === 'string' ? ev.session_id : run.sessionId
  switch (ev.type) {
    case 'system':
      return ev.subtype === 'init' ? { ...run, sessionId, phase: 'thinking' } : run
    case 'stream_event': {
      const e = ev.event
      if (ev.parent_tool_use_id) return run // a subagent's output
      if (e?.type === 'message_start') return { ...run, sessionId, partial: '' }
      if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && typeof e.delta.text === 'string') {
        const partial = (run.partial ?? '') + e.delta.text
        return { ...run, sessionId, phase: 'writing', tool: undefined, reply: partial.trim(), partial }
      }
      if (e?.type === 'content_block_start' && e.content_block?.type === 'thinking') {
        return { ...run, sessionId, phase: 'thinking', tool: undefined }
      }
      return run
    }
    case 'assistant': {
      if (ev.parent_tool_use_id) return run
      const content = Array.isArray(ev.message?.content) ? ev.message.content : []
      const text = textOf(content)
      const tools = content.filter((b: any) => b && b.type === 'tool_use' && typeof b.name === 'string')
      let next: ClaudeRun = { ...run, sessionId }
      if (text) next = { ...next, reply: text, phase: 'writing', tool: undefined }
      if (tools.length) {
        const last = tools[tools.length - 1]
        const input = last.input && typeof last.input === 'object' ? last.input : {}
        next = { ...next, phase: 'tool', steps: run.steps + tools.length, tool: { name: last.name, detail: toolDetail(last.name, input) } }
      }
      return next
    }
    case 'user':
      // Tool results came back; Claude is thinking about them.
      return run.phase === 'tool' ? { ...run, sessionId, phase: 'thinking' } : run
    case 'result': {
      const ok = ev.is_error !== true && (ev.subtype === undefined || ev.subtype === 'success')
      const result = typeof ev.result === 'string' ? ev.result.trim() : ''
      return {
        ...run,
        sessionId,
        phase: ok ? 'done' : 'error',
        tool: undefined,
        reply: ok ? result || run.reply : run.reply,
        error: ok ? undefined : result || errorText(ev.subtype),
        finishedAt: now,
        costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : run.costUsd,
      }
    }
    default:
      return run
  }
}

function errorText(subtype: unknown): string {
  if (subtype === 'error_max_turns') return 'Claude stopped: it reached the turn limit.'
  if (subtype === 'error_during_execution') return 'Claude Code hit an error while working.'
  return 'Claude Code reported an error.'
}

/**
 * Plan usage from a `rate_limit_event` in the stream, merged into what we
 * know. utilization is a 0..1 fraction; resetsAt is in epoch seconds. Pure.
 */
export function usageFromRateLimitEvent(prev: ClaudeUsage | undefined, ev: any, now: number): ClaudeUsage | undefined {
  const info = ev?.type === 'rate_limit_event' ? ev.rate_limit_info : null
  if (!info || typeof info !== 'object') return prev
  const key = info.rateLimitType === 'five_hour' ? 'fiveHour' : info.rateLimitType === 'seven_day' ? 'sevenDay' : null
  if (!key) return prev
  const had = prev?.[key]
  const pct =
    typeof info.utilization === 'number'
      ? Math.max(0, Math.min(100, info.utilization * 100))
      : info.status === 'rejected'
        ? 100
        : had?.pct
  if (pct === undefined) return prev
  const win: UsageWindow = {
    pct,
    resetsAt: typeof info.resetsAt === 'number' ? info.resetsAt * 1000 : had?.resetsAt,
    limited: info.status === 'rejected' || undefined,
  }
  return { ...(prev ?? {}), [key]: win, updatedAt: now }
}

/** Validate usage sent over the socket by the status line bridge. Pure. */
export function parseUsage(raw: any, now: number): ClaudeUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const win = (w: any): UsageWindow | undefined =>
    w && typeof w.pct === 'number' && Number.isFinite(w.pct)
      ? { pct: Math.max(0, Math.min(100, w.pct)), resetsAt: typeof w.resetsAt === 'number' ? w.resetsAt : undefined }
      : undefined
  const fiveHour = win(raw.fiveHour)
  const sevenDay = win(raw.sevenDay)
  if (!fiveHour && !sevenDay) return null
  return {
    fiveHour,
    sevenDay,
    model: typeof raw.model === 'string' ? raw.model.slice(0, 60) : undefined,
    updatedAt: Math.min(typeof raw.updatedAt === 'number' ? raw.updatedAt : now, now),
  }
}

/**
 * A window whose reset time has passed starts over at 0%. Pure.
 */
export function currentWindow(w: UsageWindow | undefined, now: number): UsageWindow | undefined {
  if (!w) return undefined
  if (w.resetsAt && w.resetsAt <= now) return { pct: 0 }
  return w
}

/** Thresholds that raise a heads-up card, once per window period. */
export const USAGE_ALERTS = [80, 95]

/**
 * Alerts to raise now: `seen` holds keys already shown ("fiveHour:<reset>:80").
 * Returns the new keys with the text to show. Pure.
 */
export function usageAlerts(
  usage: ClaudeUsage,
  seen: Set<string>,
  now: number,
): { key: string; window: 'fiveHour' | 'sevenDay'; pct: number; threshold: number }[] {
  const out: { key: string; window: 'fiveHour' | 'sevenDay'; pct: number; threshold: number }[] = []
  for (const window of ['fiveHour', 'sevenDay'] as const) {
    const w = currentWindow(usage[window], now)
    if (!w) continue
    // Highest crossed threshold only, so a jump from 50% to 97% shows one card.
    const threshold = [...USAGE_ALERTS].reverse().find((t) => w.pct >= t)
    if (threshold === undefined) continue
    const key = `${window}:${w.resetsAt ?? 'x'}:${threshold}`
    if (seen.has(key)) continue
    out.push({ key, window, pct: w.pct, threshold })
  }
  return out
}
