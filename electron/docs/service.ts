import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { DocEntry, DocRecipe } from '@shared/docs'
import { KIND_LABEL, MAX_FILE_BYTES, freshPath, kindOf, pagesLabel, parsePages, stem, type DocKind } from './files'
import { chunkPages, deletePages, mergePdfs, pageCount, rotatePages, selectPages, splitPdf, stampPdf, type StampOptions } from './pdf'
import { readDocument, type ReadOptions, type ReadResult } from './read'
import { markdownToDocx, markdownToHtml } from './create'
import { editDocx, type DocxEdit } from './docxEdit'
import { editSheet, parseCsv, rowsToXlsx, type SheetEdit } from './sheet'
import { diffSummary } from './compare'
import { convertDocument, type ConvertDeps, type ConvertTarget } from './convert'

type Saved = { id: string; path: string; origin: 'added' | 'made'; at: number }

export type DocsDeps = ConvertDeps & {
  dataDir: string
  /** Where new files go (created if missing). */
  outDir: () => string
  /** The user's home folder: the agent may open documents in it by path. */
  home: () => string
  /** Folders docs_find may look in (only documents there are considered). */
  searchRoots: () => Record<string, string>
  /** Move a file to the Trash. */
  trash: (path: string) => Promise<void>
  /** Name used for tracked changes ("Sparky"). */
  author: () => string
  onChange: () => void
}

/** Most files kept in the list (the oldest results drop off first). */
const MAX_ENTRIES = 200

/**
 * The Documents workspace: files you added (by dropping or picking them) and
 * the files made from them. Every operation reads originals and writes a new
 * file to the output folder; nothing is ever overwritten.
 */
export class DocsService {
  private saved: Saved[] = []
  private meta = new Map<string, { size: number; pages?: number; mtime: number }>()
  private seq = 0
  private lastAt = 0

  constructor(private d: DocsDeps) {
    try {
      const j = JSON.parse(readFileSync(this.file('docs-workspace.json'), 'utf8'))
      if (Array.isArray(j.saved)) this.saved = j.saved.filter((s: any) => s && typeof s.path === 'string' && typeof s.id === 'string')
      this.seq = Number(j.seq) || this.saved.length
      this.lastAt = Math.max(0, ...this.saved.map((x) => Number(x.at) || 0))
    } catch {
      // first run
    }
  }

  /** Now, but always later than the last file added (so the order is exact). */
  private now(): number {
    this.lastAt = Math.max(Date.now(), this.lastAt + 1)
    return this.lastAt
  }

  private file(name: string) {
    return join(this.d.dataDir, name)
  }

  private persist(): void {
    try {
      mkdirSync(this.d.dataDir, { recursive: true })
      const f = this.file('docs-workspace.json')
      writeFileSync(f + '.tmp', JSON.stringify({ seq: this.seq, saved: this.saved }))
      renameSync(f + '.tmp', f)
    } catch (e) {
      console.error('[docs] save failed:', e)
    }
    this.d.onChange()
  }

  /** Size, pages and whether it still exists, cached by modification time. */
  private async describe(s: Saved): Promise<DocEntry> {
    const kind = kindOf(s.path) as DocKind
    const base: DocEntry = { id: s.id, name: basename(s.path), path: s.path, kind, origin: s.origin, at: s.at, size: 0, missing: true }
    try {
      const st = await stat(s.path)
      const hit = this.meta.get(s.path)
      if (hit && hit.mtime === st.mtimeMs) return { ...base, missing: false, size: hit.size, pages: hit.pages }
      let pages: number | undefined
      if (kind === 'pdf') pages = await pageCount(new Uint8Array(await readFile(s.path))).catch(() => undefined)
      this.meta.set(s.path, { size: st.size, pages, mtime: st.mtimeMs })
      return { ...base, missing: false, size: st.size, pages }
    } catch {
      return base
    }
  }

  /** Every file, newest first. */
  async list(): Promise<DocEntry[]> {
    const all = await Promise.all(this.saved.map((s) => this.describe(s)))
    // Newest first; the later id first when added in the same millisecond.
    const seq = (e: DocEntry) => Number(e.id.slice(1))
    return all.sort((a, b) => b.at - a.at || seq(b) - seq(a))
  }

  /** Add files (from a drop or the file picker). Unsupported ones are skipped with a reason. */
  async add(paths: string[]): Promise<{ added: DocEntry[]; skipped: { path: string; why: string }[] }> {
    const added: DocEntry[] = []
    const skipped: { path: string; why: string }[] = []
    for (const p of paths.slice(0, 100)) {
      if (typeof p !== 'string' || !isAbsolute(p)) {
        skipped.push({ path: String(p), why: 'not a file path' })
        continue
      }
      const path = resolve(p)
      if (!kindOf(path)) {
        skipped.push({ path, why: 'not a PDF, Word, Excel, CSV, PowerPoint, Markdown or text file' })
        continue
      }
      const st = await stat(path).catch(() => null)
      if (!st?.isFile()) {
        skipped.push({ path, why: 'not found' })
        continue
      }
      if (st.size > MAX_FILE_BYTES) {
        skipped.push({ path, why: 'larger than 200 MB' })
        continue
      }
      const existing = this.saved.find((s) => s.path === path)
      if (existing) {
        existing.at = this.now()
        added.push(await this.describe(existing))
        continue
      }
      const s: Saved = { id: `d${++this.seq}`, path, origin: 'added', at: this.now() }
      this.saved.push(s)
      added.push(await this.describe(s))
    }
    this.trim()
    if (added.length) this.persist()
    return { added, skipped }
  }

  /** Take files off the list (the files themselves stay where they are). */
  remove(ids: string[]): void {
    const before = this.saved.length
    this.saved = this.saved.filter((s) => !ids.includes(s.id))
    if (this.saved.length !== before) this.persist()
  }

  private trim(): void {
    while (this.saved.length > MAX_ENTRIES) {
      const oldest = [...this.saved].sort((a, b) => (a.origin === b.origin ? a.at - b.at : a.origin === 'made' ? -1 : 1))[0]
      this.saved = this.saved.filter((s) => s !== oldest)
    }
  }

  /** A file by id, path, exact name, or a unique part of its name. */
  async resolve(ref: string): Promise<DocEntry> {
    const r = ref.trim()
    const all = await this.list()
    const lower = r.toLowerCase()
    // An id never falls back to matching names ("d3" is in "Record3.pdf").
    if (/^d\d+$/.test(r)) {
      const byId = all.find((e) => e.id === r)
      if (!byId) throw new Error(`There’s no file ${r} in Documents any more. Use docs_list to see what’s there.`)
      if (byId.missing) throw new Error(`${byId.name} has been moved or deleted.`)
      return byId
    }
    const hit =
      all.find((e) => e.id === r) ??
      all.find((e) => e.path === r) ??
      all.find((e) => e.name.toLowerCase() === lower) ??
      (() => {
        const part = all.filter((e) => e.name.toLowerCase().includes(lower))
        if (part.length > 1) throw new Error(`“${r}” matches several files: ${part.map((e) => `${e.name} (${e.id})`).join(', ')}. Use the id.`)
        return part[0]
      })()
    if (!hit) {
      // A document by its path (in the home folder, outside hidden folders).
      const path = this.openable(r)
      if (path) {
        const { added, skipped } = await this.add([path])
        if (added[0]) return added[0]
        throw new Error(`Can’t open ${path}: ${skipped[0]?.why ?? 'not found'}.`)
      }
      throw new Error(`No file “${r}” in Documents. Use docs_list, or docs_find to look for it.`)
    }
    if (hit.missing) throw new Error(`${hit.name} has been moved or deleted.`)
    return hit
  }

  /**
   * The full path for "~/x.pdf" or "/home/me/x.pdf" when it's a document in
   * the home folder and not inside a hidden folder (settings, keys…), else null.
   */
  openable(ref: string): string | null {
    return kindOf(ref) ? homeFile(this.d.home(), ref) : null
  }

  /** The output folder as people see it: "~/Documents/Dynamic Island". */
  outLabel(): string {
    const dir = this.d.outDir()
    const home = this.d.home()
    return dir.startsWith(home + sep) ? `~${dir.slice(home.length)}` : dir
  }

  /** The output folder, created if needed. */
  async ensureOutDir(): Promise<string> {
    const dir = this.d.outDir()
    await mkdir(dir, { recursive: true })
    return dir
  }

  /** Save a result as a new file in the output folder, and list it. */
  async save(bytes: Uint8Array, name: string, ext: string): Promise<DocEntry> {
    const dir = await this.ensureOutDir()
    const path = freshPath(dir, name, ext)
    await writeFile(path, bytes, { flag: 'wx' }) // never overwrite
    const s: Saved = { id: `d${++this.seq}`, path, origin: 'made', at: this.now() }
    this.saved.push(s)
    this.trim()
    this.persist()
    return this.describe(s)
  }

  private async bytesOf(e: DocEntry): Promise<Uint8Array> {
    return new Uint8Array(await readFile(e.path))
  }

  private async needPdf(ref: string): Promise<DocEntry> {
    const e = await this.resolve(ref)
    if (e.kind !== 'pdf') throw new Error(`${e.name} isn’t a PDF. Convert it first (docs_convert to pdf).`)
    return e
  }

  /** Look for documents by name in the usual folders, and add what's found. */
  async find(query: string, where?: string): Promise<DocEntry[]> {
    const roots = this.d.searchRoots()
    const pick = where && roots[where] ? { [where]: roots[where] } : roots
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) throw new Error('Say what to look for, like “invoice march”.')
    const hits: { path: string; mtime: number }[] = []
    let scanned = 0
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 4 || scanned > 20_000) return
      const items = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const it of items) {
        if (it.name.startsWith('.') || it.name === 'node_modules') continue
        const p = join(dir, it.name)
        if (it.isDirectory()) await walk(p, depth + 1)
        else if (it.isFile() && kindOf(p)) {
          scanned++
          const name = it.name.toLowerCase()
          if (words.every((w) => name.includes(w))) {
            const st = await stat(p).catch(() => null)
            if (st) hits.push({ path: p, mtime: st.mtimeMs })
          }
        }
      }
    }
    for (const root of Object.values(pick)) await walk(root, 0)
    const best = hits.sort((a, b) => b.mtime - a.mtime).slice(0, 10)
    return (await this.add(best.map((h) => h.path))).added
  }

  read(e: DocEntry, o: ReadOptions): Promise<ReadResult> {
    return readDocument(e.path, o)
  }

  // ---------------------------------------------------------------- PDF ----

  async merge(refs: string[], name?: string): Promise<DocEntry> {
    const files = await Promise.all(refs.map((r) => this.needPdf(r)))
    const bytes = await mergePdfs(await Promise.all(files.map((f) => this.bytesOf(f))))
    return this.save(bytes, name || `${stem(files[0].path)} (merged)`, 'pdf')
  }

  async pages(ref: string, spec: string, mode: 'keep' | 'delete', name?: string): Promise<{ entry: DocEntry; label: string }> {
    const e = await this.needPdf(ref)
    const bytes = await this.bytesOf(e)
    const idx = parsePages(spec, await pageCount(bytes))
    const out = mode === 'delete' ? await deletePages(bytes, idx) : await selectPages(bytes, idx)
    const label = pagesLabel(idx)
    return { entry: await this.save(out, name || `${stem(e.path)} (${mode === 'delete' ? 'without' : 'pages'} ${label})`, 'pdf'), label }
  }

  async rotate(ref: string, by: number, spec?: string, name?: string): Promise<DocEntry> {
    const e = await this.needPdf(ref)
    const bytes = await this.bytesOf(e)
    const idx = spec ? parsePages(spec, await pageCount(bytes)) : undefined
    return this.save(await rotatePages(bytes, by, idx), name || `${stem(e.path)} (rotated)`, 'pdf')
  }

  async split(ref: string, o: { every?: number; ranges?: string[] }): Promise<DocEntry[]> {
    const e = await this.needPdf(ref)
    const bytes = await this.bytesOf(e)
    const count = await pageCount(bytes)
    const groups = o.ranges?.length ? o.ranges.map((r) => parsePages(r, count)) : chunkPages(count, o.every ?? 1)
    if (groups.length > 200) throw new Error('That would make more than 200 files.')
    const parts = await splitPdf(bytes, groups)
    const out: DocEntry[] = []
    for (const [i, part] of parts.entries()) out.push(await this.save(part, `${stem(e.path)} (part ${i + 1}, pages ${pagesLabel(groups[i])})`, 'pdf'))
    return out
  }

  async stamp(ref: string, o: StampOptions, name?: string): Promise<DocEntry> {
    const e = await this.needPdf(ref)
    return this.save(await stampPdf(await this.bytesOf(e), o), name || `${stem(e.path)} (${o.text ? 'stamped' : 'numbered'})`, 'pdf')
  }

  // --------------------------------------------------- Word, sheets, more ----

  async editWord(ref: string, edits: DocxEdit[], tracked: boolean): Promise<{ entry: DocEntry; applied: { find: string; count: number }[]; notFound: string[] }> {
    const e = await this.resolve(ref)
    if (e.kind !== 'docx') throw new Error(`${e.name} isn’t a Word (.docx) file.`)
    const r = await editDocx(await this.bytesOf(e), edits, { tracked, author: this.d.author() })
    if (!r.applied.length) throw new Error(`None of the text to change was found in ${e.name}: ${r.notFound.map((f) => `“${f}”`).join(', ')}. Copy it exactly as it appears in the document (within one paragraph).`)
    const entry = await this.save(r.bytes, `${stem(e.path)} (${tracked ? 'corrected, tracked changes' : 'corrected'})`, 'docx')
    return { entry, applied: r.applied, notFound: r.notFound }
  }

  async editSheet(ref: string, edit: SheetEdit): Promise<{ entry: DocEntry; summary: string[] }> {
    const e = await this.resolve(ref)
    if (e.kind !== 'xlsx') throw new Error(`${e.name} isn’t an Excel (.xlsx) file.${e.kind === 'csv' ? ' Convert it to xlsx first.' : ''}`)
    const r = await editSheet(await this.bytesOf(e), edit)
    return { entry: await this.save(r.bytes, `${stem(e.path)} (edited)`, 'xlsx'), summary: r.summary }
  }

  async convert(ref: string, to: ConvertTarget): Promise<{ entry: DocEntry; note?: string }> {
    const e = await this.resolve(ref)
    const r = await convertDocument(e.path, to, this.d)
    return { entry: await this.save(r.bytes, stem(e.path), r.ext), note: r.note }
  }

  async create(name: string, format: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'md' | 'txt', content: string): Promise<DocEntry> {
    if (!content.trim()) throw new Error('The document is empty.')
    switch (format) {
      case 'docx':
        return this.save(await markdownToDocx(content, name), name, 'docx')
      case 'pdf':
        return this.save(await this.d.printPdf(markdownToHtml(content, name)), name, 'pdf')
      case 'xlsx':
        return this.save(await rowsToXlsx(parseCsv(content), name), name, 'xlsx')
      default:
        return this.save(Buffer.from(content), name, format)
    }
  }

  async compare(a: string, b: string): Promise<{ text: string; added: number; removed: number; names: [string, string] }> {
    const [ea, eb] = [await this.resolve(a), await this.resolve(b)]
    const [ta, tb] = [await readDocument(ea.path), await readDocument(eb.path)]
    return { ...diffSummary(ta.text, tb.text), names: [ea.name, eb.name] }
  }

  async trash(ref: string): Promise<string> {
    const e = await this.resolve(ref)
    await this.d.trash(e.path)
    this.remove([e.id])
    return e.name
  }

  // ------------------------------------------------------------- recipes ----

  recipes(): DocRecipe[] {
    try {
      const j = JSON.parse(readFileSync(this.file('docs-recipes.json'), 'utf8'))
      return Array.isArray(j) ? j.filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.instruction === 'string') : []
    } catch {
      return []
    }
  }

  saveRecipe(r: { id?: string; name: string; instruction: string }): DocRecipe[] {
    const name = r.name.trim().slice(0, 40)
    const instruction = r.instruction.trim().slice(0, 2000)
    if (!name || !instruction) throw new Error('A recipe needs a name and what to do.')
    const list = this.recipes()
    const id = r.id && list.some((x) => x.id === r.id) ? r.id : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const next = [...list.filter((x) => x.id !== id), { id, name, instruction }]
    mkdirSync(this.d.dataDir, { recursive: true })
    writeFileSync(this.file('docs-recipes.json'), JSON.stringify(next, null, 2))
    this.d.onChange()
    return next
  }

  removeRecipe(id: string): DocRecipe[] {
    const next = this.recipes().filter((r) => r.id !== id)
    writeFileSync(this.file('docs-recipes.json'), JSON.stringify(next, null, 2))
    this.d.onChange()
    return next
  }
}

/**
 * The full path for "~/x" or "/home/me/x" when it's in the home folder and not
 * inside a hidden folder (settings, keys…), else null. Pure.
 */
export function homeFile(home: string, ref: string): string | null {
  const p = ref.startsWith('~/') ? join(home, ref.slice(2)) : ref
  if (!isAbsolute(p)) return null
  const full = resolve(p)
  const rel = relative(home, full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.split(sep).some((part) => part.startsWith('.')) ? null : full
}

/** "Invoice.pdf (d7) · PDF · 6 pages" for messages. Pure. */
export function describeEntry(e: DocEntry): string {
  return `${e.name} (id ${e.id}) · ${KIND_LABEL[e.kind]}${e.pages ? ` · ${e.pages} page${e.pages === 1 ? '' : 's'}` : ''}`
}
