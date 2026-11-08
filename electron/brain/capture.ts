import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { INBOX, SOURCES, SYSTEM, dateOf, projectOf, projectPaths, within } from '@shared/brain'
import { digestTranscript, distilPrompt, parseFiveLines, sessionNote, sourceNote, type FiveLines, type SessionDigest } from './transcript'
import type { Vault } from './vault'

/** Sessions quiet this long count as finished for the sweep. */
export const QUIET_MS = 30 * 60_000

export type CaptureDeps = {
  vault: Vault
  /** Claude Code's transcripts: ~/.claude/projects. */
  projectsDir: string
  /** Folders whose sessions are never captured. */
  skip: () => string[]
  /** Ask an AI for the five lines; null when only plain notes can be written. */
  ask: (() => ((prompt: string) => Promise<string>) | null) | null
  hasGit: (dir: string) => boolean
  /** Only sessions changed after this are swept (the brain's start, so old history isn't filed one by one). */
  since: () => number
  now?: () => number
  onFiled?: (path: string) => void
  /** Filing is on (Settings → Brain); while it's off, queued sessions are dropped. */
  enabled?: () => boolean
}

/** A filed session: its note, how many prompts it had, when the island wrote it, and when it last looked. */
type Filed = { note: string; prompts: number; at: number; seen: number }

/** Where the hook leaves finished sessions for the island. */
export const QUEUE = `${SYSTEM}/queue`
const STATE = `${SYSTEM}/captured.json`

/**
 * Files a note for each finished Claude Code session: five lines in the
 * project's sessions folder (or the inbox until the project has a page), and
 * what was said in 09-sources. Sessions arrive through the hook's queue, and a
 * sweep picks up any that ended without saying so.
 */
export class SessionCapture {
  private chain: Promise<unknown> = Promise.resolve()
  private state: Record<string, Filed> | null = null

  constructor(private readonly d: CaptureDeps) {}

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  private load(): Record<string, Filed> {
    if (this.state) return this.state
    try {
      this.state = JSON.parse(this.d.vault.read(STATE) ?? '{}') ?? {}
    } catch {
      this.state = {}
    }
    return this.state!
  }

  private remember(id: string, f: Filed): void {
    const s = this.load()
    s[id] = f
    // Keep the newest few thousand.
    const ids = Object.keys(s)
    if (ids.length > 5000) for (const old of ids.sort((a, b) => s[a].at - s[b].at).slice(0, ids.length - 5000)) delete s[old]
    this.d.vault.write(STATE, JSON.stringify(s, null, 1) + '\n', 'Noted which sessions are filed')
  }

  /** One at a time, so two triggers never file the same session twice. */
  private serial<T>(f: () => Promise<T>): Promise<T> {
    const run = this.chain.then(f, f)
    this.chain = run.catch(() => {})
    return run
  }

  /** File the sessions the hook queued. */
  processQueue(): Promise<string[]> {
    return this.serial(async () => {
      const dir = this.d.vault.abs(QUEUE)
      let names: string[] = []
      try {
        names = readdirSync(dir).filter((n) => n.endsWith('.json'))
      } catch {
        return []
      }
      const filed: string[] = []
      const on = this.d.enabled?.() ?? true
      for (const n of names) {
        const file = join(dir, n)
        if (!on) {
          rmSync(file, { force: true })
          continue
        }
        let job: any = null
        try {
          job = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
          // half-written or broken: drop it
        }
        try {
          if (job && typeof job.transcript_path === 'string') {
            const p = await this.file(job.transcript_path)
            if (p) filed.push(p)
          }
        } catch (e) {
          console.error('[brain] capture failed:', e instanceof Error ? e.message : e)
        }
        rmSync(file, { force: true })
      }
      return filed
    })
  }

  /** File sessions that went quiet without a SessionEnd (closed terminals, crashes). */
  sweep(): Promise<string[]> {
    return this.serial(async () => {
      const since = this.d.since()
      const quietBefore = this.now() - QUIET_MS
      const found: { path: string; mtime: number }[] = []
      let dirs: string[] = []
      try {
        dirs = readdirSync(this.d.projectsDir)
      } catch {
        return []
      }
      for (const dir of dirs) {
        let files: string[] = []
        try {
          files = readdirSync(join(this.d.projectsDir, dir)).filter((f) => f.endsWith('.jsonl'))
        } catch {
          continue
        }
        for (const f of files) {
          const path = join(this.d.projectsDir, dir, f)
          try {
            const st = statSync(path)
            if (st.mtimeMs > since && st.mtimeMs < quietBefore) found.push({ path, mtime: st.mtimeMs })
          } catch {
            // gone
          }
        }
      }
      const state = this.load()
      const filed: string[] = []
      for (const t of found.sort((a, b) => a.mtime - b.mtime).slice(-50)) {
        const id = t.path.split('/').pop()!.replace(/\.jsonl$/, '')
        const known = state[id]
        if (known && (known.seen ?? known.at) >= t.mtime) continue
        try {
          const p = await this.file(t.path)
          if (p) filed.push(p)
        } catch (e) {
          console.error('[brain] sweep failed:', e instanceof Error ? e.message : e)
        }
      }
      return filed
    })
  }

  /** File one session from its transcript. Returns the note's path, or null when there's nothing to file. */
  private async file(transcript: string): Promise<string | null> {
    if (!existsSync(transcript)) return null
    const d = await digestTranscript(transcript)
    if (!d.id) d.id = transcript.split('/').pop()!.replace(/\.jsonl$/, '')
    if (!d.exchanges.length || !d.cwd) return null
    if (within(d.cwd, this.d.vault.root)) return null
    if (this.d.skip().some((s) => within(d.cwd, s))) return null
    const state = this.load()
    const known = state[d.id]
    // Filed already, and nothing new since.
    if (known && d.exchanges.length <= known.prompts) {
      this.remember(d.id, { ...known, seen: this.now() })
      return null
    }
    const project = projectOf(d.cwd, this.d.hasGit).name
    const five = await this.distil(d, project)
    const short = d.id.replace(/[^\w-]/g, '').slice(0, 6) || 'session'
    const date = dateOf(d.end || d.start || this.now())
    const source = known ? noteSource(this.d.vault.read(known.note)) : null
    const sourcePath = source ?? `${SOURCES}/claude-code/${date}-${project}-${short}.md`
    this.d.vault.write(sourcePath, sourceNote(d, project), `Session source for ${project}`)

    const pages = projectPaths(project)
    const filedInProject = this.d.vault.has(pages.page)
    // Grown since it was filed: rewrite our own note in place, unless you edited it.
    let target: string
    if (known && this.d.vault.has(known.note) && !editedSince(this.d.vault.abs(known.note), known.at)) target = known.note
    else if (filedInProject) target = this.d.vault.freeName(`${pages.sessions}/${date}-${project}-${short}.md`)
    else target = this.d.vault.freeName(`${INBOX}/${date}-session-${project}-${short}.md`)
    const text = sessionNote(d, {
      project,
      five,
      source: sourcePath,
      suggested: target.startsWith(`${INBOX}/`) ? `${pages.sessions}/` : undefined,
      now: this.now(),
    })
    this.d.vault.write(target, text, `Session in ${project}: ${five?.title ?? 'filed'}`)
    this.d.vault.log(`filed a Claude Code session in ${project}: [[${target.replace(/\.md$/, '')}|${five?.title || 'the note'}]]`)
    const at = this.now()
    this.remember(d.id, { note: target, prompts: d.exchanges.length, at, seen: at })
    this.d.onFiled?.(target)
    return target
  }

  private async distil(d: SessionDigest, project: string): Promise<FiveLines | null> {
    const ask = this.d.ask?.()
    if (!ask) return null
    try {
      const answer = await Promise.race([ask(distilPrompt(d, project)), new Promise<string>((_, no) => setTimeout(() => no(new Error('timed out')), 120_000).unref?.())])
      return parseFiveLines(answer)
    } catch (e) {
      console.error('[brain] five lines failed, writing a plain note:', e instanceof Error ? e.message : e)
      return null
    }
  }
}

/** The source note a session note points at. Pure. */
function noteSource(text: string | null): string | null {
  const m = text ? /Source: \[\[([^\]|]+)/.exec(text) : null
  return m ? `${m[1]}.md` : null
}

/** Changed by someone else after the island wrote it (a second's grace). */
function editedSince(abs: string, at: number): boolean {
  try {
    return statSync(abs).mtimeMs > at + 1000
  } catch {
    return false
  }
}
