import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ToolId, ToolLink } from '@shared/brain'

export const BLOCK_START = '<!-- dynamic-island-brain:start (kept by the Dynamic Island: Settings → Brain) -->'
export const BLOCK_END = '<!-- dynamic-island-brain:end -->'
const START_RE = /<!-- dynamic-island-brain:start[^>]*-->/
const BLOCK_RE = /\n*<!-- dynamic-island-brain:start[^>]*-->[\s\S]*?<!-- dynamic-island-brain:end -->\n?/

/** The name Claude Code and others know the brain's MCP server by. */
export const MCP_SERVER = 'brain'
/** Marks the brain's hook entries in Claude Code's settings. */
export const HOOK_MARK = 'island-brain-hook'
/** Lets the brain's tools run without a prompt each time (they only read, or add to the inbox). */
export const ALLOW_RULE = `mcp__${MCP_SERVER}`

export function hasBlock(text: string): boolean {
  return START_RE.test(text)
}

/** The text with the island's block set to `inner` (added at the end if missing). Pure. */
export function withBlock(text: string, inner: string): string {
  const block = `${BLOCK_START}\n${inner.trim()}\n${BLOCK_END}\n`
  if (hasBlock(text)) return text.replace(BLOCK_RE, (m) => (m.startsWith('\n') ? `\n\n${block}` : block))
  const base = text.replace(/\s+$/, '')
  return base ? `${base}\n\n${block}` : block
}

/** The text without the island's block. Pure. */
export function withoutBlock(text: string): string {
  if (!hasBlock(text)) return text
  const out = text.replace(BLOCK_RE, '\n').replace(/\n{3,}/g, '\n\n')
  return out.trim() ? out.replace(/^\n+/, '').replace(/\n*$/, '\n') : ''
}

/** How CLAUDE.md imports the brief: from home as ~/…, else the full path. Pure. */
export function importLine(vault: string, home: string): string {
  const brief = `${vault.replace(/\/+$/, '')}/_system/brief.md`
  return home && brief.startsWith(home.replace(/\/+$/, '') + '/') ? `@~/${brief.slice(home.replace(/\/+$/, '').length + 1)}` : `@${brief}`
}

/** The block for Claude Code's CLAUDE.md. Pure. */
export function claudeBlock(vault: string, home: string): string {
  return `## My second brain\n\nWho I am and what I work on, from my second brain:\n${importLine(vault, home)}`
}

const isBrain = (e: unknown) => JSON.stringify(e).includes(HOOK_MARK)

/** Claude Code settings with the brain's hooks (and its tools allowed). Idempotent; keeps everything else. Pure. */
export function applyBrainHooks(settings: any, cmd: string): any {
  const s = removeBrainHooks(settings)
  s.hooks = s.hooks || {}
  for (const event of ['SessionStart', 'SessionEnd']) {
    s.hooks[event] = s.hooks[event] || []
    s.hooks[event].push({ hooks: [{ type: 'command', command: cmd, timeout: 10 }] })
  }
  s.permissions = s.permissions || {}
  s.permissions.allow = Array.isArray(s.permissions.allow) ? s.permissions.allow : []
  if (!s.permissions.allow.includes(ALLOW_RULE)) s.permissions.allow.push(ALLOW_RULE)
  return s
}

/** Claude Code settings without anything the brain added. Pure. */
export function removeBrainHooks(settings: any): any {
  const s = JSON.parse(JSON.stringify(settings || {}))
  if (s.hooks && typeof s.hooks === 'object') {
    for (const event of Object.keys(s.hooks)) {
      if (!Array.isArray(s.hooks[event])) continue
      s.hooks[event] = s.hooks[event].filter((e: unknown) => !isBrain(e))
      if (!s.hooks[event].length) delete s.hooks[event]
    }
    if (!Object.keys(s.hooks).length) delete s.hooks
  }
  if (Array.isArray(s.permissions?.allow)) {
    s.permissions.allow = s.permissions.allow.filter((r: unknown) => r !== ALLOW_RULE)
    if (!s.permissions.allow.length) delete s.permissions.allow
    if (!Object.keys(s.permissions).length) delete s.permissions
  }
  return s
}

export function hasBrainHooks(settings: any): boolean {
  return ['SessionStart', 'SessionEnd'].every((e) => Array.isArray(settings?.hooks?.[e]) && settings.hooks[e].some(isBrain))
}

export type WireDeps = {
  home: string
  /** ~/.claude, or CLAUDE_CONFIG_DIR. */
  claudeDir: string
  /** Where Claude Code keeps user MCP servers (~/.claude.json). */
  claudeJson: string
  codexDir: string
  geminiDir: string
  vault: () => string
  claudeBinary: () => string | null
  /** The command Claude Code runs for the brain's hook. */
  hookCommand: () => string
  /** The brain's MCP address and header, or null when it isn't running. */
  mcp: () => { url: string; authorization: string } | null
  brief: () => string
}

/** The JSON for `claude mcp add-json`. Pure. */
export function mcpEntry(url: string, authorization: string, client: string): string {
  return JSON.stringify({ type: 'http', url: `${url}?client=${client}`, headers: { Authorization: authorization } })
}

/**
 * Connects the brain to your AI tools and reports how far each is. Every file
 * it changes is backed up first (as .bak) and only the island's own parts are
 * ever removed.
 */
export class Wiring {
  constructor(private readonly d: WireDeps) {}

  private claudeMd(): string {
    return join(this.d.claudeDir, 'CLAUDE.md')
  }

  private settingsFile(): string {
    return join(this.d.claudeDir, 'settings.json')
  }

  private inlineFile(id: 'codex' | 'gemini'): string {
    return id === 'codex' ? join(this.d.codexDir, 'AGENTS.md') : join(this.d.geminiDir, 'GEMINI.md')
  }

  status(): ToolLink[] {
    const claudeMd = read(this.claudeMd())
    const settings = readJson(this.settingsFile())
    const mcp = this.mcpRegistered()
    const claudeParts = [
      { label: 'Your brief in ~/.claude/CLAUDE.md', done: hasBlock(claudeMd) },
      { label: 'This project’s page and recent sessions at the start of each session, a note at the end', done: hasBrainHooks(settings) },
      { label: 'Brain tools (search, read, capture)', done: mcp },
    ]
    const binary = this.d.claudeBinary()
    const links: ToolLink[] = [
      {
        id: 'claude-code',
        name: 'Claude Code',
        present: !!binary || existsSync(this.d.claudeDir),
        parts: claudeParts,
        connected: claudeParts.every((p) => p.done),
        manual: !binary && this.d.mcp() ? `claude mcp add-json --scope user ${MCP_SERVER} '${mcpEntry(this.d.mcp()!.url, this.d.mcp()!.authorization, 'claude-code')}'` : undefined,
      },
    ]
    for (const id of ['codex', 'gemini'] as const) {
      const file = this.inlineFile(id)
      const done = hasBlock(read(file))
      links.push({
        id,
        name: id === 'codex' ? 'Codex CLI' : 'Gemini CLI',
        present: existsSync(dirname(file)),
        parts: [{ label: `Your brief in ${file.replace(this.d.home, '~')}`, done }],
        connected: done,
      })
    }
    return links
  }

  /** Has Claude Code got the brain's MCP server at all (any address)? */
  mcpKnown(): boolean {
    return !!readJson(this.d.claudeJson)?.mcpServers?.[MCP_SERVER]
  }

  /** Is the brain's MCP server in Claude Code's user config, at today's address? */
  mcpRegistered(): boolean {
    const cfg = readJson(this.d.claudeJson)
    const url = cfg?.mcpServers?.[MCP_SERVER]?.url
    const now = this.d.mcp()?.url
    return typeof url === 'string' && (!now || url.startsWith(now))
  }

  async connect(id: ToolId): Promise<string | null> {
    if (id === 'claude-code') {
      edit(this.claudeMd(), (t) => withBlock(t, claudeBlock(this.d.vault(), this.d.home)))
      const problem = editJson(this.settingsFile(), (s) => applyBrainHooks(s, this.d.hookCommand()))
      if (problem) return problem
      return this.registerMcp()
    }
    edit(this.inlineFile(id), (t) => withBlock(t, this.d.brief()))
    return null
  }

  async disconnect(id: ToolId): Promise<string | null> {
    if (id === 'claude-code') {
      edit(this.claudeMd(), withoutBlock, false)
      const problem = editJson(this.settingsFile(), removeBrainHooks, false)
      const bin = this.d.claudeBinary()
      if (bin && this.mcpRegistered()) await run(bin, ['mcp', 'remove', '--scope', 'user', MCP_SERVER])
      return problem
    }
    edit(this.inlineFile(id), withoutBlock, false)
    return null
  }

  /** Add (or move) the brain's MCP server in Claude Code; an error to show, or null. */
  async registerMcp(): Promise<string | null> {
    const mcp = this.d.mcp()
    if (!mcp) return 'The brain’s tools aren’t running, so Claude Code can’t be given them yet.'
    const bin = this.d.claudeBinary()
    if (!bin) return 'Claude Code wasn’t found. Run the command shown under Claude Code in a terminal to add the brain’s tools.'
    await run(bin, ['mcp', 'remove', '--scope', 'user', MCP_SERVER])
    const r = await run(bin, ['mcp', 'add-json', '--scope', 'user', MCP_SERVER, mcpEntry(mcp.url, mcp.authorization, 'claude-code')])
    return r.ok || this.mcpRegistered() ? null : `Claude Code couldn’t add the brain’s tools: ${r.err.trim().split('\n')[0] || 'unknown error'}`
  }

  /** After the brief changes: refresh the copies in Codex and Gemini CLI. */
  refreshInline(): void {
    for (const id of ['codex', 'gemini'] as const) {
      const file = this.inlineFile(id)
      if (hasBlock(read(file))) edit(file, (t) => withBlock(t, this.d.brief()), false)
    }
  }

  /** Is anything connected (so uninstalling knows to undo it)? */
  any(): boolean {
    return this.status().some((t) => t.parts.some((p) => p.done))
  }
}

function read(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''))
  } catch {
    return null
  }
}

/** Change a text file through `f`, backing it up first. */
function edit(file: string, f: (text: string) => string, create = true): void {
  const exists = existsSync(file)
  if (!exists && !create) return
  const before = read(file)
  const after = f(before)
  if (after === before) return
  if (exists) copyFileSync(file, `${file}.bak`)
  // Nothing left but what the island added: no file, as before.
  if (exists && !after.trim()) return unlinkSync(file)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, after)
}

/** Change a JSON file through `f`; refuses to touch one that isn't valid JSON. */
function editJson(file: string, f: (json: any) => any, create = true): string | null {
  const exists = existsSync(file)
  if (!exists && !create) return null
  const raw = read(file)
  let json: any = {}
  if (raw.trim()) {
    try {
      json = JSON.parse(raw.replace(/^﻿/, ''))
    } catch (e) {
      return `${file} isn’t valid JSON, so it was left alone (${e instanceof Error ? e.message : e}).`
    }
  }
  const next = f(json)
  const text = JSON.stringify(next, null, 2) + '\n'
  if (text === raw) return null
  if (exists) copyFileSync(file, `${file}.bak`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  return null
}

function run(bin: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) =>
    execFile(bin, args, { timeout: 30_000, env: { ...process.env, DYNAMIC_ISLAND_RUN: '1', DI_BRAIN_SKIP: '1' } }, (e, out, err) => resolve({ ok: !e, out: String(out), err: String(err || e?.message || '') })),
  )
}

/** One argument for a POSIX shell. Pure. */
export const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

/** One argument on a Windows command line (the rules programs read it back with). Pure. */
export function winQuote(a: string): string {
  if (a && !/[\s"]/.test(a)) return a
  let out = '"'
  let slashes = 0
  for (const ch of a) {
    if (ch === '\\') {
      slashes++
      continue
    }
    out += ch === '"' ? `${'\\'.repeat(slashes * 2 + 1)}"` : `${'\\'.repeat(slashes)}${ch}`
    slashes = 0
  }
  return `${out}${'\\'.repeat(slashes * 2)}"`
}

/** A PowerShell string in single quotes (it takes curly quotes as quotes too). Pure. */
const psQuote = (s: string): string => `'${s.replace(/['\u2018\u2019\u201a\u201b]/g, '$&$&')}'`

/** What a Mac's Terminal opens: a .command file that goes to `cwd` and runs `argv`. Pure. */
export function macLauncher(cwd: string, argv: string[]): string {
  return `#!/bin/sh\ncd ${shQuote(cwd)} || exit 1\nexec ${argv.map(shQuote).join(' ')}\n`
}

/**
 * What a new PowerShell window runs on Windows: go to `cwd` and run `argv`.
 * The command line is built here, so a long prompt with quotes arrives whole.
 * Pure.
 */
export function winLauncher(cwd: string, argv: string[]): string {
  const [bin, ...args] = argv
  return `Set-Location -LiteralPath ${psQuote(cwd)}\nStart-Process -FilePath ${psQuote(bin)}${args.length ? ` -ArgumentList ${psQuote(args.map(winQuote).join(' '))}` : ''} -NoNewWindow -Wait\n`
}

/**
 * Open a terminal in `cwd` running `argv`: Terminal on a Mac, a PowerShell
 * window on Windows, gnome-terminal and the usual others on Linux.
 */
export function openTerminal(cwd: string, argv: string[], find: (name: string) => string | null, platform: string = process.platform): boolean {
  if (platform === 'darwin' || platform === 'win32') {
    try {
      const file = join(tmpdir(), `dynamic-island-run-${randomBytes(4).toString('hex')}.${platform === 'darwin' ? 'command' : 'ps1'}`)
      if (platform === 'darwin') {
        writeFileSync(file, macLauncher(cwd, argv), { mode: 0o755 })
        spawn('open', ['-a', 'Terminal', file], { detached: true, stdio: 'ignore' }).unref()
      } else {
        writeFileSync(file, '\ufeff' + winLauncher(cwd, argv)) // BOM: Windows PowerShell reads it as UTF-8
        // Detached on Windows: a console window of its own.
        spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { cwd, detached: true, stdio: 'ignore' }).unref()
      }
      return true
    } catch {
      return false
    }
  }
  const tries: [string, (bin: string) => string[]][] = [
    ['gnome-terminal', () => [`--working-directory=${cwd}`, '--', ...argv]],
    ['kgx', () => [`--working-directory=${cwd}`, '-e', ...argv]],
    ['konsole', () => ['--workdir', cwd, '-e', ...argv]],
    ['xfce4-terminal', () => [`--working-directory=${cwd}`, '-x', ...argv]],
    ['kitty', () => ['--directory', cwd, ...argv]],
    ['alacritty', () => ['--working-directory', cwd, '-e', ...argv]],
    ['x-terminal-emulator', () => ['-e', ...argv]],
    ['xterm', () => ['-e', ...argv]],
  ]
  for (const [name, args] of tries) {
    const bin = find(name)
    if (!bin) continue
    spawn(bin, args(bin), { cwd, detached: true, stdio: 'ignore' }).unref()
    return true
  }
  return false
}
