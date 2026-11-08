import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DIMS, cosine, unit } from '@shared/meaning'

/** Turns texts into unit vectors (the island's worker, or a stand-in). Null when the model isn't ready. */
export type Embedder = (texts: string[]) => Promise<Float32Array[]>

type Entry = { mtime: number; v: Float32Array }

/**
 * The notes' vectors, kept in the vault's index folder (rebuilt from the
 * notes any time) and brought up to date a few notes at a time in the
 * background. Restricted notes never get here: the list comes from the
 * keyword index, which never reads them.
 */
export class MeaningIndex {
  private entries = new Map<string, Entry>()
  private loaded = false
  private busy = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private file: string) {}

  size(): number {
    this.load()
    return this.entries.size
  }

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const meta = JSON.parse(readFileSync(`${this.file}.json`, 'utf8')) as { dims: number; notes: { path: string; mtime: number }[] }
      const buf = readFileSync(`${this.file}.bin`)
      if (meta.dims !== DIMS || buf.length !== meta.notes.length * DIMS * 4) return
      const all = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
      meta.notes.forEach((n, i) => this.entries.set(n.path, { mtime: n.mtime, v: all.slice(i * DIMS, (i + 1) * DIMS) }))
    } catch {
      // none yet, or from another model: it fills again
    }
  }

  private saveSoon(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save()
    }, 2000)
    this.saveTimer.unref?.()
  }

  save(): void {
    const notes = [...this.entries.entries()]
    const all = new Float32Array(notes.length * DIMS)
    notes.forEach(([, e], i) => all.set(e.v, i * DIMS))
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(`${this.file}.bin.tmp`, Buffer.from(all.buffer))
    writeFileSync(`${this.file}.json.tmp`, JSON.stringify({ dims: DIMS, notes: notes.map(([path, e]) => ({ path, mtime: e.mtime })) }))
    renameSync(`${this.file}.bin.tmp`, `${this.file}.bin`)
    renameSync(`${this.file}.json.tmp`, `${this.file}.json`)
  }

  /**
   * Embed the notes that are new or changed (at most `max` this time), and
   * forget the ones that are gone. Returns how many it embedded.
   */
  async update(notes: { path: string; mtime: number; text: () => string }[], embed: Embedder, max = 64): Promise<number> {
    this.load()
    if (this.busy) return 0
    this.busy = true
    try {
      const here = new Set(notes.map((n) => n.path))
      let changed = false
      for (const p of [...this.entries.keys()]) {
        if (!here.has(p)) {
          this.entries.delete(p)
          changed = true
        }
      }
      const todo = notes.filter((n) => this.entries.get(n.path)?.mtime !== n.mtime).slice(0, max)
      for (let i = 0; i < todo.length; i += 16) {
        const batch = todo.slice(i, i + 16)
        const vs = await embed(batch.map((n) => n.text()))
        batch.forEach((n, k) => vs[k] && this.entries.set(n.path, { mtime: n.mtime, v: unit(vs[k]) }))
        changed = true
      }
      if (changed) this.saveSoon()
      return todo.length
    } finally {
      this.busy = false
    }
  }

  /** The notes closest in meaning to the question, best first. */
  async query(q: string, embed: Embedder, k = 30, under?: string): Promise<{ path: string; score: number }[]> {
    this.load()
    if (!this.entries.size) return []
    const [v] = await embed([q])
    if (!v) return []
    const qv = unit(v)
    const out: { path: string; score: number }[] = []
    for (const [path, e] of this.entries) {
      if (under && !path.startsWith(under.replace(/\/?$/, '/'))) continue
      out.push({ path, score: cosine(qv, e.v) })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k)
  }

  exists(): boolean {
    return existsSync(`${this.file}.json`)
  }
}
