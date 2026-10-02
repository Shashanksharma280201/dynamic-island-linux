import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createDecoder } from '@shared/protocol'
import {
  applyStreamEvent,
  newRun,
  usageFromRateLimitEvent,
  type ClaudeRun,
  type ClaudeState,
  type ClaudeTurn,
  type ClaudeUsage,
} from '@shared/claude'
import type { ClaudeConfig } from './config'
import { MCP_NAME } from './agent/mcpServer'

/** Where the claude command usually lives when it isn't on the app's PATH. */
export function claudeSearchDirs(home: string): string[] {
  return [
    join(home, '.local/bin'),
    join(home, '.claude/local'),
    join(home, '.npm-global/bin'),
    join(home, '.bun/bin'),
    join(home, '.volta/bin'),
    '/usr/local/bin',
    '/usr/bin',
  ]
}

const TOOLS_NOTE =
  `You also have the island's own tools (mcp__${MCP_NAME}__…) for the user's notes, WhatsApp chats, mail, music, ` +
  'documents (PDF, Word, Excel) and CRM (people, deals, follow-ups): use them for those instead of looking for files. ' +
  'Tools that act for the user ask them on the island first; just call them.'

const SYSTEM_NOTE =
  'The user is talking to you from a small desktop widget (the Dynamic Island). ' +
  'Their message may have been spoken and transcribed, so it can contain transcription mistakes: ' +
  'read it for intent. Your final reply is shown in a small panel: keep it short and plain ' +
  '(a few sentences, no big tables or headings) unless they ask for detail.'

/**
 * Arguments for one `claude -p` turn. Pure.
 * `hookCommand` is set when the approvals hook isn't installed globally, so
 * this run still asks on the island instead of silently denying.
 */
export function claudeArgs(o: {
  prompt: string
  sessionId?: string
  permissionMode: ClaudeConfig['permissionMode']
  hookCommand?: string
  /** The island's MCP server (its packages' tools), for --mcp-config. */
  mcpConfig?: string
}): string[] {
  const args = [
    '-p',
    o.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--append-system-prompt',
    o.mcpConfig ? `${SYSTEM_NOTE} ${TOOLS_NOTE}` : SYSTEM_NOTE,
  ]
  if (o.sessionId) args.push('--resume', o.sessionId)
  if (o.permissionMode !== 'default') args.push('--permission-mode', o.permissionMode)
  if (o.hookCommand) {
    args.push(
      '--settings',
      JSON.stringify({
        hooks: { PermissionRequest: [{ matcher: '.*', hooks: [{ type: 'command', command: o.hookCommand, timeout: 60 }] }] },
      }),
    )
  }
  // The island's tools are allowed without a prompt: the ones that act for
  // the user ask on the island themselves.
  if (o.mcpConfig) args.push('--allowedTools', `mcp__${MCP_NAME}`, '--mcp-config', o.mcpConfig)
  return args
}

/** Explain a run that ended without a result, from its exit and stderr. Pure. */
export function failureText(code: number | null, stderr: string, binary: string): string {
  const tail = stderr.trim().split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 300)
  if (/No conversation found|session.*not found/i.test(stderr)) return 'That conversation is gone. Start a new one and try again.'
  if (/login|authenticat|api key/i.test(stderr)) return `Claude Code isn't logged in. Run "claude" in a terminal and log in first. (${tail})`
  if (code === 127 || /ENOENT/.test(stderr)) return `Couldn't run ${binary}. Is Claude Code installed?`
  return tail || `Claude Code exited with code ${code}.`
}

const MAX_TURNS = 30

type Deps = {
  config: () => ClaudeConfig
  /** Absolute path of the claude command, or null. */
  findBinary: () => string | null
  /** Command to run the approvals hook for this run, or undefined if installed globally. */
  hookCommand: () => string | undefined
  /** Called as each run starts: the island's tools for it (--mcp-config), if any. */
  mcpConfig?: () => string | undefined
  approvalsInstalled: () => boolean
  usageBridgeInstalled: () => boolean
  socketPath: string
  dataDir: string
  onChange: (s: ClaudeState) => void
  onUsage: (u: ClaudeUsage) => void
  onFinished: (run: ClaudeRun) => void
}

/**
 * Runs Claude Code for commands given on the island, one turn at a time,
 * continuing the same conversation until you start a new one.
 */
export class ClaudeCode {
  private run?: ClaudeRun
  private child?: ChildProcess
  private sessionId?: string
  private turns: ClaudeTurn[] = []
  private usage?: ClaudeUsage
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private seq = 0

  constructor(private d: Deps) {
    try {
      const saved = JSON.parse(readFileSync(this.file('claude-conversation.json'), 'utf8'))
      if (typeof saved.sessionId === 'string') this.sessionId = saved.sessionId
      if (Array.isArray(saved.turns)) this.turns = saved.turns.slice(-MAX_TURNS)
    } catch {
      // first run
    }
    try {
      this.usage = JSON.parse(readFileSync(this.file('claude-usage.json'), 'utf8'))
    } catch {
      // none yet
    }
  }

  private file(name: string): string {
    return join(this.d.dataDir, name)
  }

  private save(name: string, data: unknown): void {
    try {
      mkdirSync(this.d.dataDir, { recursive: true })
      const f = this.file(name)
      writeFileSync(f + '.tmp', JSON.stringify(data))
      renameSync(f + '.tmp', f)
    } catch (e) {
      console.error('[claude] save failed:', e)
    }
  }

  cwd(): string {
    const c = this.d.config().cwd
    return c && existsSync(c) ? c : homedir()
  }

  state(): ClaudeState {
    return {
      binary: this.d.findBinary(),
      cwd: this.cwd(),
      sessionId: this.sessionId,
      turns: this.turns,
      run: this.run,
      usage: this.usage,
      usageBridge: this.d.usageBridgeInstalled(),
      approvals: this.d.approvalsInstalled(),
    }
  }

  get busy(): boolean {
    return !!this.child
  }

  /** Push state at most every 60 ms while streaming; `now` pushes right away. */
  changed(now = false): void {
    if (now) {
      if (this.pushTimer) clearTimeout(this.pushTimer)
      this.pushTimer = null
      this.d.onChange(this.state())
      return
    }
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      this.d.onChange(this.state())
    }, 60)
  }

  setUsage(u: ClaudeUsage): void {
    // Keep the newest reading of each window.
    this.usage = { ...(this.usage ?? {}), ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)), updatedAt: u.updatedAt } as ClaudeUsage
    this.save('claude-usage.json', this.usage)
    this.d.onUsage(this.usage)
    this.changed()
  }

  newConversation(): void {
    if (this.busy) throw new Error('Claude is still working. Stop it first.')
    this.sessionId = undefined
    this.turns = []
    this.run = undefined
    this.save('claude-conversation.json', { sessionId: null, turns: [] })
    this.changed(true)
  }

  /** Start a turn. Rejects if Claude isn't installed or is already busy. */
  ask(prompt: string): ClaudeRun {
    const text = prompt.trim().slice(0, 8000)
    if (!text) throw new Error('Say or type what Claude should do.')
    if (this.busy) throw new Error('Claude is still working on the last one.')
    const binary = this.d.findBinary()
    if (!binary) throw new Error('Claude Code isn’t installed (the "claude" command wasn’t found). Set its path in Settings.')
    const cwd = this.cwd()
    const run = newRun(`run-${Date.now()}-${++this.seq}`, text, cwd, Date.now())
    run.sessionId = this.sessionId
    this.run = run
    const args = claudeArgs({
      prompt: text,
      sessionId: this.sessionId,
      permissionMode: this.d.config().permissionMode,
      hookCommand: this.d.hookCommand(),
      mcpConfig: this.d.mcpConfig?.(),
    })
    const env: NodeJS.ProcessEnv = { ...process.env, DYNAMIC_ISLAND_SOCK: this.d.socketPath, DYNAMIC_ISLAND_RUN: '1' }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(binary, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    const decode = createDecoder()
    let stderr = ''
    child.stdout!.on('data', (chunk) => {
      for (const ev of decode(chunk)) {
        if (!this.run || this.run.id !== run.id) return
        const now = Date.now()
        const usage = usageFromRateLimitEvent(this.usage, ev, now)
        if (usage !== this.usage && usage) this.setUsage(usage)
        this.run = applyStreamEvent(this.run, ev, now)
      }
      this.changed()
    })
    child.stderr!.on('data', (d) => (stderr = (stderr + d).slice(-4000)))
    child.on('error', (e) => (stderr += `\n${e.message}`))
    child.on('close', (code) => this.finish(run.id, code, stderr, binary))
    this.changed(true)
    return run
  }

  private finish(id: string, code: number | null, stderr: string, binary: string): void {
    this.child = undefined
    let run = this.run
    if (!run || run.id !== id) return
    if (run.phase !== 'done' && run.phase !== 'error' && run.phase !== 'stopped') {
      run = { ...run, phase: 'error', tool: undefined, error: failureText(code, stderr, binary), finishedAt: Date.now() }
    }
    if (run.phase === 'error' && /conversation is gone/.test(run.error ?? '')) this.sessionId = undefined
    else if (run.sessionId) this.sessionId = run.sessionId
    this.run = { ...run, partial: undefined }
    const reply = run.phase === 'done' ? run.reply : run.phase === 'stopped' ? 'Stopped.' : run.error ?? ''
    this.turns = [...this.turns, { prompt: run.prompt, reply, ok: run.phase === 'done', at: run.finishedAt ?? Date.now() }].slice(-MAX_TURNS)
    this.save('claude-conversation.json', { sessionId: this.sessionId ?? null, turns: this.turns })
    this.changed(true)
    this.d.onFinished(this.run)
  }

  /** Stop the current turn (like pressing Esc in Claude Code). */
  stop(): void {
    const child = this.child
    if (!child || !this.run) return
    this.run = { ...this.run, phase: 'stopped', tool: undefined, finishedAt: Date.now() }
    child.kill('SIGINT')
    setTimeout(() => child.exitCode === null && child.kill('SIGTERM'), 3000).unref()
    this.changed(true)
  }

  dispose(): void {
    this.child?.kill('SIGTERM')
  }
}

/** Is `p` a folder we can run in? */
export function isFolder(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

