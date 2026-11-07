import { ME_FILES, PROJECTS, parseNote } from '@shared/brain'

/** The brief stays well under Claude Code's limits, so it always loads whole. */
export const BRIEF_MAX = 6000

/**
 * A 00-me file without what the template put there: the questions (HTML
 * comments), the file's own title, labels with nothing after them, and
 * headings left with nothing under them. '' when nothing was filled in. Pure.
 */
export function filledIn(text: string): string {
  const { body } = parseNote(text)
  const lines = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    // The file's own title: the brief gives each part a heading of its own.
    .filter((l, i, all) => !(l.startsWith('# ') && all.slice(0, i).every((x) => !x.trim())))
    // "- Name:" or "-" with nothing filled in.
    .filter((l) => !/^\s*[-*]\s*([^:]{0,40}:)?\s*$/.test(l))
  // Headings with only blank lines (or lesser headings) until the next heading.
  const kept: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s/.exec(lines[i])
    if (h) {
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      const next = j < lines.length ? /^(#{1,6})\s/.exec(lines[j]) : null
      if (j >= lines.length || (next && next[1].length <= h[1].length)) continue
    }
    kept.push(lines[i])
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** A project for the brief: its name and one line about it. */
export type BriefProject = { name: string; summary: string }

/**
 * The brief every AI loads: who you are (00-me) and what you're working on.
 * `read` gets a vault file's text (null when missing). Pure given read.
 */
export function buildBrief(read: (rel: string) => string | null, projects: BriefProject[], vaultLabel: string): string {
  const head = [
    '# My brief',
    '',
    `From my second brain at ${vaultLabel}, kept up to date by the Dynamic Island. Read it as background about me and my work.`,
    `The rules for reading and writing the brain are in ${vaultLabel}/AGENTS.md. Never open its 08-restricted folder.`,
    'When you learn something about me or my work that would help next time, add it to the brain’s inbox (with the brain’s capture tool, if you have it) instead of editing other notes.',
  ].join('\n')
  const parts: string[] = []
  for (const m of ME_FILES) {
    const text = filledIn(read(`00-me/${m.file}`) ?? '')
    if (text) parts.push(`## ${m.heading}\n\n${text}`)
  }
  if (!parts.length) parts.push('## Profile\n\nNot filled in yet. If it would help, ask me about myself and add what you learn to the inbox.')
  if (projects.length) {
    parts.push(
      `## Projects\n\n${projects
        .slice(0, 15)
        .map((p) => `- [[${p.name}]]${p.summary ? `: ${p.summary}` : ''}`)
        .join('\n')}`,
    )
  }
  // Too long: shorten the longest part until it fits.
  let budget = BRIEF_MAX - head.length - 20
  const sized = parts.map((p) => p)
  while (sized.join('\n\n').length > budget && budget > 0) {
    let at = 0
    for (let i = 1; i < sized.length; i++) if (sized[i].length > sized[at].length) at = i
    const cut = sized[at].slice(0, Math.max(200, Math.floor(sized[at].length * 0.8)))
    if (cut.length >= sized[at].length) {
      budget = 0
      break
    }
    sized[at] = cut.replace(/\s+\S*$/, '') + ' …'
  }
  return `${head}\n\n${sized.join('\n\n')}\n`.slice(0, BRIEF_MAX)
}

/** One line about a project from its page: its `summary`, else its first sentence. Pure. */
export function projectSummary(page: string): string {
  const { meta, body } = parseNote(page)
  if (typeof meta.summary === 'string' && meta.summary) return meta.summary.slice(0, 160)
  const line = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('|'))
  return line ? line.replace(/\s+/g, ' ').slice(0, 160) : ''
}

/** The projects folder's project names: folders holding a page named after them. Pure given the list. */
export function projectNames(paths: string[]): string[] {
  const names = new Set<string>()
  for (const p of paths) {
    const m = new RegExp(`^${PROJECTS}/([^/]+)/([^/]+)\\.md$`).exec(p)
    if (m && m[1] === m[2]) names.add(m[1])
  }
  return [...names].sort()
}
