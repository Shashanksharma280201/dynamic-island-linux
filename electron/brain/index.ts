import { MeaningIndex, type Embedder } from './meaning'
import type { MeaningView } from '@shared/meaning'
import { Loop } from './loop'
import { runGit } from './mine'
import type { MorningCard } from '@shared/loop'
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import {
  ARCHIVES,
  INBOX,
  ME_FILES,
  SYSTEM,
  formatNote,
  noteTitle,
  parseNote,
  projectPaths,
  safeVaultPath,
  type BrainConfig,
  type BrainView,
  type InboxItem,
  type MeFile,
  type ToolId,
  dateOf,
  sourceName,
} from '@shared/brain'
import { IslandMcp } from '../agent/mcpServer'
import type { AgentTool } from '../agent/tools'
import { BrainIndex } from './search'
import { buildBrief, filledIn, projectNames, projectSummary } from './brief'
import { SessionCapture, QUEUE } from './capture'
import { mineHistory } from './mine'
import { INTERVIEW_PROMPT } from './templates'
import { brainTools, forMcp } from './tools'
import { Vault } from './vault'
import { Wiring, openTerminal } from './wire'

export type BrainDeps = {
  config: () => BrainConfig
  setConfig: (patch: Partial<BrainConfig>) => void
  home: string
  userData: string
  claudeDir: string
  claudeJson: string
  codexDir: string
  geminiDir: string
  /** ~/.claude/projects: Claude Code's transcripts. */
  projectsDir: string
  claudeBinary: () => string | null
  /** The command Claude Code runs for the brain's hook, for a vault. */
  hookCommand: (vault: string) => string
  /** The AI that writes session notes (your island AI, or Claude Code), or null. */
  writer: () => { label: string; ask: (prompt: string, purpose?: string) => Promise<string> } | null
  /** The morning card changed (the island shows it). */
  onCard?: (c: MorningCard | null) => void
  /** The model for search by meaning, when it's on and ready; and how it's doing. */
  embed?: () => Embedder | null
  meaningModel?: () => Omit<MeaningView, 'on' | 'notes'>
  /** Search by meaning was turned on: fetch the model if it isn't here. */
  onMeaning?: () => void
  findExecutable: (name: string) => string | null
  openPath: (path: string) => void
  openUrl: (url: string) => void
  onChange: () => void
  /** Folders the island's own Claude runs work in (never captured). */
  ownFolders?: string[]
  now?: () => number
}

const MCP_INSTRUCTIONS =
  'The user’s second brain: plain notes on their computer (who they are, their projects, people, decisions and past sessions). Read the brief first, search before asking them something the brain may know, and capture what you learn into the inbox. The private 08-restricted folder is never available.'

/**
 * The second brain: its vault, the brief every AI loads, the tools other apps
 * reach over MCP, session notes, mining and the inbox. Turned on from
 * Settings → Brain; off, it costs nothing.
 */
export class Brain {
  private vaultObj: Vault | null = null
  private index: BrainIndex | null = null
  private capture: SessionCapture | null = null
  private loop: Loop | null = null
  private meaningIdx: MeaningIndex | null = null
  private mcp: IslandMcp | null = null
  private watchers: FSWatcher[] = []
  private timers: NodeJS.Timeout[] = []
  private soon = new Map<string, NodeJS.Timeout>()
  private briefText = ''
  private busy: string | null = null
  readonly wiring: Wiring

  constructor(private readonly d: BrainDeps) {
    this.wiring = new Wiring({
      home: d.home,
      claudeDir: d.claudeDir,
      claudeJson: d.claudeJson,
      codexDir: d.codexDir,
      geminiDir: d.geminiDir,
      vault: () => this.path(),
      claudeBinary: d.claudeBinary,
      hookCommand: () => d.hookCommand(this.path()),
      mcp: () => {
        const url = this.mcp?.url()
        return url ? { url, authorization: this.mcp!.authorization() } : null
      },
      brief: () => this.brief(),
    })
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  /** The vault folder (made or not). */
  path(): string {
    return this.d.config().vault || join(this.d.home, 'Brain')
  }

  /** The vault, when it exists. */
  vault(): Vault | null {
    if (this.vaultObj?.root !== this.path()) this.vaultObj = new Vault(this.path(), { onChange: () => this.changedSoon() })
    return this.vaultObj.exists() ? this.vaultObj : null
  }

  running(): boolean {
    return !!this.capture
  }

  async start(): Promise<void> {
    if (this.running() || !this.d.config().on) return
    const vault = this.vault()
    if (!vault) return
    this.index = new BrainIndex(
      () => vault.list(),
      (p) => vault.read(p),
    )
    await this.startMcp()
    this.writeBrief()
    this.capture = new SessionCapture({
      vault,
      projectsDir: this.d.projectsDir,
      skip: () => [...this.d.config().skip, ...(this.d.ownFolders ?? [])],
      ask: () => {
        if (this.d.config().distil !== 'ai') return null
        return this.d.writer()?.ask ?? null
      },
      hasGit: (dir) => existsSync(join(dir, '.git')),
      since: () => this.d.config().since,
      now: this.d.now,
      onFiled: () => this.changedSoon(),
      enabled: () => this.d.config().captureSessions,
    })
    mkdirSync(vault.abs(QUEUE), { recursive: true })
    this.watch(vault.abs(QUEUE), () => this.later('queue', 1500, () => void this.capture?.processQueue()))
    this.watch(vault.abs('00-me'), () => this.later('brief', 1500, () => this.writeBrief()))
    const every = (ms: number, f: () => void) => {
      const t = setInterval(f, ms)
      t.unref?.()
      this.timers.push(t)
    }
    // Sessions that ended without saying so, and a brief that follows your projects.
    const first = setTimeout(() => void this.sweep(), 2 * 60_000)
    first.unref?.()
    this.timers.push(first)
    every(30 * 60_000, () => void this.sweep())
    every(10 * 60_000, () => this.writeBrief())
    // The search index lets go of its memory when no one has searched for a while.
    every(5 * 60_000, () => this.index?.releaseIfIdle(10 * 60_000))
    void this.capture.processQueue().then((f) => f.length && this.changedSoon())
    // The loop: commits, the evening filing, the signals and the morning card.
    this.loop = new Loop({
      vault: () => this.vaultObj,
      writer: () => (this.d.config().distil === 'ai' ? this.d.writer() : null),
      git: runGit,
      brief: () => this.brief(),
      onCard: (c) => this.d.onCard?.(c),
      onChange: () => this.changedSoon(),
      now: this.d.now,
    })
    this.loop.start()
    // Search by meaning: read new and changed notes a few at a time.
    this.meaningIdx = new MeaningIndex(vault.abs('_system/index/meaning'))
    every(2 * 60_000, () => void this.readForMeaning())
    setTimeout(() => void this.readForMeaning(), 15_000).unref?.()
    this.d.onChange()
  }

  /** Bring the meaning index up to date (when it's on and the model is ready). */
  async readForMeaning(max = 64): Promise<number> {
    const embed = this.d.config().meaning ? this.d.embed?.() : null
    if (!embed || !this.index || !this.meaningIdx) return 0
    const n = await this.meaningIdx.update(this.index.entries(), embed, max).catch((e) => {
      console.error('[brain] meaning:', (e as Error).message)
      return 0
    })
    if (n) this.changedSoon()
    return n
  }

  /** The loop, when the brain is on. */
  jobs(): Loop | null {
    return this.loop
  }

  stop(): void {
    for (const w of this.watchers.splice(0)) w.close()
    for (const t of this.timers.splice(0)) clearInterval(t)
    for (const t of this.soon.values()) clearTimeout(t)
    this.soon.clear()
    this.mcp?.stop()
    this.mcp = null
    this.loop?.stop()
    this.loop = null
    this.meaningIdx = null
    this.capture = null
    this.index = null
    void this.vaultObj?.flush()
  }

  private async startMcp(): Promise<void> {
    const cfg = this.d.config()
    this.mcp = new IslandMcp({ name: 'brain', port: cfg.port, token: this.token(), instructions: MCP_INSTRUCTIONS })
    this.mcp.serve((client) => forMcp(this.tools(client || 'ai')))
    try {
      await this.mcp.start()
    } catch (e) {
      console.error('[brain] tools for other apps:', e instanceof Error ? e.message : e)
      this.mcp = null
      return
    }
    const port = Number(new URL(this.mcp.url()!).port)
    if (port !== cfg.port) {
      // The usual port was taken: tell Claude Code the new address.
      this.d.setConfig({ port })
      if (this.wiring.mcpKnown()) void this.wiring.registerMcp().catch(() => {})
    }
  }

  /** A lasting token for the brain's tools (other apps keep it in their config). */
  private token(): string {
    const file = join(this.d.userData, 'brain-token')
    try {
      const t = readFileSync(file, 'utf8').trim()
      if (/^[a-f0-9]{48}$/.test(t)) return t
    } catch {
      // first time
    }
    const t = randomBytes(24).toString('hex')
    mkdirSync(this.d.userData, { recursive: true })
    writeFileSync(file, t, { mode: 0o600 })
    return t
  }

  private watch(dir: string, f: () => void): void {
    try {
      const w = watch(dir, f)
      w.on('error', () => {})
      this.watchers.push(w)
    } catch {
      // the timers still catch up
    }
  }

  private later(key: string, ms: number, f: () => void): void {
    const old = this.soon.get(key)
    if (old) clearTimeout(old)
    const t = setTimeout(() => {
      this.soon.delete(key)
      f()
    }, ms)
    t.unref?.()
    this.soon.set(key, t)
  }

  private changedSoon(): void {
    this.later('change', 400, () => this.d.onChange())
  }

  private async sweep(): Promise<void> {
    if (!this.d.config().captureSessions) return
    const filed = await this.capture?.sweep().catch(() => [])
    if (filed?.length) this.changedSoon()
  }

  // ------------------------------------------------------------ the brief ----

  /** The brief's text (what every AI loads about you). */
  brief(): string {
    if (!this.briefText) this.briefText = this.vault()?.read(`${SYSTEM}/brief.md`) ?? ''
    return this.briefText
  }

  /** Rebuild _system/brief.md from 00-me and the projects; tell Codex and Gemini when it changed. */
  writeBrief(): void {
    const vault = this.vault()
    if (!vault) return
    const listed = vault.list('02-projects')
    const files = listed.map((f) => f.path)
    const recent = new Map<string, number>()
    for (const f of listed) recent.set(f.path.split('/')[1], Math.max(recent.get(f.path.split('/')[1]) ?? 0, f.mtime))
    const projects = projectNames(files)
      .map((name) => {
        const page = vault.read(projectPaths(name).page) ?? ''
        const { meta } = parseNote(page)
        return { name, summary: projectSummary(page), done: /^(done|archived|paused)$/i.test(String(meta.status ?? '')), at: recent.get(name) ?? 0 }
      })
      .filter((p) => !p.done)
      .sort((a, b) => b.at - a.at)
    const label = this.path().startsWith(this.d.home + '/') ? `~/${this.path().slice(this.d.home.length + 1)}` : this.path()
    const text = buildBrief((rel) => vault.read(rel), projects, label)
    this.briefText = text
    if (vault.read(`${SYSTEM}/brief.md`) === text) return
    vault.write(`${SYSTEM}/brief.md`, text, 'Updated the brief')
    this.wiring.refreshInline()
  }

  /** The brief for the island's own assistant ('' when the brain is off). */
  briefForAgent(): string {
    return this.running() ? this.brief() : ''
  }

  /** The brain's tools, written as `source` (for the island's assistant: 'island'). */
  tools(source = 'island'): AgentTool[] {
    const vault = this.vault()
    if (!vault || !this.index || !this.running()) return []
    const meaning = this.meaningIdx
    return brainTools({
      vault,
      index: this.index,
      brief: () => this.brief(),
      source,
      now: this.d.now,
      meaning: async (q, under) => {
        const embed = this.d.config().meaning ? this.d.embed?.() : null
        return embed && meaning ? meaning.query(q, embed, 30, under) : []
      },
    })
  }

  // ---------------------------------------------------------------- view ----

  view(): BrainView {
    const cfg = this.d.config()
    const vault = this.vault()
    const writer = cfg.distil === 'ai' ? this.d.writer() : null
    const view: BrainView = {
      on: cfg.on,
      vault: this.path(),
      vaultLabel: this.path().startsWith(this.d.home + '/') ? `~/${this.path().slice(this.d.home.length + 1)}` : this.path(),
      exists: !!vault,
      captureSessions: cfg.captureSessions,
      distil: cfg.distil,
      distiller: writer?.label ?? null,
      skip: cfg.skip,
      notes: 0,
      inbox: [],
      mcp: { url: this.mcp?.url() ?? null, error: cfg.on && vault && !this.mcp ? `Port ${cfg.port} and the next ones are taken.` : null },
      tools: this.wiring.status(),
      me: ME_FILES.map((m) => ({ file: m.file, title: m.title, empty: true })),
      log: [],
      busy: this.busy,
      obsidian: !!this.obsidian(),
      loop: this.loop?.view() ?? null,
      meaning: {
        on: this.d.config().meaning,
        notes: this.meaningIdx?.size() ?? 0,
        ...(this.d.meaningModel?.() ?? { ready: false, downloading: false, progress: 0, error: null, sizeMb: 23 }),
      },
    }
    if (!vault) return view
    view.notes = vault.list().length
    view.inbox = this.inbox(vault)
    view.me = ME_FILES.map((m) => ({ file: m.file, title: m.title, empty: !filledIn(vault.read(`00-me/${m.file}`) ?? '') }))
    view.log = vault.recentLog(6)
    return view
  }

  private inbox(vault: Vault): InboxItem[] {
    return vault
      .list(INBOX)
      .sort((a, b) => b.path.localeCompare(a.path))
      .slice(0, 60)
      .map((f) => {
        const { meta, body } = parseNote(vault.read(f.path) ?? '')
        return {
          path: f.path,
          title: noteTitle(f.path, body),
          type: typeof meta.type === 'string' ? meta.type : 'note',
          suggested: typeof meta.suggested === 'string' ? meta.suggested : '',
          date: typeof meta.date === 'string' ? meta.date : dateOf(f.mtime),
        }
      })
  }

  // ------------------------------------------------------------- actions ----

  /** Make the vault (if needed) and turn the brain on. An error to show, or null. */
  async create(folder?: string): Promise<string | null> {
    const path = (folder ?? this.path()).replace(/\/+$/, '')
    if (!path.startsWith('/')) return 'Pick a folder.'
    if (/\s/.test(path)) return 'Pick a folder without spaces in its path: AI tools read the brief by its path, and spaces break that.'
    this.stop()
    this.d.setConfig({ vault: path === join(this.d.home, 'Brain') ? '' : path, on: true, since: this.d.config().since || this.now() })
    const vault = new Vault(path, { onChange: () => this.changedSoon() })
    try {
      vault.create(this.now())
    } catch (e) {
      return `Couldn’t make the brain in ${path}: ${e instanceof Error ? e.message : e}`
    }
    this.vaultObj = vault
    vault.log('made the brain')
    await this.start()
    // Tools connected to a vault elsewhere now point here.
    for (const t of this.wiring.status()) if (t.connected) await this.wiring.connect(t.id)
    this.d.onChange()
    return null
  }

  async setOn(on: boolean): Promise<void> {
    this.d.setConfig({ on })
    if (on) await this.start()
    else this.stop()
    this.d.onChange()
  }

  setOptions(patch: Partial<Pick<BrainConfig, 'captureSessions' | 'distil' | 'skip' | 'meaning'>>): void {
    const next: Partial<BrainConfig> = {}
    if (typeof patch.captureSessions === 'boolean') next.captureSessions = patch.captureSessions
    if (patch.distil === 'ai' || patch.distil === 'plain') next.distil = patch.distil
    if (Array.isArray(patch.skip)) next.skip = [...new Set(patch.skip.filter((s) => typeof s === 'string' && s.startsWith('/')))].slice(0, 50)
    if (typeof patch.meaning === 'boolean') next.meaning = patch.meaning
    this.d.setConfig(next)
    // On: the model downloads (once), then the notes are read.
    if (next.meaning) this.d.onMeaning?.()
    this.d.onChange()
  }

  async connect(id: ToolId, on: boolean): Promise<string | null> {
    if (on && !this.running()) return 'Turn the brain on first.'
    this.writeBrief()
    const problem = on ? await this.wiring.connect(id) : await this.wiring.disconnect(id)
    this.vault()?.log(`${on ? 'connected' : 'disconnected'} ${id === 'claude-code' ? sourceName(id) : id === 'codex' ? 'Codex CLI' : 'Gemini CLI'}`)
    this.d.onChange()
    return problem
  }

  /** Undo every connection (uninstalling the island). The vault stays. */
  async disconnectAll(): Promise<void> {
    for (const t of this.wiring.status()) if (t.parts.some((p) => p.done)) await this.wiring.disconnect(t.id).catch(() => null)
  }

  /** Draft project pages from your Claude Code history. A sentence saying what it did. */
  async mine(): Promise<string> {
    const vault = this.vault()
    if (!vault) return 'Make the brain first.'
    if (this.busy) return 'Already busy.'
    const progress = (t: string) => {
      this.busy = t
      this.changedSoon()
    }
    progress('Reading your Claude Code history…')
    try {
      const r = await mineHistory({
        vault,
        projectsDir: this.d.projectsDir,
        hasGit: (dir) => existsSync(join(dir, '.git')),
        skip: [...this.d.config().skip, ...(this.d.ownFolders ?? [])],
        now: this.now(),
        onProgress: progress,
      })
      if (!r.sessions) return 'No Claude Code sessions were found on this computer.'
      const drafted = r.drafts.length ? `Drafted ${r.drafts.length} project page${r.drafts.length === 1 ? '' : 's'} in the inbox` : 'No new projects to draft'
      return `${drafted} from ${r.sessions} session${r.sessions === 1 ? '' : 's'} in ${r.projects} project${r.projects === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already had one)` : ''}.`
    } finally {
      this.busy = null
      this.d.onChange()
    }
  }

  /** File an inbox note where it suggests. An error to show, or null. */
  keep(path: string): string | null {
    const vault = this.vault()
    if (!vault) return 'Make the brain first.'
    const ok = safeVaultPath(path)
    if ('error' in ok || !ok.path.startsWith(`${INBOX}/`) || !vault.has(ok.path)) return 'That note isn’t in the inbox any more.'
    const { meta, body } = parseNote(vault.read(ok.path) ?? '')
    const suggested = typeof meta.suggested === 'string' ? meta.suggested : ''
    // A session note drops its "session-" once it's in the project's sessions folder.
    const name = ok.path.split('/').pop()!.replace(/^(\d{4}-\d{2}-\d{2})-session-/, '$1-')
    const target = suggested.endsWith('/') ? `${suggested}${name}` : suggested
    const dest = safeVaultPath(target)
    if (!suggested || 'error' in dest || dest.path.startsWith(`${INBOX}/`)) return 'This note has no place to go yet: open it and move it where it belongs.'
    delete meta.suggested
    const where = vault.move(ok.path, dest.path, `Kept “${noteTitle(ok.path, body)}”`)
    vault.write(where, formatNote(meta, body, ['summary']), `Kept “${noteTitle(ok.path, body)}”`)
    vault.log(`kept [[${where.replace(/\.md$/, '')}|${noteTitle(where, body)}]]`)
    // A kept project takes its waiting session notes with it.
    if (meta.type === 'project') {
      const project = where.split('/')[1]
      for (const f of vault.list(INBOX)) {
        if (f.path.includes(`-session-${project}-`)) {
          const n = parseNote(vault.read(f.path) ?? '')
          delete n.meta.suggested
          const moved = vault.move(f.path, `${projectPaths(project).sessions}/${f.path.split('/').pop()!.replace(`-session-${project}-`, `-${project}-`)}`, `Filed a session of ${project}`)
          vault.write(moved, formatNote(n.meta, n.body), `Filed a session of ${project}`)
        }
      }
    }
    this.writeBrief()
    this.d.onChange()
    return null
  }

  /** Keep every inbox note that knows where it goes. */
  keepAll(): number {
    const vault = this.vault()
    if (!vault) return 0
    let n = 0
    for (const item of this.inbox(vault)) if (item.suggested && vault.has(item.path) && !this.keep(item.path)) n++
    return n
  }

  /** Move an inbox note to the archives (never deleted). */
  archive(path: string): string | null {
    const vault = this.vault()
    if (!vault) return 'Make the brain first.'
    const ok = safeVaultPath(path)
    if ('error' in ok || !ok.path.startsWith(`${INBOX}/`) || !vault.has(ok.path)) return 'That note isn’t in the inbox any more.'
    vault.move(ok.path, `${ARCHIVES}/inbox/${ok.path.split('/').pop()}`, 'Archived an inbox note')
    this.d.onChange()
    return null
  }

  private obsidian(): string | null {
    return this.d.findExecutable('obsidian') ?? this.d.findExecutable('md.obsidian.Obsidian')
  }

  /** Open a note (or the vault) in Obsidian when it's installed, else in the file manager. */
  open(path = ''): void {
    let abs = this.path()
    if (path) {
      const ok = safeVaultPath(path)
      const vault = this.vault()
      if ('error' in ok || !vault) return
      abs = vault.abs(ok.path)
    }
    if (this.obsidian()) this.d.openUrl(`obsidian://open?path=${encodeURIComponent(abs)}`)
    else this.d.openPath(abs)
  }

  openFolder(): void {
    this.d.openPath(this.path())
  }

  /** Start the getting-to-know-you interview in a terminal. An error to show, or null. */
  interview(): string | null {
    const vault = this.vault()
    if (!vault) return 'Make the brain first.'
    const bin = this.d.claudeBinary()
    if (!bin) return 'Claude Code wasn’t found. Install it, or fill in the four notes here.'
    return openTerminal(vault.root, [bin, INTERVIEW_PROMPT], this.d.findExecutable) ? null : 'No terminal app was found to run it in.'
  }

  /** A 00-me file's text without its frontmatter. */
  meGet(file: string): string {
    if (!ME_FILES.some((m) => m.file === file)) return ''
    return parseNote(this.vault()?.read(`00-me/${file}`) ?? '').body
  }

  /**
   * Keep a fact about you that you said yes to (from the buddy): a dated line
   * in 00-me/preferences.md, which the brief every AI loads is built from.
   */
  rememberFact(fact: string, by: string): string | null {
    const vault = this.vault()
    if (!vault || !this.running()) return 'Turn on the second brain to keep facts about you.'
    const line = fact.replace(/\s+/g, ' ').trim().slice(0, 300)
    if (!line) return 'Nothing to keep.'
    vault.append('00-me/preferences.md', `- ${dateOf(this.now())}: ${line} (kept from ${by}, with your yes)`, `kept: ${line.slice(0, 60)}`)
    vault.log(`Kept about you: ${line}`)
    this.writeBrief()
    return null
  }

  meSave(file: string, text: string): string | null {
    const vault = this.vault()
    if (!vault) return 'Make the brain first.'
    if (!ME_FILES.some((m) => m.file === file)) return 'Unknown file.'
    if (text.length > 50_000) return 'That is too long for this note.'
    const { meta } = parseNote(vault.read(`00-me/${file}`) ?? '')
    vault.write(`00-me/${file}`, formatNote({ type: 'me', ...meta, updated: dateOf(this.now()) }, text.replace(/\r\n/g, '\n')), `Edited ${file as MeFile}`)
    this.writeBrief()
    this.d.onChange()
    return null
  }
}
