import { execFile } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AGENCY_CREDIT,
  AGENCY_TARBALL,
  AGENCY_URL,
  NOT_DIVISIONS,
  asClaudeAgent,
  divisionsOf,
  fromAgency,
  parseAgent,
  parseDivisions,
  searchAgents,
  startDraft,
  type AgencyAgent,
  type AgencyView,
} from '@shared/agency'

export type AgencyDeps = {
  /** The island's own folder for the catalog. */
  dir: string
  /** Claude Code's agents folder (~/.claude/agents). */
  claudeAgents: () => string
  /** Where to download from (a tarball address, or a folder for tests). */
  source?: string
  /** Open a terminal running a command in a folder. */
  openTerminal: (cwd: string, argv: string[]) => boolean
  claudeBinary: () => string | null
  home: string
  fetch?: typeof fetch
  onChange?: () => void
}

const untar = (file: string, into: string): Promise<void> =>
  new Promise((resolve, reject) =>
    execFile('tar', ['-xzf', file, '-C', into, '--strip-components=1', '--no-same-owner'], { timeout: 120_000 }, (e, _o, err) => (e ? reject(new Error(String(err || e.message).trim().split('\n')[0] || 'Couldn’t unpack it.')) : resolve())),
  )

/**
 * The Agency on this computer: downloaded when you ask (and again with
 * Update), indexed for browsing and search, any agent started in Claude or
 * a terminal, or installed into Claude Code as a subagent.
 */
export class Agency {
  private agents: AgencyAgent[] = []
  private divisions: Map<string, { label: string; color: string }> = new Map()
  private updated: number | null = null
  private busy: 'download' | null = null
  private error: string | null = null

  constructor(private d: AgencyDeps) {
    try {
      const raw = JSON.parse(readFileSync(join(d.dir, 'index.json'), 'utf8'))
      if (Array.isArray(raw.agents) && existsSync(this.catalog())) {
        this.agents = raw.agents
        this.updated = typeof raw.updated === 'number' ? raw.updated : null
        this.divisions = parseDivisions({ divisions: raw.divisions })
      }
    } catch {
      // not downloaded yet
    }
  }

  private catalog(): string {
    return join(this.d.dir, 'catalog')
  }

  view(): AgencyView {
    return {
      have: this.agents.length > 0,
      updated: this.updated,
      busy: this.busy,
      error: this.error,
      count: this.agents.length,
      divisions: divisionsOf(this.agents, this.divisions),
      installed: this.installed(),
      credit: AGENCY_CREDIT,
      url: AGENCY_URL,
    }
  }

  /** Download (or update) the catalog. */
  async download(): Promise<AgencyView> {
    if (this.busy) return this.view()
    this.busy = 'download'
    this.error = null
    this.d.onChange?.()
    const next = join(this.d.dir, 'next')
    try {
      rmSync(next, { recursive: true, force: true })
      mkdirSync(next, { recursive: true })
      const src = this.d.source || process.env.DI_AGENCY_URL || AGENCY_TARBALL
      if (!/^https:\/\//.test(src) && existsSync(src) && statSync(src).isDirectory()) cpSync(src, next, { recursive: true })
      else {
        const r = await (this.d.fetch ?? fetch)(src, { signal: AbortSignal.timeout(120_000) })
        if (!r.ok) throw new Error(`GitHub answered ${r.status}.`)
        const tgz = join(this.d.dir, 'agency.tar.gz')
        writeFileSync(tgz, Buffer.from(await r.arrayBuffer()))
        await untar(tgz, next)
        unlinkSync(tgz)
      }
      const found = this.index(next)
      if (!found.length) throw new Error('There were no agents in it.')
      // Swap in the new catalog whole.
      rmSync(this.catalog(), { recursive: true, force: true })
      renameSync(next, this.catalog())
      this.agents = found
      this.updated = Date.now()
      writeFileSync(join(this.d.dir, 'index.json'), JSON.stringify({ updated: this.updated, agents: this.agents, divisions: Object.fromEntries(this.divisions) }))
    } catch (e) {
      rmSync(next, { recursive: true, force: true })
      this.error = /fetch failed|ENOTFOUND|EAI_AGAIN|timeout|aborted/i.test(String((e as Error).message)) ? 'Couldn’t reach GitHub. Try again when you’re online.' : (e as Error).message
    } finally {
      this.busy = null
      this.d.onChange?.()
    }
    return this.view()
  }

  /** Every agent in a catalog folder (divisions and their sub-folders, two deep). */
  private index(root: string): AgencyAgent[] {
    try {
      this.divisions = parseDivisions(JSON.parse(readFileSync(join(root, 'divisions.json'), 'utf8')))
    } catch {
      this.divisions = new Map()
    }
    const out: AgencyAgent[] = []
    const seen = new Set<string>()
    const walk = (dir: string, rel: string, depth: number) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        if (f.name.startsWith('.')) continue
        const r = rel ? `${rel}/${f.name}` : f.name
        if (f.isDirectory()) {
          if (depth === 0 && NOT_DIVISIONS.has(f.name)) continue
          if (depth < 2) walk(join(dir, f.name), r, depth + 1)
        } else if (depth > 0 && f.name.endsWith('.md') && !/^readme/i.test(f.name)) {
          const a = parseAgent(readFileSync(join(dir, f.name), 'utf8'), r)
          if (!a || seen.has(a.slug)) continue
          seen.add(a.slug)
          const { body: _b, ...meta } = a
          out.push(meta)
        }
      }
    }
    walk(root, '', 0)
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  search(q: string, division = ''): AgencyAgent[] {
    return searchAgents(this.agents, q.slice(0, 100), division)
  }

  /** One agent, with the start of its instructions. */
  agent(id: string): (AgencyAgent & { body: string; installed: boolean }) | null {
    const a = this.full(id)
    return a ? { ...a, body: a.body.slice(0, 6000), installed: this.installed().includes(a.slug) } : null
  }

  private full(id: string): (AgencyAgent & { body: string }) | null {
    const meta = this.agents.find((x) => x.id === id)
    if (!meta) return null
    try {
      return parseAgent(readFileSync(join(this.catalog(), `${meta.id}.md`), 'utf8'), meta.id)
    } catch {
      return null
    }
  }

  /** The Agency's agents installed in Claude Code. */
  installed(): string[] {
    try {
      return readdirSync(this.d.claudeAgents())
        .filter((f) => f.endsWith('.md'))
        .filter((f) => {
          try {
            return fromAgency(readFileSync(join(this.d.claudeAgents(), f), 'utf8'))
          } catch {
            return false
          }
        })
        .map((f) => f.slice(0, -3))
    } catch {
      return []
    }
  }

  /** Into Claude Code (~/.claude/agents), never over an agent of yours. */
  install(id: string): AgencyAgent {
    const a = this.full(id)
    if (!a) throw new Error('That agent isn’t in the catalog.')
    const dir = this.d.claudeAgents()
    const file = join(dir, `${a.slug}.md`)
    if (existsSync(file) && !fromAgency(readFileSync(file, 'utf8'))) throw new Error(`You already have an agent called ${a.slug} in Claude Code; it’s left as it is.`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, asClaudeAgent(a))
    this.d.onChange?.()
    return a
  }

  uninstall(slug: string): void {
    if (!/^[a-z0-9-]{1,100}$/.test(slug)) throw new Error('That isn’t an agent’s name.')
    const file = join(this.d.claudeAgents(), `${slug}.md`)
    if (!existsSync(file)) return
    if (!fromAgency(readFileSync(file, 'utf8'))) throw new Error('That agent wasn’t installed from The Agency; it’s left as it is.')
    unlinkSync(file)
    this.d.onChange?.()
  }

  /** Start it: in Claude (installed, with a draft to finish), or in a terminal of its own. */
  start(id: string, where: 'claude' | 'terminal'): { draft?: string; opened?: boolean } {
    const a = this.full(id)
    if (!a) throw new Error('That agent isn’t in the catalog.')
    if (where === 'claude') {
      this.install(id)
      return { draft: startDraft(a) }
    }
    const claude = this.d.claudeBinary()
    if (!claude) throw new Error('Claude Code isn’t installed here, so there’s nothing to run it in.')
    // A small launcher: Claude Code with the agent's instructions added to its own.
    const runDir = join(this.d.dir, 'run')
    mkdirSync(runDir, { recursive: true })
    const prompt = join(runDir, `${a.slug}.md`)
    writeFileSync(prompt, a.body)
    const script = join(runDir, `${a.slug}.sh`)
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
    writeFileSync(script, `#!/bin/sh\n# ${a.name}, from ${AGENCY_CREDIT}\nexec ${q(claude)} --append-system-prompt "$(cat ${q(prompt)})"\n`)
    chmodSync(script, 0o755)
    const opened = this.d.openTerminal(this.d.home, [script])
    if (!opened) throw new Error('No terminal app was found to open it in.')
    return { opened }
  }
}
