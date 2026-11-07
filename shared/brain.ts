/**
 * The second brain: a folder of plain Markdown you own (the Living Brain
 * layout), shared by every AI you use. Pure pieces used by the island, its
 * Settings window and the tests.
 */

/** The folders, in order, with what goes in each. */
export const FOLDERS = [
  { dir: '00-me', what: 'Who you are. Every AI loads the brief built from these files.' },
  { dir: '01-inbox', what: 'Every capture lands here first.' },
  { dir: '02-projects', what: 'Active work with an end, one folder each.' },
  { dir: '03-areas', what: 'The parts of your life and work, one hub note each.' },
  { dir: '04-resources', what: 'Reference: setups, how-tos, snippets, reading.' },
  { dir: '05-archives', what: 'Finished things, never deleted.' },
  { dir: '06-brain', what: 'Distilled notes only, on shelves.' },
  { dir: '07-world-model', what: 'People, orgs, products, decisions (dated, append-only) and ledgers.' },
  { dir: '08-restricted', what: 'Private. No AI, index or search ever reads it.' },
  { dir: '09-sources', what: 'Raw captures (session transcripts, mail, chats). Never edited.' },
  { dir: '_system', what: 'The machinery: rules, index, log, jobs. Never content.' },
] as const

export const RESTRICTED = '08-restricted'
export const INBOX = '01-inbox'
export const PROJECTS = '02-projects'
export const ARCHIVES = '05-archives'
export const SOURCES = '09-sources'
export const SYSTEM = '_system'
export const LEDGERS = '07-world-model/ledgers'
export const DECISIONS = '07-world-model/decisions'
export const PEOPLE = '07-world-model/people'

/** The files in 00-me, in the order the brief uses them. */
export const ME_FILES = [
  { file: 'profile.md', title: 'Profile', heading: 'Profile' },
  { file: 'preferences.md', title: 'How I like to work', heading: 'How I like to work' },
  { file: 'goals.md', title: 'Goals now', heading: 'Goals now' },
  { file: 'voice.md', title: 'How I write and talk', heading: 'How I write and talk' },
] as const
export type MeFile = (typeof ME_FILES)[number]['file']

export type BrainConfig = {
  /** Keep a second brain at all. */
  on: boolean
  /** The vault folder ('' = ~/Brain). */
  vault: string
  /** File a note for each finished Claude Code session. */
  captureSessions: boolean
  /** How session notes are written: by your AI (five lines), or from the session alone. */
  distil: 'ai' | 'plain'
  /** Folders whose sessions are never captured. */
  skip: string[]
  /** The brain's MCP server port on 127.0.0.1 (stays the same, so other tools can find it). */
  port: number
  /** When the brain was made (ms): sessions before it are mined, not filed one by one. */
  since: number
}

export const BRAIN_PORT = 47823

export const BRAIN_DEFAULTS: BrainConfig = { on: false, vault: '', captureSessions: true, distil: 'ai', skip: [], port: BRAIN_PORT, since: 0 }

/** Validate the brain section of the config. Pure. */
export function parseBrainConfig(raw: any): BrainConfig {
  const c: BrainConfig = { ...BRAIN_DEFAULTS, skip: [] }
  if (!raw || typeof raw !== 'object') return c
  if (typeof raw.on === 'boolean') c.on = raw.on
  if (typeof raw.vault === 'string' && (raw.vault === '' || raw.vault.startsWith('/'))) c.vault = raw.vault
  if (typeof raw.captureSessions === 'boolean') c.captureSessions = raw.captureSessions
  if (raw.distil === 'ai' || raw.distil === 'plain') c.distil = raw.distil
  if (Array.isArray(raw.skip)) c.skip = raw.skip.filter((s: unknown): s is string => typeof s === 'string' && s.startsWith('/')).slice(0, 50)
  const port = Number(raw.port)
  if (Number.isInteger(port) && port >= 1024 && port <= 65535) c.port = port
  if (Number.isFinite(raw.since) && raw.since > 0) c.since = Math.floor(raw.since)
  return c
}

/** What Settings shows about the brain. */
export type BrainView = {
  on: boolean
  /** The vault folder (and as shown, with ~), and whether it exists yet. */
  vault: string
  vaultLabel: string
  exists: boolean
  captureSessions: boolean
  distil: 'ai' | 'plain'
  /** How notes get written now ('Claude Code (Haiku)', 'Anthropic (claude-…)', or null when only plain notes can be). */
  distiller: string | null
  skip: string[]
  /** Counts, when the vault exists. */
  notes: number
  inbox: InboxItem[]
  /** Brain tools for other apps: the address, or why they're off. */
  mcp: { url: string | null; error: string | null }
  /** The AI tools it can be connected to, and how far each is. */
  tools: ToolLink[]
  /** The 00-me files and whether each still holds only the template. */
  me: { file: MeFile; title: string; empty: boolean }[]
  /** The last few things the brain did. */
  log: string[]
  /** A mining or connecting job running now. */
  busy: string | null
  /** Obsidian is installed. */
  obsidian: boolean
}

export type InboxItem = {
  /** Path inside the vault. */
  path: string
  title: string
  type: string
  /** Where "Keep" files it ('' when it has no suggestion). */
  suggested: string
  date: string
}

export type ToolId = 'claude-code' | 'codex' | 'gemini'

/** Who wrote something, in words (notes keep the id in `source`). Pure. */
export function sourceName(id: string): string {
  return ({ 'claude-code': 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', island: 'The island', ai: 'An AI tool' } as Record<string, string>)[id] ?? id
}

export type ToolLink = {
  id: ToolId
  name: string
  /** The tool is installed (its config folder exists). */
  present: boolean
  /** Each part, done or not: e.g. "Brief in ~/.claude/CLAUDE.md". */
  parts: { label: string; done: boolean }[]
  connected: boolean
  /** Something to do by hand (e.g. a command to run when the CLI wasn't found). */
  manual?: string
}

// ------------------------------------------------------------------ notes ----

export type Frontmatter = Record<string, string | string[]>

/** Split a note into its frontmatter and body. Only the simple YAML notes use. Pure. */
export function parseNote(text: string): { meta: Frontmatter; body: string } {
  const t = text.replace(/^﻿/, '')
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t)
  if (!m) return { meta: {}, body: t }
  const meta: Frontmatter = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    const v = kv[2].trim()
    if (v.startsWith('[') && v.endsWith(']')) {
      meta[kv[1]] = v
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean)
    } else meta[kv[1]] = unquote(v)
  }
  return { meta, body: t.slice(m[0].length) }
}

function unquote(s: string): string {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    const inner = s.slice(1, -1)
    return s.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'")
  }
  return s
}

function yamlValue(v: string): string {
  // Quote anything YAML could read as something else.
  return /^[\w./@~+-][\w ./@~+:,()-]*$/.test(v) && !/:\s|\s$|^(true|false|null|yes|no|\d+)$/i.test(v) ? v : JSON.stringify(v)
}

/** A note's text from its frontmatter and body; empty values are left out unless named in `keepEmpty`. Pure. */
export function formatNote(meta: Frontmatter, body: string, keepEmpty: string[] = []): string {
  const lines = Object.entries(meta)
    .filter(([k, v]) => keepEmpty.includes(k) || (Array.isArray(v) ? v.length > 0 : v !== ''))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(yamlValue).join(', ')}]` : yamlValue(v)}`)
  return `---\n${lines.join('\n')}\n---\n${body.startsWith('\n') ? body.slice(1) : body}${body.endsWith('\n') ? '' : '\n'}`
}

/** A file-name-safe slug: lowercase words joined by hyphens. Pure. */
export function slugify(s: string, max = 60): string {
  const out = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return out || 'note'
}

/** YYYY-MM-DD in local time. Pure. */
export function dateOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2 h 10 min", "25 min", "under a minute". Pure. */
export function durationText(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'under a minute'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** The [[links]] in a text, as their target names (no alias, no heading). Pure. */
export function wikilinks(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g)) out.push(m[1].trim())
  return out
}

/** A note's title: its first heading, else its file name. Pure. */
export function noteTitle(path: string, body: string): string {
  const h = /^#\s+(.+)$/m.exec(body)
  if (h) return h[1].trim()
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/i, '')
}

// ------------------------------------------------------------------ paths ----

/**
 * Check a path inside the vault given by an AI: relative, no way out, not
 * Restricted, not the index. Returns the clean relative path or an error. Pure.
 */
export function safeVaultPath(p: string): { path: string } | { error: string } {
  if (typeof p !== 'string' || !p.trim()) return { error: 'Give a path inside the brain, like 02-projects/x/x.md.' }
  let rel = p.trim().replace(/\\/g, '/')
  if (rel.startsWith('~/') || rel.startsWith('/')) return { error: 'Use a path relative to the brain folder, like 01-inbox/note.md.' }
  rel = rel.replace(/^\.\//, '')
  const parts: string[] = []
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') return { error: 'Paths must stay inside the brain.' }
    parts.push(seg)
  }
  if (!parts.length) return { error: 'Give a path inside the brain.' }
  const clean = parts.join('/')
  if (isRestricted(clean)) return { error: `${RESTRICTED} is private: no AI may read or write it.` }
  if (parts[0].startsWith('.')) return { error: 'Hidden folders are not part of the brain.' }
  if (clean === `${SYSTEM}/index` || clean.startsWith(`${SYSTEM}/index/`) || clean.startsWith(`${SYSTEM}/queue`)) return { error: 'That is the brain’s machinery, not a note.' }
  return { path: clean }
}

/** Inside 08-restricted (any case). Pure. */
export function isRestricted(rel: string): boolean {
  const first = rel.replace(/\\/g, '/').replace(/^\.?\//, '').split('/')[0].toLowerCase()
  return first === RESTRICTED || first === 'restricted'
}

/** Where AI tools may write: the inbox and the ledgers (appending). Pure. */
export function aiMayWrite(rel: string): boolean {
  return rel.startsWith(`${INBOX}/`) || rel.startsWith(`${LEDGERS}/`) || rel.startsWith(`${DECISIONS}/`)
}

// --------------------------------------------------------------- projects ----

/**
 * The project a folder belongs to: its git root's name, else its own name.
 * `hasGit(dir)` says whether a folder has a .git. Pure given hasGit.
 */
export function projectOf(cwd: string, hasGit: (dir: string) => boolean): { name: string; root: string } {
  const clean = cwd.replace(/\/+$/, '') || '/'
  let dir = clean
  for (let i = 0; i < 40 && dir && dir !== '/'; i++) {
    if (hasGit(dir)) return { name: projectName(dir), root: dir }
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
  return { name: projectName(clean), root: clean }
}

function projectName(dir: string): string {
  const base = dir.split('/').filter(Boolean).pop() ?? 'home'
  return slugify(base, 80)
}

/** A project's page and its sessions folder. Pure. */
export function projectPaths(name: string): { dir: string; page: string; sessions: string } {
  const dir = `${PROJECTS}/${name}`
  return { dir, page: `${dir}/${name}.md`, sessions: `${dir}/sessions` }
}

/** Is `child` the same folder as `parent` or inside it? Pure. */
export function within(child: string, parent: string): boolean {
  const c = child.replace(/\/+$/, '')
  const p = parent.replace(/\/+$/, '')
  return !!p && (c === p || c.startsWith(p + '/'))
}
