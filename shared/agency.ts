/**
 * The Agency (github.com/msitarzewski/agency-agents, MIT, by AgentLand
 * Contributors): a catalog of specialist agents, each a markdown file with
 * a short frontmatter (name, description, color, emoji, vibe) and the
 * agent's own instructions. The island downloads it when you ask, lets you
 * browse and search it, starts any agent in Claude or a terminal, and
 * installs one into Claude Code. Pure functions.
 */

export const AGENCY_REPO = 'msitarzewski/agency-agents'
export const AGENCY_URL = `https://github.com/${AGENCY_REPO}`
export const AGENCY_TARBALL = `https://codeload.github.com/${AGENCY_REPO}/tar.gz/refs/heads/main`
export const AGENCY_CREDIT = 'The Agency, by AgentLand Contributors (MIT licence)'

/** Folders that hold no agents (conversions, examples, scripts, playbooks). */
export const NOT_DIVISIONS = new Set(['integrations', 'examples', 'scripts', 'strategy', '.github', 'node_modules'])

export type AgencyDivision = { id: string; label: string; color: string; count: number }

export type AgencyAgent = {
  /** Its path in the catalog without .md ("engineering/engineering-ai-engineer"). */
  id: string
  /** For Claude Code: the file's name ("engineering-ai-engineer"). */
  slug: string
  name: string
  description: string
  division: string
  emoji: string
  color: string
  vibe: string
}

export type AgencyView = {
  /** Downloaded, and when (null: not yet). */
  have: boolean
  updated: number | null
  busy: 'download' | null
  error: string | null
  count: number
  divisions: AgencyDivision[]
  /** Slugs installed in Claude Code. */
  installed: string[]
  credit: string
  url: string
}

/** A frontmatter value: unquoted, or a JSON-style or single-quoted string. Pure. */
function value(raw: string): string {
  const v = raw.trim()
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v)
    } catch {
      return v.slice(1, -1)
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'")
  return v
}

/** An agent's file: its frontmatter and its instructions; null when it isn't an agent. Pure. */
export function parseAgent(text: string, path: string): (AgencyAgent & { body: string }) | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return null
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1].toLowerCase()] = value(kv[2])
  }
  if (!meta.name || !meta.description) return null
  const rel = path.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\.md$/i, '')
  const parts = rel.split('/')
  if (parts.length < 2 || parts.some((p) => p === '..' || !p)) return null
  const slug = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
  if (!slug) return null
  return {
    id: rel,
    slug,
    name: meta.name.slice(0, 80),
    description: meta.description.replace(/\s+/g, ' ').slice(0, 600),
    division: parts[0],
    emoji: [...(meta.emoji ?? '')].slice(0, 2).join(''),
    color: /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(meta.color ?? '') ? meta.color : 'gray',
    vibe: (meta.vibe ?? '').replace(/\s+/g, ' ').slice(0, 200),
    body: m[2].trim(),
  }
}

/** divisions.json: id, label, color. Pure. */
export function parseDivisions(raw: unknown): Map<string, { label: string; color: string }> {
  const out = new Map<string, { label: string; color: string }>()
  const d = (raw as { divisions?: Record<string, { label?: string; color?: string }> })?.divisions
  if (!d || typeof d !== 'object') return out
  for (const [id, v] of Object.entries(d)) {
    if (!/^[\w-]{1,40}$/.test(id) || !v || typeof v !== 'object') continue
    out.set(id, { label: String(v.label ?? id).slice(0, 40), color: /^#[0-9a-f]{3,8}$/i.test(String(v.color)) ? String(v.color) : '#8e8e93' })
  }
  return out
}

/** The divisions in use, with counts and labels (unknown ones named from their folder). Pure. */
export function divisionsOf(agents: AgencyAgent[], known: Map<string, { label: string; color: string }>): AgencyDivision[] {
  const counts = new Map<string, number>()
  for (const a of agents) counts.set(a.division, (counts.get(a.division) ?? 0) + 1)
  return [...counts]
    .map(([id, count]) => ({ id, count, label: known.get(id)?.label ?? id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), color: known.get(id)?.color ?? '#8e8e93' }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Agents that fit the words (name first, then vibe and description), in a division or all. Pure. */
export function searchAgents(agents: AgencyAgent[], q: string, division = '', max = 60): AgencyAgent[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = agents
    .filter((a) => !division || a.division === division)
    .map((a) => {
      const name = a.name.toLowerCase()
      const rest = `${a.vibe} ${a.description} ${a.division}`.toLowerCase()
      let s = 0
      for (const w of words) {
        if (name.includes(w)) s += name.startsWith(w) || name.includes(` ${w}`) ? 6 : 4
        else if (rest.includes(w)) s += 1
        else return { a, s: -1 }
      }
      return { a, s }
    })
    .filter((x) => x.s >= 0)
  return scored.sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name)).slice(0, max).map((x) => x.a)
}

/**
 * The agent as a Claude Code subagent (~/.claude/agents/<slug>.md): a name
 * Claude Code can call it by, its description, its colour, and its
 * instructions, with where it came from. Pure.
 */
export function asClaudeAgent(a: AgencyAgent & { body: string }): string {
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']
  const color = colors.includes(a.color.toLowerCase()) ? a.color.toLowerCase() : ''
  const desc = JSON.stringify(a.description)
  return `---\nname: ${a.slug}\ndescription: ${desc}\n${color ? `color: ${color}\n` : ''}---\n\n<!-- From ${AGENCY_CREDIT}: ${AGENCY_URL}/blob/main/${a.id}.md -->\n\n${a.body}\n`
}

/** Is a file in ~/.claude/agents one the island installed from The Agency? Pure. */
export function fromAgency(text: string): boolean {
  return text.includes(`<!-- From ${AGENCY_CREDIT}`)
}

/** What to type in Claude to use an installed agent. Pure. */
export function startDraft(a: Pick<AgencyAgent, 'slug' | 'name'>): string {
  return `Use the ${a.slug} agent (${a.name}) to `
}
