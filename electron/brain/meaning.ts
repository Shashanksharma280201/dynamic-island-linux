import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DIMS, EMBED_MODEL, cosine, queryText, unit } from '@shared/meaning'

/** Turns texts into unit vectors (the island's worker, or a stand-in). Null when the model isn't ready. */
export type Embedder = (texts: string[]) => Promise<Float32Array[]>

/** A note's vectors: one per stretch of it (`n` of them, one after another). */
type Entry = { mtime: number; n: number; v: Float32Array }

/** A note close in meaning: how close its closest stretch is, and which stretch that is. */
export type Near = { path: string; score: number; chunk: number }

/** The index file's format; an older one (or another model's) is read again from the notes. */
const VERSION = 2

/**
 * The notes' vectors, one for each section (or part of a long one), kept in
 * the vault's index folder (rebuilt from the notes any time) and brought up
 * to date a few notes at a time in the background. A note is as close to a
 * question as its closest section. Restricted notes never get here: the list
 * comes from the keyword index, which never reads them.
 */
export class MeaningIndex {
  private entries = new Map<string, Entry>()
  private loaded = false
  private busy = false
  private saveTimer: NodeJS.Timeout | null = null
  private used = 0

  constructor(
    private file: string,
    private model = EMBED_MODEL,
  ) {}

  /** How many notes it has read. */
  size(): number {
    this.load()
    return this.entries.size
  }

  /** How many stretches of them. */
  vectors(): number {
    this.load()
    let n = 0
    for (const e of this.entries.values()) n += e.n
    return n
  }

  private load(): void {
    this.used = Date.now()
    if (this.loaded) return
    this.loaded = true
    try {
      const meta = JSON.parse(readFileSync(`${this.file}.json`, 'utf8')) as { version?: number; model?: string; dims: number; notes: { path: string; mtime: number; n: number }[] }
      if (meta.version !== VERSION || meta.model !== this.model || meta.dims !== DIMS) return
      const buf = readFileSync(`${this.file}.bin`)
      const total = meta.notes.reduce((s, n) => s + n.n, 0)
      if (buf.length !== total * DIMS * 4 || meta.notes.some((n) => !(n.n > 0))) return
      const all = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
      let at = 0
      for (const n of meta.notes) {
        this.entries.set(n.path, { mtime: n.mtime, n: n.n, v: all.slice(at * DIMS, (at + n.n) * DIMS) })
        at += n.n
      }
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
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    const notes = [...this.entries.entries()]
    const all = new Float32Array(notes.reduce((s, [, e]) => s + e.n, 0) * DIMS)
    let at = 0
    for (const [, e] of notes) {
      all.set(e.v, at * DIMS)
      at += e.n
    }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(`${this.file}.bin.tmp`, Buffer.from(all.buffer))
    writeFileSync(`${this.file}.json.tmp`, JSON.stringify({ version: VERSION, model: this.model, dims: DIMS, notes: notes.map(([path, e]) => ({ path, mtime: e.mtime, n: e.n })) }))
    renameSync(`${this.file}.bin.tmp`, `${this.file}.bin`)
    renameSync(`${this.file}.json.tmp`, `${this.file}.json`)
  }

  /**
   * Read the notes that are new or changed, about `budget` stretches of them
   * this time (always at least one note), and forget the ones that are gone.
   * Returns how many notes it read.
   */
  async update(notes: { path: string; mtime: number; chunks: () => string[] }[], embed: Embedder, budget = 128): Promise<number> {
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
      const todo: { path: string; mtime: number; texts: string[] }[] = []
      let count = 0
      for (const n of notes) {
        if (this.entries.get(n.path)?.mtime === n.mtime) continue
        const texts = n.chunks()
        if (todo.length && count + texts.length > budget) break
        todo.push({ path: n.path, mtime: n.mtime, texts })
        count += texts.length
      }
      // Sixteen stretches at a time, whichever notes they're from.
      const flat = todo.flatMap((t) => t.texts)
      const vs: Float32Array[] = []
      for (let i = 0; i < flat.length; i += 16) vs.push(...(await embed(flat.slice(i, i + 16))))
      let at = 0
      for (const t of todo) {
        const mine = vs.slice(at, at + t.texts.length)
        at += t.texts.length
        if (mine.length !== t.texts.length || mine.some((v) => !v || v.length !== DIMS)) continue
        const v = new Float32Array(mine.length * DIMS)
        mine.forEach((x, k) => v.set(unit(x), k * DIMS))
        this.entries.set(t.path, { mtime: t.mtime, n: mine.length, v })
        changed = true
      }
      if (changed) this.saveSoon()
      return todo.length
    } finally {
      this.busy = false
    }
  }

  /** The notes closest in meaning to the question, best first, each with its closest stretch. */
  async query(q: string, embed: Embedder, k = 30, under?: string): Promise<Near[]> {
    this.load()
    if (!this.entries.size) return []
    const [v] = await embed([queryText(q)])
    if (!v) return []
    const qv = unit(v)
    const dir = under ? under.replace(/\/?$/, '/') : ''
    const out: Near[] = []
    for (const [path, e] of this.entries) {
      if (dir && !path.startsWith(dir)) continue
      let best = -2
      let chunk = 0
      for (let i = 0; i < e.n; i++) {
        const s = cosine(qv, e.v.subarray(i * DIMS, (i + 1) * DIMS))
        if (s > best) {
          best = s
          chunk = i
        }
      }
      out.push({ path, score: best, chunk })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k)
  }

  /** Let go of the vectors when they haven't been used for a while (they're read from disk again when needed). */
  releaseIfIdle(idleMs: number, now = Date.now()): boolean {
    if (!this.loaded || this.busy || this.saveTimer || now - this.used < idleMs) return false
    this.entries.clear()
    this.loaded = false
    return true
  }

  exists(): boolean {
    return existsSync(`${this.file}.json`)
  }
}
