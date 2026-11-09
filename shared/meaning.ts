/**
 * Search by meaning: each section of a note as a vector from a small local
 * model (bge-small-en-v1.5), compared with the question's. The pure parts.
 */

export const EMBED_MODEL = 'Xenova/bge-small-en-v1.5'
export const EMBED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']
export const EMBED_MB = 34
export const DIMS = 384
/** How the model makes one vector of a text's words: BGE takes its first token's ([CLS]). */
export const EMBED_POOLING: 'cls' | 'mean' = 'cls'
/** What the model wants before a question, to find the passages that answer it. */
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
/** Notes found only by meaning must be at least this close to the question (cosine, for this model). */
export const MEANING_MIN = 0.5
/** Models used before, whose files can go once this one is in use. */
export const OLD_EMBED_MODELS = ['Xenova/all-MiniLM-L6-v2']

/** One stretch of a note the model reads on its own: a section, or part of a long one. */
export type Chunk = { heading: string; text: string }

/** Markdown made plain: links as their words, no marks, one line. Pure. */
function plain(s: string): string {
  return s
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A long paragraph in pieces of at most `size`, cut between sentences where it can be. Pure. */
function pieces(p: string, size: number): string[] {
  if (p.length <= size) return [p]
  const out: string[] = []
  let cur = ''
  for (const s of p.split(/(?<=[.!?])\s+/)) {
    for (let i = 0; i < s.length; i += size) {
      const part = s.slice(i, i + size)
      if (cur && cur.length + 1 + part.length > size) {
        out.push(cur)
        cur = ''
      }
      cur = cur ? `${cur} ${part}` : part
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * A note in the stretches the model reads, each about `size` characters: its
 * sections (split at headings), a long one cut between paragraphs, short ones
 * next to each other read together. At most `max` of them; a note with no
 * text is one empty stretch (its title is still read). Pure.
 */
export function noteChunks(body: string, size = 900, max = 32): Chunk[] {
  const clean = body
    .replace(/^---[\s\S]*?\n---\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
  // Sections: the text under each heading, in paragraphs.
  const sections: { heading: string; paras: string[] }[] = []
  let cur = { heading: '', paras: [] as string[] }
  let para: string[] = []
  const endPara = () => {
    const p = plain(para.join(' '))
    if (p) cur.paras.push(p)
    para = []
  }
  for (const line of clean.split('\n')) {
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line)
    if (h) {
      endPara()
      if (cur.heading || cur.paras.length) sections.push(cur)
      cur = { heading: plain(h[1]), paras: [] }
    } else if (!line.trim()) endPara()
    else para.push(line.replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, ''))
  }
  endPara()
  if (cur.heading || cur.paras.length) sections.push(cur)
  // Each section in stretches of about `size`; a heading with nothing under it adds nothing.
  const out: Chunk[] = []
  for (const s of sections) {
    let text = ''
    const flush = () => {
      if (text) out.push({ heading: s.heading, text })
      text = ''
    }
    for (const p of s.paras.flatMap((x) => pieces(x, size))) {
      if (text && text.length + 1 + p.length > size) flush()
      text = text ? `${text} ${p}` : p
    }
    flush()
  }
  // Short stretches read together with the next, under the first one's heading.
  const merged: Chunk[] = []
  for (const c of out) {
    const last = merged[merged.length - 1]
    const add = c.heading ? `${c.heading}: ${c.text}` : c.text
    if (last && last.text.length < size / 3 && last.text.length + 1 + add.length <= size) last.text = `${last.text} ${add}`
    else merged.push({ ...c })
  }
  return merged.length ? merged.slice(0, max) : [{ heading: '', text: '' }]
}

/** What the model reads of one stretch: the note's title, the section's heading, its text. Pure. */
export function chunkText(title: string, c: Chunk): string {
  return [title, c.heading, c.text].filter(Boolean).join('. ')
}

/** The question as the model wants it. Pure. */
export function queryText(q: string): string {
  return QUERY_PREFIX + q.trim()
}

/** Cosine similarity of two unit vectors (a dot product). Pure. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** A vector scaled to length 1. Pure. */
export function unit(v: Float32Array): Float32Array {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}

/**
 * Two rankings made one (reciprocal rank fusion): a note near the top of
 * either list ranks well, near the top of both ranks best. Pure.
 */
export function fuse(lists: string[][], k = 60): { path: string; score: number }[] {
  const score = new Map<string, number>()
  for (const list of lists) list.forEach((p, i) => score.set(p, (score.get(p) ?? 0) + 1 / (k + i + 1)))
  return [...score.entries()].map(([path, s]) => ({ path, score: s })).sort((a, b) => b.score - a.score)
}

/**
 * A stand-in for the model in tests: words hashed into the vector, so notes
 * that share words come out close. Deterministic. Pure.
 */
export function hashEmbed(text: string): Float32Array {
  const v = new Float32Array(DIMS)
  for (const m of text.replace(QUERY_PREFIX, '').toLowerCase().matchAll(/[\p{L}\p{N}]{3,}/gu)) {
    let h = 2166136261
    for (const c of m[0]) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    v[(h >>> 0) % DIMS] += 1
  }
  return unit(v)
}

/** Settings › Second brain › Search by meaning. */
export type MeaningView = { on: boolean; ready: boolean; downloading: boolean; progress: number; notes: number; error: string | null; sizeMb: number }
