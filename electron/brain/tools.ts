import { MEANING_MIN, fuse } from '@shared/meaning'
import { DECISIONS, INBOX, LEDGERS, dateOf, formatNote, parseNote, safeVaultPath, slugify, sourceName, type Frontmatter } from '@shared/brain'
import { schema, str, strList, type AgentTool } from '../agent/tools'
import type { BrainIndex } from './search'
import type { Vault } from './vault'

export type BrainToolDeps = {
  vault: Vault
  index: BrainIndex
  /** The brief's text. */
  brief: () => string
  /** Who is writing, for each note's `source` (e.g. "claude-code", "island"). */
  source: string
  now?: () => number
  /** Notes close in meaning to the words, when search by meaning is on. */
  meaning?: (query: string, under?: string) => Promise<{ path: string; score: number; chunk?: number }[]>
}

const MAX_READ = 30_000

/** "[[Name]]" for a name, unless it is one already. Pure. */
function link(name: string): string {
  const n = name.trim().replace(/^\[\[|\]\]$/g, '')
  return n ? `[[${n}]]` : ''
}

/** One line: no newlines, trimmed, capped. Pure. */
function oneLine(s: string, n = 300): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, n)
}

/**
 * The brain as tools, for the island's own assistant and (over MCP) for
 * Claude Code and other apps. Reading never reaches 08-restricted; writing
 * only adds to the inbox, the decisions folder and the ledgers.
 */
export function brainTools(d: BrainToolDeps): AgentTool[] {
  const now = () => (d.now ?? Date.now)()
  return [
    {
      name: 'brain_brief',
      description: 'The user’s brief from their second brain: who they are, how they like to work, their goals and projects. Read it before acting for them if you have not seen it.',
      input_schema: schema({}),
      label: () => 'Reading your brief',
      run: async () => d.brief(),
    },
    {
      name: 'brain_search',
      description:
        'Search the user’s second brain (their notes, projects, people, decisions and past Claude Code sessions) by keywords. Returns paths, titles and the matching line. Use brain_read for a whole note.',
      input_schema: schema(
        {
          query: { type: 'string', description: 'Keywords, e.g. "island drop pairing qr"' },
          folder: { type: 'string', description: 'Only under this folder, e.g. "02-projects" or "07-world-model/people"' },
          limit: { type: 'number', description: 'How many results (default 8, at most 30)' },
        },
        ['query'],
      ),
      label: (i) => `Searching your brain for “${oneLine(str(i.query), 60)}”`,
      run: async (i) => {
        const folder = str(i.folder)
        if (folder) {
          const ok = safeVaultPath(folder)
          if ('error' in ok) return ok.error
        }
        const limit = Math.min(typeof i.limit === 'number' ? i.limit : 8, 30)
        let hits = d.index.search(str(i.query), { limit: d.meaning ? 30 : limit, under: folder || undefined })
        // By meaning too: notes that say it in other words. The two lists are fused.
        const near = d.meaning ? await d.meaning(str(i.query), folder || undefined).catch(() => []) : []
        if (near.length) {
          // A note found by its words shows the lines with them; one found only by meaning, the section that matched.
          const byPath = new Map(hits.map((h) => [h.path, h]))
          const chunkOf = new Map(near.map((n) => [n.path, n.chunk]))
          hits = fuse([hits.map((h) => h.path), near.filter((n) => n.score >= MEANING_MIN).map((n) => n.path)])
            .slice(0, limit)
            .map((f) => byPath.get(f.path) ?? d.index.describe(f.path, chunkOf.get(f.path)))
            .filter((h): h is NonNullable<typeof h> => !!h)
        } else hits = hits.slice(0, limit)
        if (!hits.length) return 'Nothing in the brain matches that. Try other words, or a broader folder.'
        return hits.map((h, n) => `${n + 1}. ${h.path}${h.type || h.date ? ` (${[h.type, h.date].filter(Boolean).join(', ')})` : ''}: ${h.title}\n   ${h.snippet}`).join('\n')
      },
    },
    {
      name: 'brain_read',
      description: 'Read one note of the user’s second brain by its path (as brain_search gives it). The 08-restricted folder is private and cannot be read.',
      input_schema: schema({ path: { type: 'string', description: 'e.g. "02-projects/dynamic-island-linux/dynamic-island-linux.md"' } }, ['path']),
      label: (i) => `Reading ${oneLine(str(i.path), 80)}`,
      run: async (i) => {
        const ok = safeVaultPath(str(i.path))
        if ('error' in ok) return ok.error
        const path = ok.path.toLowerCase().endsWith('.md') || d.vault.has(ok.path) ? ok.path : `${ok.path}.md`
        if (!d.vault.has(path)) return `There is no note at ${path}. Use brain_search to find it.`
        if (!d.vault.inside(path)) return 'That note points outside the brain, so it cannot be read.'
        const text = d.vault.read(path)
        if (text === null) return `${path} is a folder, not a note. Use brain_recent or brain_search with it as the folder.`
        return text.length > MAX_READ ? `${text.slice(0, MAX_READ)}\n\n(Cut at ${MAX_READ} characters of ${text.length}.)` : text
      },
    },
    {
      name: 'brain_entity',
      description:
        'Everything the brain has on one person, project, organisation or thing: its own note (found by name) and every note that links to it, newest first.',
      input_schema: schema({ name: { type: 'string', description: 'The note’s name, e.g. "dynamic-island-linux" or "Priya Shah"' } }, ['name']),
      label: (i) => `Looking up ${oneLine(str(i.name), 60)}`,
      run: async (i) => {
        const name = str(i.name).trim().replace(/^\[\[|\]\]$/g, '')
        if (!name) return 'Give a name.'
        const own = d.index.find(name)
        const links = d.index.linksTo(name).slice(0, 25)
        if (!own && !links.length) return `The brain has nothing on “${name}” yet. Try brain_search, or capture what you know with brain_capture.`
        const parts: string[] = []
        if (own) {
          const text = d.vault.read(own) ?? ''
          parts.push(`# ${own}\n\n${text.length > 8000 ? text.slice(0, 8000) + '\n(cut)' : text}`)
        }
        if (links.length) parts.push(`Linked from:\n${links.map((l) => `- ${l.path}${l.line ? `: ${l.line}` : ''}`).join('\n')}`)
        return parts.join('\n\n')
      },
    },
    {
      name: 'brain_recent',
      description: 'Notes changed in the user’s second brain recently, newest first: what they have been working on.',
      input_schema: schema({
        days: { type: 'number', description: 'How far back (default 7)' },
        folder: { type: 'string', description: 'Only under this folder' },
      }),
      label: () => 'Looking at what changed lately',
      run: async (i) => {
        const days = typeof i.days === 'number' && i.days > 0 ? Math.min(i.days, 365) : 7
        const folder = str(i.folder)
        if (folder) {
          const ok = safeVaultPath(folder)
          if ('error' in ok) return ok.error
        }
        const list = d.index.recent({ since: now() - days * 86_400_000, under: folder || undefined, limit: 30 })
        if (!list.length) return `Nothing changed in the last ${days} days.`
        return list.map((n) => `- ${dateOf(n.mtime)} ${n.path}: ${n.title}`).join('\n')
      },
    },
    {
      name: 'brain_capture',
      description:
        'Add a note to the inbox of the user’s second brain: something you learned about them or their work that would help next time (a fact, preference, person, idea or outcome). The daily triage files it. Keep it short and factual; link people and projects as [[Name]].',
      input_schema: schema(
        {
          title: { type: 'string', description: 'A short title' },
          text: { type: 'string', description: 'The note, in Markdown' },
          type: { type: 'string', description: 'fact, preference, person, idea, outcome or note (default)' },
          about: { type: 'array', items: { type: 'string' }, description: 'People, projects or things it is about, by note name' },
        },
        ['title', 'text'],
      ),
      label: (i) => `Adding “${oneLine(str(i.title), 60)}” to your brain’s inbox`,
      run: async (i) => {
        const title = oneLine(str(i.title), 120)
        const text = str(i.text).trim()
        if (!title || !text) return 'Give a title and the text.'
        if (text.length > 20_000) return 'That is too long for one note: capture the few lines that matter.'
        const type = /^(fact|preference|person|idea|outcome|note)$/.test(str(i.type)) ? str(i.type) : 'note'
        const meta: Frontmatter = { type, date: dateOf(now()), source: d.source, about: strList(i.about).map(link).filter(Boolean).slice(0, 12) }
        const path = d.vault.writeNew(`${INBOX}/${dateOf(now())}-${slugify(title)}.md`, formatNote(meta, `# ${title}\n\n${text}\n`), `${d.source}: captured “${title}”`)
        d.vault.log(`${sourceName(d.source)} captured [[${path.replace(/\.md$/, '')}|${title}]]`)
        return `Saved to ${path}. It waits in the inbox until the daily triage files it.`
      },
    },
    {
      name: 'brain_decision',
      description:
        'Record a decision in the user’s second brain: what was decided, why, and what else was considered. Decisions are dated and never edited later, so the brain can learn from them.',
      input_schema: schema(
        {
          decision: { type: 'string', description: 'What was decided, in one sentence' },
          why: { type: 'string', description: 'The reasons' },
          options: { type: 'array', items: { type: 'string' }, description: 'The other options considered' },
          project: { type: 'string', description: 'The project or thing it is about, by note name' },
        },
        ['decision', 'why'],
      ),
      label: (i) => `Recording the decision “${oneLine(str(i.decision), 60)}”`,
      run: async (i) => {
        const decision = oneLine(str(i.decision), 300)
        if (!decision) return 'Say what was decided.'
        const meta: Frontmatter = { type: 'decision', date: dateOf(now()), source: d.source, project: str(i.project) ? link(str(i.project)) : '' }
        const options = strList(i.options).map((o) => `- ${oneLine(o)}`)
        const body = `# ${decision}\n\n## Why\n\n${str(i.why).trim()}\n${options.length ? `\n## Also considered\n\n${options.join('\n')}\n` : ''}`
        const path = d.vault.writeNew(`${DECISIONS}/${dateOf(now())}-${slugify(decision)}.md`, formatNote(meta, body), `${d.source}: decision “${decision}”`)
        d.vault.log(`${sourceName(d.source)} recorded the decision [[${path.replace(/\.md$/, '')}|${decision}]]`)
        return `Recorded at ${path}.`
      },
    },
    {
      name: 'brain_promise',
      description: 'Add a promise to the user’s promises ledger: something they (or you, for them) promised someone, with a due date if there is one.',
      input_schema: schema(
        {
          what: { type: 'string', description: 'What was promised' },
          to: { type: 'string', description: 'Who it was promised to, by name' },
          due: { type: 'string', description: 'Due date, YYYY-MM-DD' },
        },
        ['what'],
      ),
      label: (i) => `Adding the promise “${oneLine(str(i.what), 60)}”`,
      run: async (i) => {
        const what = oneLine(str(i.what))
        if (!what) return 'Say what was promised.'
        const due = /^\d{4}-\d{2}-\d{2}$/.test(str(i.due)) ? str(i.due) : ''
        const line = [`- [ ] ${dateOf(now())}`, what, str(i.to) ? `to ${link(str(i.to))}` : '', due ? `due ${due}` : '', `(${d.source})`].filter(Boolean).join(' · ')
        d.vault.append(`${LEDGERS}/promises.md`, line, `${d.source}: promise “${what}”`)
        return `Added to ${LEDGERS}/promises.md.`
      },
    },
  ]
}

/** The tools as other apps see them over MCP: without the brain_ prefix (the server is called brain). Pure. */
export function forMcp(tools: AgentTool[]): AgentTool[] {
  return tools.map((t) => ({ ...t, name: t.name.replace(/^brain_/, '') }))
}

/** What a session-start hook or a prompt can quote from a note: its body only. Pure. */
export function bodyOf(text: string): string {
  return parseNote(text).body.trim()
}
