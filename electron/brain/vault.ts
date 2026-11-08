import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { FOLDERS, LEDGERS, ME_FILES, RESTRICTED, SYSTEM, dateOf, isRestricted } from '@shared/brain'
import { AGENTS_MD, GITIGNORE, INDEX_MD, LOG_MD, PREDICTIONS_MD, PROMISES_MD, RESTRICTED_README, VAULT_CLAUDE_MD, meTemplate } from './templates'

/** Folders under _system the island keeps to itself. */
const MACHINERY = new Set([`${SYSTEM}/index`, `${SYSTEM}/queue`])

/** A Markdown file of the vault, as listed. */
export type VaultFile = { path: string; mtime: number; size: number }

/**
 * The brain's folder on disk. The island writes through this so every change
 * is logged and kept in the vault's own git history. Paths are relative to
 * the vault, with forward slashes. Callers that take paths from an AI check
 * them first (safeVaultPath); this class only keeps writes inside the folder.
 */
export class Vault {
  private pending: string[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(
    readonly root: string,
    private readonly o: { git?: boolean; commitDelayMs?: number; onChange?: (why: string) => void } = {},
  ) {}

  exists(): boolean {
    return existsSync(join(this.root, SYSTEM)) && existsSync(join(this.root, '00-me'))
  }

  /** Make the folders and starting files that are missing (never overwrites). */
  create(now = Date.now()): string[] {
    const made: string[] = []
    mkdirSync(this.root, { recursive: true })
    for (const f of FOLDERS) mkdirSync(join(this.root, f.dir), { recursive: true })
    const date = dateOf(now)
    const files: [string, string][] = [
      ['AGENTS.md', AGENTS_MD],
      ['CLAUDE.md', VAULT_CLAUDE_MD],
      [`${SYSTEM}/index.md`, INDEX_MD],
      [`${SYSTEM}/log.md`, LOG_MD],
      [`${LEDGERS}/promises.md`, PROMISES_MD],
      [`${LEDGERS}/predictions.md`, PREDICTIONS_MD],
      [`${RESTRICTED}/README.md`, RESTRICTED_README],
      ['.gitignore', GITIGNORE],
      ...ME_FILES.map((m): [string, string] => [`00-me/${m.file}`, meTemplate(m.file, date)]),
    ]
    for (const [rel, text] of files) {
      const abs = join(this.root, rel)
      if (existsSync(abs)) continue
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, text)
      made.push(rel)
    }
    for (const d of ['07-world-model/people', '07-world-model/orgs', '07-world-model/products', '07-world-model/decisions', '09-sources/claude-code']) {
      mkdirSync(join(this.root, d), { recursive: true })
    }
    if (this.o.git !== false) void this.gitInit().then(() => this.commit('A new brain'))
    return made
  }

  /** The absolute path of a vault path (for the island's own use). */
  abs(rel: string): string {
    return join(this.root, ...rel.split('/'))
  }

  /** Does the file really live in the vault (no symlink out of it)? */
  inside(rel: string): boolean {
    try {
      const real = realpathSync(this.abs(rel))
      const root = realpathSync(this.root)
      return real === root || real.startsWith(root + sep)
    } catch {
      return false
    }
  }

  has(rel: string): boolean {
    return existsSync(this.abs(rel))
  }

  read(rel: string): string | null {
    try {
      return readFileSync(this.abs(rel), 'utf8')
    } catch {
      return null
    }
  }

  /** Write a file (creating its folder), atomically. */
  write(rel: string, text: string, why: string): void {
    const abs = this.abs(rel)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp-${process.pid}`
    writeFileSync(tmp, text)
    renameSync(tmp, abs)
    this.changed(why)
  }

  /** Write a new file; if the name is taken, "name-2.md", "name-3.md"… Returns the path used. */
  writeNew(rel: string, text: string, why: string): string {
    const free = this.freeName(rel)
    this.write(free, text, why)
    return free
  }

  freeName(rel: string): string {
    if (!this.has(rel)) return rel
    const base = rel.replace(/\.md$/i, '')
    for (let i = 2; i < 1000; i++) if (!this.has(`${base}-${i}.md`)) return `${base}-${i}.md`
    return `${base}-${Date.now()}.md`
  }

  /** Add a line to the end of a file (creating it). */
  append(rel: string, line: string, why: string): void {
    const abs = this.abs(rel)
    mkdirSync(dirname(abs), { recursive: true })
    let lead = ''
    try {
      const cur = readFileSync(abs, 'utf8')
      if (cur && !cur.endsWith('\n')) lead = '\n'
    } catch {
      // a new file
    }
    appendFileSync(abs, `${lead}${line.replace(/\n+$/, '')}\n`)
    this.changed(why)
  }

  /** Move a note (never overwriting). Returns where it went. */
  move(from: string, to: string, why: string): string {
    const dest = this.freeName(to)
    mkdirSync(dirname(this.abs(dest)), { recursive: true })
    renameSync(this.abs(from), this.abs(dest))
    this.changed(why)
    return dest
  }

  /** One line in _system/log.md. */
  log(text: string, now = Date.now()): void {
    const d = new Date(now)
    const at = `${dateOf(now)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    try {
      this.append(`${SYSTEM}/log.md`, `- ${at} · ${text}`, text)
    } catch {
      // the log is best effort
    }
  }

  /** The last lines of the log, newest first. */
  recentLog(n = 8): string[] {
    const text = this.read(`${SYSTEM}/log.md`) ?? ''
    return text
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .slice(-n)
      .reverse()
      .map((l) => l.slice(2))
  }

  /**
   * Every Markdown note, skipping Restricted, hidden folders and the island's
   * machinery. `under` limits it to one folder.
   */
  list(under = ''): VaultFile[] {
    const out: VaultFile[] = []
    const walk = (rel: string, depth: number) => {
      if (depth > 12) return
      let names: string[]
      try {
        names = readdirSync(rel ? this.abs(rel) : this.root)
      } catch {
        return
      }
      for (const name of names) {
        if (name.startsWith('.')) continue
        const child = rel ? `${rel}/${name}` : name
        if (isRestricted(child) || MACHINERY.has(child)) continue
        let st
        try {
          st = statSync(this.abs(child))
        } catch {
          continue
        }
        if (st.isDirectory()) walk(child, depth + 1)
        else if (st.isFile() && name.toLowerCase().endsWith('.md')) out.push({ path: child, mtime: st.mtimeMs, size: st.size })
      }
    }
    walk(under.replace(/\/+$/, ''), 0)
    return out
  }

  private changed(why: string): void {
    this.o.onChange?.(why)
    if (this.o.git === false) return
    this.pending.push(why)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const msgs = [...new Set(this.pending.splice(0))]
      void this.commit(msgs.length === 1 ? msgs[0] : `${msgs[0]} (and ${msgs.length - 1} more)`)
    }, this.o.commitDelayMs ?? 3000)
    this.timer.unref?.()
  }

  /** Commit what changed now (tests and quitting). */
  async flush(): Promise<void> {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    const msgs = [...new Set(this.pending.splice(0))]
    if (msgs.length) await this.commit(msgs[0])
  }

  private git(args: string[]): Promise<boolean> {
    // The vault's history is local; it doesn't need your git identity.
    const id = ['-c', 'user.name=Dynamic Island', '-c', 'user.email=island@localhost', '-c', 'commit.gpgsign=false']
    return new Promise((resolve) => execFile('git', ['-C', this.root, ...id, ...args], { timeout: 15_000 }, (err) => resolve(!err)))
  }

  private async gitInit(): Promise<void> {
    if (!existsSync(join(this.root, '.git'))) await this.git(['init', '-q'])
  }

  private async commit(message: string): Promise<void> {
    if (!existsSync(join(this.root, '.git'))) return
    if (await this.git(['add', '-A'])) await this.git(['commit', '-q', '-m', message.slice(0, 200)])
  }
}

/** A path under the vault as a vault path (forward slashes), or null when outside. Pure. */
export function vaultRelative(root: string, abs: string): string | null {
  const r = relative(root, abs)
  // (On Windows another drive is an absolute path, not a relative one.)
  if (!r || r.startsWith('..') || isAbsolute(r)) return null
  return r.split(sep).join('/')
}
