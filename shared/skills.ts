/**
 * Agent Skills (github.com/anthropics/skills): folders of instructions,
 * scripts and references that Claude Code loads when they help. The island
 * downloads the catalog when you ask, lets you browse and search it, and
 * installs a skill into Claude Code (~/.claude/skills/<name>), credited with
 * its own licence. Pure functions.
 */

export const SKILLS_REPO = 'anthropics/skills'
export const SKILLS_URL = `https://github.com/${SKILLS_REPO}`
export const SKILLS_TARBALL = `https://codeload.github.com/${SKILLS_REPO}/tar.gz/refs/heads/main`
export const SKILLS_CREDIT = 'Agent Skills, by Anthropic (each skill under its own licence)'
/** Kept in a skill the island installed, so it only ever removes its own. */
export const SKILL_MARK = '.from-dynamic-island.json'

/** A skill's name, as the Agent Skills format allows it. */
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

export type SkillMeta = {
  name: string
  description: string
  /** "Apache 2.0", "MIT", or what its frontmatter says. */
  licence: string
  /** Its folder in the catalog. */
  dir: string
  files: number
}

export type SkillsView = {
  have: boolean
  updated: number | null
  busy: 'download' | null
  error: string | null
  count: number
  installed: string[]
  credit: string
  url: string
}

export type SkillDetail = SkillMeta & { body: string; installed: boolean; theirs: boolean }

/**
 * A SKILL.md's frontmatter and body, with YAML's block text (`|`, `|-`,
 * `>`) and quoted values; null without frontmatter. Pure.
 */
export function skillFrontmatter(text: string): { meta: Record<string, string>; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return null
  const meta: Record<string, string> = {}
  const lines = m[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    const key = kv[1].toLowerCase()
    const raw = kv[2].trim()
    if (/^[|>][-+]?$/.test(raw)) {
      const block: string[] = []
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim())
      meta[key] = (raw.startsWith('>') ? block.join(' ') : block.join('\n')).trim()
    } else if (raw.startsWith('"') && raw.endsWith('"') && raw.length > 1) {
      try {
        meta[key] = JSON.parse(raw)
      } catch {
        meta[key] = raw.slice(1, -1)
      }
    } else if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 1) meta[key] = raw.slice(1, -1).replace(/''/g, "'")
    else meta[key] = raw
  }
  return { meta, body: m[2] }
}

/** A skill from its SKILL.md; null when it isn't one. Pure. */
export function parseSkill(text: string, dir: string, licenceText = '', files = 0): (SkillMeta & { body: string }) | null {
  const f = skillFrontmatter(text)
  if (!f) return null
  const name = (f.meta.name ?? '').trim()
  const description = (f.meta.description ?? '').replace(/\s+/g, ' ').trim()
  if (!SKILL_NAME.test(name) || !description) return null
  return { name, description: description.slice(0, 1024), licence: licenceOf(f.meta.license ?? f.meta.licence ?? '', licenceText), dir, files, body: f.body.trim() }
}

/** The licence, from its LICENSE.txt when there is one, else what the frontmatter says. Pure. */
export function licenceOf(field: string, text: string): string {
  const head = text.slice(0, 2000)
  if (/Apache License/i.test(head) && /Version 2\.0/i.test(head)) return 'Apache 2.0'
  if (/\bMIT License\b/i.test(head)) return 'MIT'
  if (/\b(BSD)\b/.test(head)) return 'BSD'
  if (head.trim()) return 'Its own terms (LICENSE.txt)'
  const f = field.trim()
  if (!f || /complete terms in license/i.test(f)) return 'See the repository'
  return f.slice(0, 60)
}

/** Skills matching a search (name first, then description), by name. Pure. */
export function searchSkills(list: SkillMeta[], q: string): SkillMeta[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const score = (s: SkillMeta) => {
    const name = s.name.toLowerCase()
    const desc = s.description.toLowerCase()
    let n = 0
    for (const w of words) {
      if (name.includes(w)) n += 3
      else if (desc.includes(w)) n += 1
      else return -1
    }
    return n
  }
  return list
    .map((s) => ({ s, n: words.length ? score(s) : 0 }))
    .filter((x) => x.n >= 0)
    .sort((a, b) => b.n - a.n || a.s.name.localeCompare(b.s.name))
    .map((x) => x.s)
}

/** What the Claude tab starts with, to finish and send. Pure. */
export function skillDraft(s: Pick<SkillMeta, 'name'>): string {
  return `Use the ${s.name} skill to `
}
