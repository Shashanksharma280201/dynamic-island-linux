/**
 * Search by meaning: each note as a vector from a small local model
 * (all-MiniLM-L6-v2), compared with the question's. The pure parts.
 */

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2'
export const EMBED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']
export const EMBED_MB = 23
export const DIMS = 384

/** What of a note the model reads: its title and the start of its body. Pure. */
export function embedText(title: string, body: string, max = 1200): string {
  const clean = body
    .replace(/^---[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/[#>*_`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${title}. ${clean}`.slice(0, max)
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
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]{3,}/gu)) {
    let h = 2166136261
    for (const c of m[0]) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    v[(h >>> 0) % DIMS] += 1
  }
  return unit(v)
}

/** Settings › Second brain › Search by meaning. */
export type MeaningView = { on: boolean; ready: boolean; downloading: boolean; progress: number; notes: number; error: string | null; sizeMb: number }
