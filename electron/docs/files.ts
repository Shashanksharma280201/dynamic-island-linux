import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import type { DocKind } from '@shared/docs'

export { KIND_LABEL, sizeLabel, type DocKind } from '@shared/docs'

const EXT: Record<string, DocKind> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.csv': 'csv',
  '.pptx': 'pptx',
  '.md': 'md',
  '.markdown': 'md',
  '.txt': 'txt',
}

/** The document kind of a file name, or null if it isn't one we handle. Pure. */
export function kindOf(path: string): DocKind | null {
  return EXT[extname(path).toLowerCase()] ?? null
}

/** Largest file we'll open (bigger ones are likely scans or videos in disguise). */
export const MAX_FILE_BYTES = 200 * 1024 * 1024

/** A file name without characters that break paths, and not empty. Pure. */
export function safeName(name: string, fallback = 'Document'): string {
  const clean = name
    .replace(/[/\\\0]/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return clean || fallback
}

/**
 * A path in `dir` for a new file called `name` with extension `ext` that
 * doesn't exist yet: "Report.pdf", then "Report (2).pdf"… Never overwrites.
 */
export function freshPath(dir: string, name: string, ext: string, exists: (p: string) => boolean = existsSync): string {
  const dot = ext.startsWith('.') ? ext : `.${ext}`
  let base = safeName(name)
  if (base.toLowerCase().endsWith(dot.toLowerCase())) base = base.slice(0, -dot.length).trim() || 'Document'
  let p = join(dir, base + dot)
  for (let i = 2; exists(p); i++) p = join(dir, `${base} (${i})${dot}`)
  return p
}

/** "contract.docx" → "contract". Pure. */
export function stem(path: string): string {
  const b = basename(path)
  const e = extname(b)
  return e ? b.slice(0, -e.length) : b
}

/**
 * Page numbers from a spec like "1-3, 5, 8-" or "last" for a document of
 * `count` pages, as 0-based indexes in the order given (so it can reorder or
 * repeat). Throws with a readable message on anything out of range. Pure.
 */
export function parsePages(spec: string, count: number): number[] {
  const out: number[] = []
  const parts = spec
    .toLowerCase()
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) throw new Error('Say which pages, like "1-3, 5".')
  const num = (s: string): number => {
    if (s === 'last' || s === 'end') return count
    if (s === 'first') return 1
    const n = Number(s)
    if (!Number.isInteger(n)) throw new Error(`“${s}” isn’t a page number.`)
    return n
  }
  for (const part of parts) {
    if (part === 'all') {
      for (let i = 0; i < count; i++) out.push(i)
      continue
    }
    if (part === 'odd' || part === 'even') {
      for (let i = part === 'odd' ? 0 : 1; i < count; i += 2) out.push(i)
      continue
    }
    const m = /^(\w+)?\s*[-–]\s*(\w+)?$/.exec(part)
    const [a, b] = m ? [m[1] ? num(m[1]) : 1, m[2] ? num(m[2]) : count] : [num(part), num(part)]
    for (const n of [a, b]) {
      if (n < 1 || n > count) throw new Error(`Page ${n} doesn’t exist: the document has ${count} page${count === 1 ? '' : 's'}.`)
    }
    if (a <= b) for (let i = a; i <= b; i++) out.push(i - 1)
    else for (let i = a; i >= b; i--) out.push(i - 1) // "5-3" counts down
  }
  return out
}

/** "1-3, 5" for a list of 0-based page indexes (for messages). Pure. */
export function pagesLabel(indexes: number[]): string {
  const sorted = [...new Set(indexes)].sort((x, y) => x - y)
  const ranges: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    ranges.push(i === j ? `${sorted[i] + 1}` : `${sorted[i] + 1}-${sorted[j] + 1}`)
    i = j + 1
  }
  return ranges.join(', ')
}

