import { toolDetail } from './claude'

/**
 * Agent sessions running in terminals (Claude Code and others), followed live
 * through their hooks: what each is doing step by step, the files it edits
 * (+N −M, with the diff), when it needs you and when it's done. Pure.
 */

export const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'] as const
export type SessionEventName = (typeof EVENTS)[number]

/** One hunk of a unified diff; lines start with ' ', '-' or '+'. */
export type DiffHunk = { oldStart: number; newStart: number; lines: string[] }

export type FileDiff = { file: string; added: number; removed: number; hunks: DiffHunk[]; truncated?: boolean }

export type SessionStep = {
  id: string
  tool: string
  label: string
  at: number
  done: boolean
  /** Lines an edit added and removed. */
  stat?: { added: number; removed: number }
}

export type SessionPhase = 'idle' | 'working' | 'waiting' | 'done'

export type AgentSession = {
  id: string
  /** Which agent: 'claude-code', 'codex', 'gemini', … */
  agent: string
  cwd: string
  /** The folder's name. */
  project: string
  phase: SessionPhase
  /** What you asked this turn. */
  prompt?: string
  /** This turn's steps, newest last (capped). */
  steps: SessionStep[]
  /** Steps this turn (the list keeps only the latest). */
  turnSteps: number
  added: number
  removed: number
  /** Edits this turn. */
  edits: number
  /** Commands it ran this turn. */
  commands?: number
  /** The files changed this turn, with their diffs, most recently changed first. */
  files: FileDiff[]
  startedAt: number
  turnStartedAt?: number
  finishedAt?: number
  lastAt: number
  /** "Claude is waiting for your input", … */
  message?: string
  /** The last thing it said (when the turn ended). */
  final?: string
  /** The agent's process (to find its terminal, and notice it quit). */
  pid?: number
}

export type AgentEvent = {
  event: SessionEventName
  agent: string
  sessionId: string
  at: number
  cwd?: string
  prompt?: string
  tool?: string
  input?: Record<string, unknown>
  /** Claude Code's structuredPatch for an edit, when it sent one. */
  patch?: DiffHunk[]
  /** Write: whether it created the file. */
  created?: boolean
  message?: string
  final?: string
  pid?: number
}

export const MAX_STEPS = 20
/** Diffs bigger than this keep only their counts. */
export const MAX_DIFF_LINES = 4000

const str = (v: unknown, max = 4000): string | undefined => (typeof v === 'string' && v ? (v.length > max ? v.slice(0, max) : v) : undefined)

/** Validate an untrusted event from the socket. Pure. */
export function parseEvent(raw: any, now = Date.now()): AgentEvent | null {
  if (!raw || typeof raw !== 'object') return null
  if (!(EVENTS as readonly string[]).includes(raw.event)) return null
  const sessionId = str(raw.sessionId, 200)
  if (!sessionId) return null
  const agent = str(raw.agent, 40)?.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'claude-code'
  const patch = Array.isArray(raw.patch)
    ? raw.patch
        .filter((h: any) => h && Array.isArray(h.lines))
        .map((h: any) => ({ oldStart: Number(h.oldStart) || 0, newStart: Number(h.newStart) || 0, lines: h.lines.filter((l: unknown) => typeof l === 'string') }))
    : undefined
  return {
    event: raw.event,
    agent,
    sessionId,
    at: Number.isFinite(raw.at) ? Number(raw.at) : now,
    cwd: str(raw.cwd, 1000),
    prompt: str(raw.prompt, 2000),
    tool: str(raw.tool, 200),
    input: raw.input && typeof raw.input === 'object' && !Array.isArray(raw.input) ? raw.input : undefined,
    patch,
    created: raw.created === true || undefined,
    message: str(raw.message, 500),
    final: str(raw.final, 4000),
    pid: Number.isInteger(raw.pid) && raw.pid > 1 ? raw.pid : undefined,
  }
}

const projectOf = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd

const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']

/** Other agents' tools, as the Claude Code tool that does the same. */
const TOOL_ALIASES: Record<string, string> = {
  read_file: 'Read',
  read_many_files: 'Read',
  view: 'Read',
  write_file: 'Write',
  create: 'Write',
  replace: 'Edit',
  edit: 'Edit',
  edit_file: 'Edit',
  str_replace: 'Edit',
  apply_patch: 'Edit',
  run_shell_command: 'Bash',
  shell: 'Bash',
  bash: 'Bash',
  run_command: 'Bash',
  exec_command: 'Bash',
  local_shell: 'Bash',
  glob: 'Glob',
  find_files: 'Glob',
  search_file_content: 'Grep',
  grep: 'Grep',
  grep_search: 'Grep',
  codebase_search: 'Grep',
  list_directory: 'LS',
  ls: 'LS',
  web_fetch: 'WebFetch',
  fetch: 'WebFetch',
  google_web_search: 'WebSearch',
  web_search: 'WebSearch',
  write_todos: 'TodoWrite',
  todo_write: 'TodoWrite',
  update_plan: 'TodoWrite',
}

/**
 * Another agent's tool call as Claude Code's: its name, and the path and
 * command under the names Claude uses (file_path, command). Pure.
 */
export function canonicalTool(tool: string, input?: Record<string, unknown>): { tool: string; input?: Record<string, unknown> } {
  const name = TOOL_ALIASES[tool] ?? TOOL_ALIASES[tool.toLowerCase()] ?? tool
  if (!input) return { tool: name }
  const i: Record<string, unknown> = { ...input }
  const path = i.file_path ?? i.absolute_path ?? i.path ?? i.FilePath ?? i.target_file
  if (typeof path === 'string' && name !== 'Glob' && name !== 'Grep') i.file_path = path
  const cmd = i.command ?? i.CommandLine ?? i.cmd
  if (Array.isArray(cmd)) i.command = cmd.filter((c) => typeof c === 'string').join(' ').replace(/^(bash|sh|zsh) -l?c /, '')
  else if (typeof cmd === 'string') i.command = cmd
  if (name === 'Edit' && typeof i.old_str === 'string' && i.old_string === undefined) i.old_string = i.old_str
  if (name === 'Edit' && typeof i.new_str === 'string' && i.new_string === undefined) i.new_string = i.new_str
  return { tool: name, input: i }
}

/** What a step says: "Reading app.ts", "Asking you a question". Pure. */
export function stepLabel(tool: string, input?: Record<string, unknown>): string {
  if (tool === 'AskUserQuestion') return 'Asking you a question'
  if (tool === 'ExitPlanMode') return 'Showing you a plan'
  return toolDetail(tool, input)
}

/** Fold one event into the sessions. Pure. */
export function applyEvent(sessions: Record<string, AgentSession>, e: AgentEvent): Record<string, AgentSession> {
  if (e.event === 'SessionEnd') {
    if (!sessions[e.sessionId]) return sessions
    const { [e.sessionId]: _gone, ...rest } = sessions
    return rest
  }
  const prev = sessions[e.sessionId]
  const cwd = e.cwd ?? prev?.cwd ?? ''
  let s: AgentSession = prev ?? {
    id: e.sessionId,
    agent: e.agent,
    cwd,
    project: projectOf(cwd),
    phase: 'idle',
    steps: [],
    turnSteps: 0,
    added: 0,
    removed: 0,
    edits: 0,
    files: [],
    startedAt: e.at,
    lastAt: e.at,
  }
  s = { ...s, lastAt: e.at, pid: e.pid ?? s.pid }
  if (e.cwd && e.cwd !== s.cwd) s = { ...s, cwd: e.cwd, project: projectOf(e.cwd) }

  switch (e.event) {
    case 'SessionStart':
      break
    case 'UserPromptSubmit':
      s = { ...s, phase: 'working', prompt: e.prompt ?? s.prompt, steps: [], turnSteps: 0, added: 0, removed: 0, edits: 0, commands: 0, files: [], turnStartedAt: e.at, finishedAt: undefined, final: undefined, message: undefined }
      break
    case 'PreToolUse': {
      const { tool, input } = e.agent === 'claude-code' ? { tool: e.tool ?? 'tool', input: e.input } : canonicalTool(e.tool ?? 'tool', e.input)
      e = { ...e, input }
      const steps = s.steps.map((x) => (x.done ? x : { ...x, done: true }))
      steps.push({ id: `${e.at}-${s.turnSteps}`, tool, label: stepLabel(tool, e.input), at: e.at, done: false })
      s = {
        ...s,
        phase: 'working',
        turnStartedAt: s.turnStartedAt ?? e.at,
        steps: steps.slice(-MAX_STEPS),
        turnSteps: s.turnSteps + 1,
        commands: (s.commands ?? 0) + (tool === 'Bash' ? 1 : 0),
        message: undefined,
        finishedAt: undefined,
      }
      break
    }
    case 'PostToolUse': {
      const { tool, input } = e.agent === 'claude-code' ? { tool: e.tool ?? 'tool', input: e.input } : canonicalTool(e.tool ?? 'tool', e.input)
      e = { ...e, input }
      const diff = EDIT_TOOLS.includes(tool) ? diffForEdit(tool, e.input, e.patch, e.created) : undefined
      let hit = -1
      for (let i = s.steps.length - 1; i >= 0; i--)
        if (s.steps[i].tool === tool && !s.steps[i].done) {
          hit = i
          break
        }
      const steps = [...s.steps]
      const stat = diff ? { added: diff.added, removed: diff.removed } : undefined
      if (hit >= 0) steps[hit] = { ...steps[hit], done: true, stat }
      else if (diff) steps.push({ id: `${e.at}-${s.turnSteps}`, tool, label: stepLabel(tool, e.input), at: e.at, done: true, stat })
      s = {
        ...s,
        files: diff ? mergeFile(s.files, diff) : s.files,
        steps: steps.slice(-MAX_STEPS),
        added: s.added + (diff?.added ?? 0),
        removed: s.removed + (diff?.removed ?? 0),
        edits: s.edits + (diff ? 1 : 0),
      }
      break
    }
    case 'Notification':
      if (e.message && /waiting for your input/i.test(e.message)) {
        // Idle at the prompt: its turn is over (if Stop was missed, now it's done).
        if (s.phase === 'working') s = { ...s, phase: 'done', finishedAt: e.at }
      } else if (e.message) {
        // "Claude needs your permission to use Bash": it's stuck until you answer.
        s = { ...s, phase: 'waiting', message: e.message }
      }
      break
    case 'Stop':
      s = { ...s, phase: 'done', final: e.final ?? s.final, finishedAt: e.at, steps: s.steps.map((x) => (x.done ? x : { ...x, done: true })) }
      break
  }
  return { ...sessions, [s.id]: s }
}

/** Sessions with nothing heard for `maxIdleMs` are gone (closed without saying). Pure. */
export function pruneSessions(sessions: Record<string, AgentSession>, now: number, maxIdleMs = 2 * 60 * 60_000): Record<string, AgentSession> {
  const out: Record<string, AgentSession> = {}
  for (const [k, s] of Object.entries(sessions)) if (now - s.lastAt < maxIdleMs) out[k] = s
  return out
}

/** Newest activity first; ones that want you, then working ones, first. Pure. */
export function sortSessions(list: AgentSession[]): AgentSession[] {
  const rank: Record<SessionPhase, number> = { waiting: 0, working: 1, done: 2, idle: 3 }
  return [...list].sort((a, b) => rank[a.phase] - rank[b.phase] || b.lastAt - a.lastAt)
}

// ---- diffs ----

export const MAX_FILES = 40

/** Add an edit to the files changed: one entry per file, moved to the front. Pure. */
export function mergeFile(files: FileDiff[], d: FileDiff): FileDiff[] {
  const prev = files.find((f) => f.file === d.file)
  const rest = files.filter((f) => f.file !== d.file)
  let merged: FileDiff = d
  if (prev) {
    const hunks = [...prev.hunks, ...d.hunks]
    const lines = hunks.reduce((n, h) => n + h.lines.length, 0)
    const truncated = prev.truncated || d.truncated || lines > MAX_DIFF_LINES
    merged = { file: d.file, added: prev.added + d.added, removed: prev.removed + d.removed, hunks: lines > MAX_DIFF_LINES ? prev.hunks : hunks, ...(truncated ? { truncated: true } : {}) }
  }
  return [merged, ...rest].slice(0, MAX_FILES)
}

const linesOf = (s: string): string[] => (s === '' ? [] : s.replace(/\n$/, '').split('\n'))

/**
 * Line diff of two texts as hunks with 3 lines of context, via a longest
 * common subsequence (small inputs only: bigger ones give counts alone). Pure.
 */
export function lineDiff(a: string, b: string, context = 3): { hunks: DiffHunk[]; added: number; removed: number; truncated?: boolean } {
  const A = linesOf(a)
  const B = linesOf(b)
  if (A.length * B.length > 2_000_000 || A.length + B.length > MAX_DIFF_LINES * 2) {
    return { hunks: [], added: B.length, removed: A.length, truncated: true }
  }
  // LCS table, row by row from the end.
  const n = A.length
  const m = B.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  type Op = { k: ' ' | '-' | '+'; t: string; ai: number; bi: number }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) ops.push({ k: ' ', t: A[i], ai: i++, bi: j++ })
    // Removals before additions, as diffs usually read.
    else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) ops.push({ k: '-', t: A[i], ai: i++, bi: j })
    else ops.push({ k: '+', t: B[j], ai: i, bi: j++ })
  }
  const added = ops.filter((o) => o.k === '+').length
  const removed = ops.filter((o) => o.k === '-').length
  // Group changes with their context into hunks.
  const hunks: DiffHunk[] = []
  let cur: { start: number; end: number } | null = null
  const ranges: { start: number; end: number }[] = []
  ops.forEach((o, x) => {
    if (o.k === ' ') return
    const start = Math.max(0, x - context)
    const end = Math.min(ops.length - 1, x + context)
    if (cur && start <= cur.end + 1) cur.end = Math.max(cur.end, end)
    else {
      cur = { start, end }
      ranges.push(cur)
    }
  })
  for (const r of ranges) {
    const slice = ops.slice(r.start, r.end + 1)
    hunks.push({ oldStart: slice[0].ai + 1, newStart: slice[0].bi + 1, lines: slice.map((o) => `${o.k}${o.t}`) })
  }
  return { hunks, added, removed }
}

/** Counts and hunks for an edit: Claude's own patch when it sent one, else worked out from the input. Pure. */
export function diffForEdit(tool: string, input: Record<string, unknown> | undefined, patch?: DiffHunk[], created?: boolean): FileDiff | undefined {
  const i = input ?? {}
  const file = String(i.file_path ?? i.notebook_path ?? '')
  if (!file) return undefined
  if (patch && patch.length) {
    let added = 0
    let removed = 0
    for (const h of patch)
      for (const l of h.lines) {
        if (l.startsWith('+')) added++
        else if (l.startsWith('-')) removed++
      }
    const total = patch.reduce((n, h) => n + h.lines.length, 0)
    return total > MAX_DIFF_LINES ? { file, added, removed, hunks: [], truncated: true } : { file, added, removed, hunks: patch }
  }
  if (tool === 'Write') {
    const content = typeof i.content === 'string' ? i.content : ''
    const d = lineDiff(typeof i.previous === 'string' && !created ? i.previous : '', content)
    return { file, ...d }
  }
  if (tool === 'Edit') {
    const d = lineDiff(String(i.old_string ?? ''), String(i.new_string ?? ''))
    return { file, ...d }
  }
  if (tool === 'MultiEdit' && Array.isArray(i.edits)) {
    const parts = i.edits.map((x: any) => lineDiff(String(x?.old_string ?? ''), String(x?.new_string ?? '')))
    return {
      file,
      added: parts.reduce((n: number, p: { added: number }) => n + p.added, 0),
      removed: parts.reduce((n: number, p: { removed: number }) => n + p.removed, 0),
      hunks: parts.flatMap((p: { hunks: DiffHunk[] }) => p.hunks),
      truncated: parts.some((p: { truncated?: boolean }) => p.truncated) || undefined,
    }
  }
  return undefined
}

/** "Claude Code", "Codex", "Gemini CLI", or the tag as given. Pure. */
export function agentName(agent: string): string {
  const known: Record<string, string> = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
    gemini: 'Gemini CLI',
    cursor: 'Cursor',
    copilot: 'Copilot CLI',
    opencode: 'OpenCode',
    amp: 'Amp',
  }
  return known[agent] ?? agent.replace(/(^|-)([a-z])/g, (_m, sep, c) => (sep ? ' ' : '') + c.toUpperCase())
}

/** "2 min 5 s", "45 s", "1 h 3 min". Pure. */
export function durationText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`
}

/** The step it's on right now, if it's in the middle of one. Pure. */
export function currentStep(s: AgentSession): SessionStep | undefined {
  const last = s.steps[s.steps.length - 1]
  return last && !last.done ? last : undefined
}

/** One line on what a session is doing. Pure. */
export function sessionStatus(s: AgentSession, now: number): string {
  switch (s.phase) {
    case 'working':
      return currentStep(s)?.label ?? 'Thinking…'
    case 'waiting':
      return s.message ?? 'Needs you in the terminal'
    case 'done': {
      const took = s.turnStartedAt && s.finishedAt ? ` in ${durationText(s.finishedAt - s.turnStartedAt)}` : ''
      return `Done${took}${s.turnSteps ? ` · ${s.turnSteps} step${s.turnSteps === 1 ? '' : 's'}` : ''}`
    }
    default:
      return s.startedAt > now - 60_000 ? 'Just started' : 'Ready for you'
  }
}

/** The file's name without its folders. Pure. */
export const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** "+12 −3". Pure. */
export function diffStat(added: number, removed: number): string {
  return `+${added} −${removed}`
}
