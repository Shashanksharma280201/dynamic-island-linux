import { embedText } from '@shared/meaning'
import { noteTitle, parseNote, wikilinks } from '@shared/brain'
import type { VaultFile } from './vault'

const STOP = new Set(
  'a an and are as at be but by for from has have i if in into is it its me my not of on or our so that the their them then there these they this to was we were what when where which who will with you your'.split(
    ' ',
  ),
)

/** Light stemming so "notes" finds "note" and "testing" finds "test". Pure. */
export function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** The search words in a text. Pure. */
export function words(text: string): string[] {
  const out: string[] = []
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0]
    if (w.length < 2 || STOP.has(w)) continue
    out.push(stem(w))
  }
  return out
}

type Doc = {
  path: string
  mtime: number
  title: string
  meta: Record<string, string | string[]>
  /** Weighted term counts: title words count 3, frontmatter 2, body 1. */
  tf: Map<string, number>
  len: number
  links: string[]
}

export type Hit = { path: string; title: string; score: number; snippet: string; date?: string; type?: string }

/**
 * Keyword search over the vault (BM25), helped by links: a note many others
 * link to ranks a little higher. Rebuilt from the files as they change, so it
 * never needs a database or a separate index to keep in step.
 */
export class BrainIndex {
  private docs = new Map<string, Doc>()
  private df = new Map<string, number>()
  private backlinks = new Map<string, Set<string>>()
  private avgLen = 1
  private dirty = true
  private used = 0

  constructor(
    private readonly list: () => VaultFile[],
    private readonly read: (path: string) => string | null,
  ) {}

  /** Bring the index up to date with the files (cheap when little changed). */
  refresh(): void {
    this.used = Date.now()
    const files = this.list()
    const seen = new Set<string>()
    for (const f of files) {
      seen.add(f.path)
      const known = this.docs.get(f.path)
      if (known && known.mtime === f.mtime) continue
      const text = f.size > 2_000_000 ? '' : (this.read(f.path) ?? '')
      this.docs.set(f.path, this.parse(f.path, f.mtime, text))
      this.dirty = true
    }
    for (const p of [...this.docs.keys()]) {
      if (!seen.has(p)) {
        this.docs.delete(p)
        this.dirty = true
      }
    }
    if (this.dirty) this.rebuild()
  }

  private parse(path: string, mtime: number, text: string): Doc {
    const { meta, body } = parseNote(text)
    const title = noteTitle(path, body)
    const tf = new Map<string, number>()
    const add = (ws: string[], weight: number) => {
      for (const w of ws) tf.set(w, (tf.get(w) ?? 0) + weight)
    }
    add(words(title + ' ' + path.replace(/[/_.-]/g, ' ')), 3)
    add(words(Object.values(meta).flat().join(' ')), 2)
    const bodyWords = words(body)
    add(bodyWords, 1)
    return { path, mtime, title, meta, tf, len: bodyWords.length + 10, links: wikilinks(text) }
  }

  private rebuild(): void {
    this.df.clear()
    this.backlinks.clear()
    let total = 0
    for (const d of this.docs.values()) {
      total += d.len
      for (const w of d.tf.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1)
      for (const l of d.links) {
        const key = l.split('/').pop()!.toLowerCase()
        if (!this.backlinks.has(key)) this.backlinks.set(key, new Set())
        this.backlinks.get(key)!.add(d.path)
      }
    }
    this.avgLen = this.docs.size ? total / this.docs.size : 1
    this.dirty = false
  }

  size(): number {
    return this.docs.size
  }

  /** Let go of the index when it hasn't been used for a while (it rebuilds on the next search). */
  releaseIfIdle(idleMs: number, now = Date.now()): boolean {
    if (!this.docs.size || now - this.used < idleMs) return false
    this.docs.clear()
    this.df.clear()
    this.backlinks.clear()
    this.dirty = true
    return true
  }

  private body(path: string): string {
    return parseNote(this.read(path) ?? '').body
  }

  search(query: string, o: { limit?: number; under?: string } = {}): Hit[] {
    this.refresh()
    const terms = [...new Set(words(query))]
    if (!terms.length) return []
    const N = this.docs.size
    const k1 = 1.2
    const b = 0.75
    const hits: Hit[] = []
    for (const d of this.docs.values()) {
      if (o.under && !d.path.startsWith(o.under.replace(/\/+$/, '') + '/')) continue
      let score = 0
      let matched = 0
      for (const t of terms) {
        const f = d.tf.get(t)
        if (!f) continue
        matched++
        const n = this.df.get(t) ?? 0
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / this.avgLen))
      }
      if (!score) continue
      // Notes that match every word first; then a little for being linked to.
      score *= 0.5 + 0.5 * (matched / terms.length)
      const name = d.path.split('/').pop()!.replace(/\.md$/i, '').toLowerCase()
      score *= 1 + Math.log1p(this.backlinks.get(name)?.size ?? 0) * 0.15
      hits.push({ path: d.path, title: d.title, score, snippet: '', date: str(d.meta.date), type: str(d.meta.type) })
    }
    const top = hits.sort((a, b) => b.score - a.score).slice(0, Math.min(o.limit ?? 8, 30))
    for (const h of top) h.snippet = snippet(this.body(h.path), terms)
    return top
  }

  /** Every note, for search by meaning: its path, when it changed, and what the model reads. */
  entries(): { path: string; mtime: number; text: () => string }[] {
    this.refresh()
    return [...this.docs.values()].map((d) => ({ path: d.path, mtime: d.mtime, text: () => embedText(d.title, this.body(d.path)) }))
  }

  /** One note as a search hit (for one found by meaning), with the start of its body. */
  describe(path: string): Hit | null {
    const d = this.docs.get(path)
    if (!d) return null
    const body = this.body(path).replace(/^#.*\n/, '').replace(/\s+/g, ' ').trim()
    return { path, title: d.title, score: 0, snippet: body.slice(0, 200) + (body.length > 200 ? '…' : ''), date: str(d.meta.date), type: str(d.meta.type) }
  }

  /** Notes that link to a note name (its file name without .md). */
  linksTo(name: string): { path: string; line: string }[] {
    this.refresh()
    const key = name.toLowerCase()
    const out: { path: string; line: string }[] = []
    for (const p of this.backlinks.get(key) ?? []) {
      const d = this.docs.get(p)
      if (!d) continue
      const line = this.body(p).split('\n').find((l) => wikilinks(l).some((x) => x.split('/').pop()!.toLowerCase() === key)) ?? ''
      out.push({ path: p, line: line.trim().slice(0, 240) })
    }
    return out.sort((a, b) => (this.docs.get(b.path)?.mtime ?? 0) - (this.docs.get(a.path)?.mtime ?? 0))
  }

  /** The note whose file name is `name` (any case), if there is one. */
  find(name: string): string | null {
    this.refresh()
    const key = name.replace(/\.md$/i, '').toLowerCase()
    let best: Doc | null = null
    for (const d of this.docs.values()) {
      if (d.path.split('/').pop()!.replace(/\.md$/i, '').toLowerCase() !== key) continue
      if (!best || d.path.length < best.path.length) best = d
    }
    return best?.path ?? null
  }

  /** Notes changed most recently. */
  recent(o: { since?: number; under?: string; limit?: number } = {}): { path: string; title: string; mtime: number }[] {
    this.refresh()
    return [...this.docs.values()]
      .filter((d) => (!o.since || d.mtime >= o.since) && (!o.under || d.path.startsWith(o.under.replace(/\/+$/, '') + '/')))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, o.limit ?? 20)
      .map((d) => ({ path: d.path, title: d.title, mtime: d.mtime }))
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

/** The lines of a body that best show why it matched. Pure. */
export function snippet(body: string, terms: string[], max = 280): string {
  const lines = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  let best = ''
  let bestScore = -1
  for (const l of lines) {
    const ws = new Set(words(l))
    const s = terms.filter((t) => ws.has(t)).length
    if (s > bestScore) {
      best = l
      bestScore = s
    }
  }
  const out = (bestScore > 0 ? best : lines.find((l) => !l.startsWith('#')) ?? '').replace(/\s+/g, ' ')
  return out.length > max ? out.slice(0, max - 1) + '…' : out
}
