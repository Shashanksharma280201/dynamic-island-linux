import { execFile } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { INBOX, dateOf, formatNote, projectOf, projectPaths, within, type Frontmatter } from '@shared/brain'
import { digestTranscript, sessionTitle, type SessionDigest } from './transcript'
import type { Vault } from './vault'

export type MineDeps = {
  vault: Vault
  projectsDir: string
  hasGit: (dir: string) => boolean
  skip: string[]
  /** Run git in a folder; '' when it fails. */
  git?: (root: string, args: string[]) => Promise<string>
  now?: number
  /** Sessions read per project, newest first. */
  perProject?: number
  onProgress?: (text: string) => void
}

export type MineResult = { drafts: string[]; projects: number; sessions: number; skipped: number }

/** git in a folder, '' on any failure. */
export function runGit(root: string, args: string[]): Promise<string> {
  return new Promise((resolve) => execFile('git', ['-C', root, ...args], { timeout: 10_000, maxBuffer: 2_000_000 }, (err, out) => resolve(err ? '' : String(out))))
}

type Project = { name: string; root: string; sessions: SessionDigest[]; total: number; first: number; last: number }

/**
 * Look through your past Claude Code sessions and the git history of their
 * folders, and draft a page for each project in the inbox (you keep the ones
 * you want). Projects that already have a page, or a draft waiting, are left alone.
 */
export async function mineHistory(d: MineDeps): Promise<MineResult> {
  const now = d.now ?? Date.now()
  const git = d.git ?? runGit
  const per = d.perProject ?? 25
  const byName = new Map<string, Project>()
  let sessions = 0
  let dirs: string[] = []
  try {
    dirs = readdirSync(d.projectsDir)
  } catch {
    return { drafts: [], projects: 0, sessions: 0, skipped: 0 }
  }
  for (const [n, dir] of dirs.entries()) {
    d.onProgress?.(`Reading sessions (${n + 1} of ${dirs.length} folders)…`)
    let files: { path: string; mtime: number }[] = []
    try {
      files = readdirSync(join(d.projectsDir, dir))
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          const path = join(d.projectsDir, dir, f)
          return { path, mtime: statSync(path).mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)
    } catch {
      continue
    }
    if (!files.length) continue
    const digests: SessionDigest[] = []
    for (const f of files.slice(0, per)) {
      try {
        const g = await digestTranscript(f.path, 50_000)
        if (g.exchanges.length && g.cwd) digests.push(g)
      } catch {
        // unreadable: skip it
      }
    }
    if (!digests.length) continue
    // The project's own folder: the shortest one its sessions ran in (a session in a subfolder is still this project's).
    const cwd = digests.map((g) => g.cwd).sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
    if (within(cwd, d.vault.root) || d.skip.some((s) => within(cwd, s))) continue
    const { name, root } = projectOf(cwd, d.hasGit)
    const p = byName.get(name) ?? { name, root, sessions: [], total: 0, first: Infinity, last: 0 }
    p.sessions.push(...digests)
    p.total += files.length
    p.first = Math.min(p.first, files[files.length - 1].mtime, ...digests.map((g) => g.start || Infinity))
    p.last = Math.max(p.last, files[0].mtime)
    byName.set(name, p)
    sessions += files.length
  }

  const drafts: string[] = []
  let skipped = 0
  const inbox = d.vault.list(INBOX).map((f) => f.path)
  for (const p of [...byName.values()].sort((a, b) => b.last - a.last)) {
    const pages = projectPaths(p.name)
    if (d.vault.has(pages.page) || inbox.some((x) => x.endsWith(`-project-${p.name}.md`))) {
      skipped++
      continue
    }
    d.onProgress?.(`Drafting ${p.name}…`)
    const isRepo = d.hasGit(p.root)
    const [log, remote] = isRepo
      ? await Promise.all([git(p.root, ['log', '-n', '12', '--date=short', '--pretty=format:%ad %s']), git(p.root, ['remote', 'get-url', 'origin'])])
      : ['', '']
    const path = d.vault.writeNew(`${INBOX}/${dateOf(now)}-project-${p.name}.md`, projectDraft(p, { log, remote: cleanRemote(remote.trim()), now }), `Drafted the project page for ${p.name}`)
    drafts.push(path)
  }
  if (drafts.length) d.vault.log(`drafted ${drafts.length} project page${drafts.length === 1 ? '' : 's'} from your Claude Code history`)
  return { drafts, projects: byName.size, sessions, skipped }
}

/** A remote's address without any password in it. Pure. */
export function cleanRemote(url: string): string {
  return url.replace(/\/\/[^@/]+@/, '//')
}

/** A project's draft page. Pure. */
export function projectDraft(p: Project, o: { log: string; remote: string; now: number }): string {
  const meta: Frontmatter = {
    type: 'project',
    date: dateOf(o.now),
    source: 'island-mining',
    suggested: projectPaths(p.name).page,
    status: 'active',
    summary: '',
    folder: p.root,
    remote: o.remote,
  }
  const recent = [...p.sessions].sort((a, b) => b.end - a.end)
  const asked = recent.slice(0, 12).map((s) => `- ${dateOf(s.end || s.start)}: ${sessionTitle(s)}`)
  const files = new Map<string, number>()
  for (const s of p.sessions) for (const f of s.files.slice(0, 20)) files.set(f, (files.get(f) ?? 0) + 1)
  const top = [...files.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const commits = o.log
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
  const parts = [
    `# ${p.name}`,
    '<!-- One line on what this is and why it matters goes in `summary` above (every AI sees it in your brief). Keep what is useful below and delete the rest. Keep the note to file it in 02-projects. -->',
    `## What I have worked on with Claude Code\n\n${asked.join('\n')}`,
    commits.length ? `## Recent commits\n\n${commits.map((c) => `- ${c}`).join('\n')}` : '',
    top.length ? `## Files I touch most\n\n${top.map(([f, n]) => `- \`${f}\` (${n} session${n === 1 ? '' : 's'})`).join('\n')}` : '',
    `## Numbers\n\n- ${p.total} Claude Code session${p.total === 1 ? '' : 's'} from ${dateOf(Number.isFinite(p.first) ? p.first : p.last)} to ${dateOf(p.last)}`,
  ]
  return formatNote(meta, parts.filter(Boolean).join('\n\n') + '\n', ['summary'])
}
