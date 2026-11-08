import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SKILL_MARK, SKILL_NAME, SKILLS_CREDIT, SKILLS_TARBALL, SKILLS_URL, parseSkill, searchSkills, skillDraft, type SkillDetail, type SkillMeta, type SkillsView } from '@shared/skills'
import { untar } from './agency'

export type SkillsDeps = {
  /** The island's own folder for the catalog. */
  dir: string
  /** Claude Code's skills folder (~/.claude/skills). */
  claudeSkills: () => string
  /** Where to download from (a tarball address, or a folder for tests). */
  source?: string
  fetch?: typeof fetch
  onChange?: () => void
}

/** Folders that hold no skills. */
const NOT_SKILLS = new Set(['.git', '.github', 'node_modules', 'template', 'spec'])
/** A skill bigger than this isn't copied (it isn't what a skill is). */
const MAX_FILES = 2000
const MAX_BYTES = 60 * 1024 * 1024

/** Regular files under a folder (never a link: one in a download could point anywhere here). */
function filesIn(dir: string, rel = '', out: string[] = []): string[] {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.name === SKILL_MARK) continue
    const r = rel ? `${rel}/${f.name}` : f.name
    if (f.isDirectory()) filesIn(join(dir, f.name), r, out)
    else if (f.isFile()) out.push(r)
    if (out.length > MAX_FILES) break
  }
  return out
}

/**
 * Agent Skills on this computer: downloaded when you ask (and again with
 * Update), indexed for browsing, and any skill installed into Claude Code,
 * never over a skill of yours.
 */
export class Skills {
  private skills: SkillMeta[] = []
  private updated: number | null = null
  private busy: 'download' | null = null
  private error: string | null = null

  constructor(private d: SkillsDeps) {
    try {
      const raw = JSON.parse(readFileSync(join(d.dir, 'index.json'), 'utf8'))
      if (Array.isArray(raw.skills) && existsSync(this.catalog())) {
        this.skills = raw.skills
        this.updated = typeof raw.updated === 'number' ? raw.updated : null
      }
    } catch {
      // not downloaded yet
    }
  }

  private catalog(): string {
    return join(this.d.dir, 'catalog')
  }

  view(): SkillsView {
    return { have: this.skills.length > 0, updated: this.updated, busy: this.busy, error: this.error, count: this.skills.length, installed: this.installed(), credit: SKILLS_CREDIT, url: SKILLS_URL }
  }

  /** Download (or update) the catalog. */
  async download(): Promise<SkillsView> {
    if (this.busy) return this.view()
    this.busy = 'download'
    this.error = null
    this.d.onChange?.()
    const next = join(this.d.dir, 'next')
    try {
      rmSync(next, { recursive: true, force: true })
      mkdirSync(next, { recursive: true })
      const src = this.d.source || process.env.DI_SKILLS_URL || SKILLS_TARBALL
      if (!/^https:\/\//.test(src) && existsSync(src) && statSync(src).isDirectory()) cpSync(src, next, { recursive: true })
      else {
        const r = await (this.d.fetch ?? fetch)(src, { signal: AbortSignal.timeout(120_000) })
        if (!r.ok) throw new Error(`GitHub answered ${r.status}.`)
        const tgz = join(this.d.dir, 'skills.tar.gz')
        writeFileSync(tgz, Buffer.from(await r.arrayBuffer()))
        await untar(tgz, next)
        unlinkSync(tgz)
      }
      const found = this.index(next)
      if (!found.length) throw new Error('There were no skills in it.')
      rmSync(this.catalog(), { recursive: true, force: true })
      renameSync(next, this.catalog())
      this.skills = found
      this.updated = Date.now()
      writeFileSync(join(this.d.dir, 'index.json'), JSON.stringify({ updated: this.updated, skills: this.skills }))
    } catch (e) {
      rmSync(next, { recursive: true, force: true })
      this.error = /fetch failed|ENOTFOUND|EAI_AGAIN|timeout|aborted/i.test(String((e as Error).message)) ? 'Couldn’t reach GitHub. Try again when you’re online.' : (e as Error).message
    } finally {
      this.busy = null
      this.d.onChange?.()
    }
    return this.view()
  }

  /** Every folder with a SKILL.md, three deep (skills/<name>/SKILL.md in Anthropic's). */
  private index(root: string): SkillMeta[] {
    const out: SkillMeta[] = []
    const seen = new Set<string>()
    const walk = (dir: string, rel: string, depth: number) => {
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      const md = entries.find((f) => f.name === 'SKILL.md' && f.isFile())
      if (md && rel) {
        let licence = ''
        try {
          const l = entries.find((f) => /^licen[sc]e(\.txt|\.md)?$/i.test(f.name) && f.isFile())
          if (l) licence = readFileSync(join(dir, l.name), 'utf8')
        } catch {
          // none
        }
        const s = parseSkill(readFileSync(join(dir, 'SKILL.md'), 'utf8'), rel, licence, filesIn(dir).length)
        if (s && !seen.has(s.name)) {
          seen.add(s.name)
          const { body: _b, ...meta } = s
          out.push(meta)
        }
        return
      }
      if (depth >= 3) return
      for (const f of entries) if (f.isDirectory() && !f.name.startsWith('.') && !NOT_SKILLS.has(f.name)) walk(join(dir, f.name), rel ? `${rel}/${f.name}` : f.name, depth + 1)
    }
    walk(root, '', 0)
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  search(q: string): SkillMeta[] {
    return searchSkills(this.skills, q.slice(0, 100))
  }

  /** One skill, with the start of its instructions. */
  skill(name: string): SkillDetail | null {
    const meta = this.skills.find((s) => s.name === name)
    if (!meta) return null
    try {
      const s = parseSkill(readFileSync(join(this.catalog(), meta.dir, 'SKILL.md'), 'utf8'), meta.dir)
      if (!s) return null
      const dest = join(this.d.claudeSkills(), name)
      const installed = this.installed().includes(name)
      return { ...meta, body: s.body.slice(0, 6000), installed, theirs: existsSync(dest) && !installed }
    } catch {
      return null
    }
  }

  /** The catalog's skills installed in Claude Code. */
  installed(): string[] {
    try {
      return readdirSync(this.d.claudeSkills()).filter((n) => SKILL_NAME.test(n) && existsSync(join(this.d.claudeSkills(), n, SKILL_MARK)))
    } catch {
      return []
    }
  }

  /** Into Claude Code (~/.claude/skills/<name>), never over a skill of yours. */
  install(name: string): SkillMeta {
    const meta = this.skills.find((s) => s.name === name)
    if (!meta) throw new Error('That skill isn’t in the catalog.')
    const src = join(this.catalog(), meta.dir)
    const dest = join(this.d.claudeSkills(), name)
    if (existsSync(dest) && !existsSync(join(dest, SKILL_MARK))) throw new Error(`You already have a skill called ${name} in Claude Code; it’s left as it is.`)
    const files = filesIn(src)
    if (files.length > MAX_FILES) throw new Error('That skill has too many files to copy.')
    let bytes = 0
    for (const f of files) bytes += lstatSync(join(src, f)).size
    if (bytes > MAX_BYTES) throw new Error('That skill is too big to copy.')
    // Copied next to it, then swapped in whole.
    const tmp = `${dest}.installing`
    rmSync(tmp, { recursive: true, force: true })
    for (const f of files) {
      mkdirSync(join(tmp, f, '..'), { recursive: true })
      cpSync(join(src, f), join(tmp, f))
    }
    writeFileSync(join(tmp, SKILL_MARK), JSON.stringify({ from: `${SKILLS_URL}/tree/main/${meta.dir}`, licence: meta.licence, credit: SKILLS_CREDIT, installed: Date.now() }, null, 2))
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(this.d.claudeSkills(), { recursive: true })
    renameSync(tmp, dest)
    this.d.onChange?.()
    return meta
  }

  uninstall(name: string): void {
    if (!SKILL_NAME.test(name)) throw new Error('That isn’t a skill’s name.')
    const dest = join(this.d.claudeSkills(), name)
    if (!existsSync(dest)) return
    if (!existsSync(join(dest, SKILL_MARK))) throw new Error('That skill wasn’t installed from the catalog; it’s left as it is.')
    rmSync(dest, { recursive: true, force: true })
    this.d.onChange?.()
  }

  /** Into Claude Code, then a draft in the Claude tab to finish. */
  start(name: string): { draft: string } {
    const s = this.install(name)
    return { draft: skillDraft(s) }
  }
}
