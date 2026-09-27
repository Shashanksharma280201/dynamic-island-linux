import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { NoteSummary, Note } from '@shared/types'

const ID = /^[a-z0-9]{6,40}$/

/** New note id: sortable by creation time, plus a little randomness. Pure-ish. */
export function newNoteId(now = Date.now()): string {
  return now.toString(36) + randomBytes(3).toString('hex')
}

/** Creation time encoded in an id (0 if it isn't one of ours). Pure. */
export function noteCreated(id: string): number {
  const t = parseInt(id.slice(0, -6), 36)
  return Number.isFinite(t) ? t : 0
}

/** Title = first non-empty line (markdown heading marks stripped). Pure. */
export function noteTitle(body: string): string {
  const line = body.split('\n').find((l) => l.trim()) ?? ''
  return line.replace(/^#+\s*/, '').trim().slice(0, 120) || 'New Note'
}

/** Preview = text after the title line, flattened. Pure. */
export function notePreview(body: string): string {
  const lines = body.split('\n')
  const i = lines.findIndex((l) => l.trim())
  return lines
    .slice(i + 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

/**
 * Notes stored as plain Markdown files, one per note (`<id>.md`), so they are
 * easy to back up, sync or open in any editor. Writes go through a temp file
 * and rename, so a crash never leaves a half-written note.
 */
export class NotesStore {
  constructor(private dir: string) {}

  get folder(): string {
    return this.dir
  }

  private path(id: string): string {
    if (!ID.test(id)) throw new Error('Invalid note')
    return join(this.dir, `${id}.md`)
  }

  async list(): Promise<NoteSummary[]> {
    await mkdir(this.dir, { recursive: true })
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.md') && ID.test(f.slice(0, -3)))
    const notes = await Promise.all(
      files.map(async (f) => {
        const id = f.slice(0, -3)
        try {
          const [body, st] = await Promise.all([readFile(join(this.dir, f), 'utf8'), stat(join(this.dir, f))])
          return {
            id,
            title: noteTitle(body),
            preview: notePreview(body),
            created: noteCreated(id) || st.birthtimeMs || st.mtimeMs,
            updated: st.mtimeMs,
          }
        } catch {
          return null
        }
      }),
    )
    return notes.filter((n): n is NoteSummary => !!n).sort((a, b) => b.updated - a.updated)
  }

  async get(id: string): Promise<Note> {
    const p = this.path(id)
    const [body, st] = await Promise.all([readFile(p, 'utf8'), stat(p)])
    return { id, body, title: noteTitle(body), preview: notePreview(body), created: noteCreated(id) || st.mtimeMs, updated: st.mtimeMs }
  }

  /** Create (no id) or update a note; returns its id. */
  async save(id: string | undefined, body: string): Promise<string> {
    if (body.length > 1_000_000) throw new Error('Note is too long')
    await mkdir(this.dir, { recursive: true })
    const noteId = id ?? newNoteId()
    const p = this.path(noteId)
    const tmp = `${p}.tmp`
    await writeFile(tmp, body, { mode: 0o600 })
    await rename(tmp, p)
    return noteId
  }

  async remove(id: string): Promise<void> {
    await unlink(this.path(id)).catch((e) => {
      if (e?.code !== 'ENOENT') throw e
    })
  }
}
