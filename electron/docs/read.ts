import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { kindOf, parsePages, pagesLabel, type DocKind } from './files'

const require = createRequire(import.meta.url)

/** Most text handed to the agent in one go (about 11k tokens; under the 50k cap on a tool result). */
export const MAX_READ_CHARS = 45_000

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsP: Promise<PdfJs> | null = null
const pdfjs = () => (pdfjsP ??= import('pdfjs-dist/legacy/build/pdf.mjs'))
const fontsDir = () => {
  const dir = join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')
  return pathToFileURL(dir).href + '/'
}

/** Open a PDF with pdf.js for reading text; `close()` frees it. */
export async function openPdfText(bytes: Uint8Array) {
  const lib = await pdfjs()
  const task = lib.getDocument({
    data: new Uint8Array(bytes), // pdf.js takes ownership of the buffer
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    standardFontDataUrl: fontsDir(),
    verbosity: lib.VerbosityLevel.ERRORS,
  })
  try {
    const doc = await task.promise
    return Object.assign(doc, { close: () => task.destroy() })
  } catch (e: any) {
    await task.destroy()
    if (e?.name === 'PasswordException') throw new Error('This PDF is password-protected, so it can’t be read.')
    throw new Error(`This PDF couldn’t be read (${String(e?.message ?? e).slice(0, 120)}).`)
  }
}

/** Text of each page (pages are 0-based indexes). */
export async function pdfPageTexts(bytes: Uint8Array, indexes?: number[]): Promise<{ page: number; text: string }[]> {
  const doc = await openPdfText(bytes)
  try {
    const want = indexes ?? Array.from({ length: doc.numPages }, (_, i) => i)
    const out: { page: number; text: string }[] = []
    for (const i of want) {
      const page = await doc.getPage(i + 1)
      const tc = await page.getTextContent()
      let text = ''
      for (const item of tc.items as Array<{ str?: string; hasEOL?: boolean }>) {
        if (typeof item.str !== 'string') continue
        text += item.str + (item.hasEOL ? '\n' : '')
      }
      out.push({ page: i, text: text.replace(/[ \t]+\n/g, '\n').trim() })
      page.cleanup()
    }
    return out
  } finally {
    await doc.close()
  }
}

export type ReadOptions = {
  /** PDF pages like "1-3" (default: all). */
  pages?: string
  /** Spreadsheet: only this sheet. */
  sheet?: string
}

export type ReadResult = { kind: DocKind; text: string; truncated: boolean; note?: string }

const cap = (text: string, kind: DocKind, note?: string): ReadResult => {
  const truncated = text.length > MAX_READ_CHARS
  return { kind, text: truncated ? text.slice(0, MAX_READ_CHARS) : text, truncated, note }
}

/** Column letters for a 1-based column number: 1 → A, 28 → AB. Pure. */
export function colName(n: number): string {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

/** A cell value as plain text (dates, rich text, hyperlinks, errors). Pure. */
export function cellText(v: any): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 16 : 10).replace('T', ' ')
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('')
    if ('text' in v && typeof v.text === 'string') return v.text // hyperlink
    if ('error' in v) return String(v.error)
    if ('formula' in v || 'sharedFormula' in v) return cellText(v.result)
    return JSON.stringify(v)
  }
  return String(v)
}

/**
 * A workbook as text the agent can reason about and point at: every row
 * with its cell references, and formulas with their last result.
 */
export async function xlsxText(bytes: Uint8Array, only?: string): Promise<string> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as any)
  const sheets = wb.worksheets.filter((ws) => !only || ws.name.toLowerCase() === only.toLowerCase())
  if (only && !sheets.length) throw new Error(`There’s no sheet called “${only}”. Sheets: ${wb.worksheets.map((w) => w.name).join(', ')}.`)
  const parts: string[] = []
  for (const ws of sheets) {
    const rows: string[] = []
    const formulas: string[] = []
    let shown = 0
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (shown >= 400) return
      const cells: string[] = []
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > 60) return
        const ref = `${colName(c)}${r}`
        const v: any = cell.value
        if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) {
          formulas.push(`${ref} = ${v.formula ?? v.sharedFormula} → ${cellText(v.result)}`)
        }
        const t = cellText(v).replace(/\s+/g, ' ').trim()
        if (t) cells.push(`${ref}: ${t}`)
      })
      if (cells.length) {
        rows.push(cells.join(' | '))
        shown++
      }
    })
    const more = ws.actualRowCount > shown ? `\n(${ws.actualRowCount - shown} more rows not shown)` : ''
    parts.push(
      `Sheet “${ws.name}” (${ws.actualRowCount} rows × ${ws.actualColumnCount} columns)\n${rows.join('\n') || '(empty)'}${more}` +
        (formulas.length ? `\nFormulas:\n${formulas.slice(0, 200).join('\n')}` : ''),
    )
  }
  return parts.join('\n\n')
}

/** Text of each slide of a PowerPoint file. */
export async function pptxText(bytes: Uint8Array): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  const slides = Object.keys(zip.files)
    .map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  const out: string[] = []
  for (const m of slides) {
    const xml = await zip.file(m[0])!.async('string')
    const paras = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((p) =>
      [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(''),
    )
    out.push(`--- Slide ${m[1]} ---\n${paras.filter((t) => t.trim()).join('\n')}`)
  }
  return out.join('\n\n')
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** A document's text, for reading and reviewing. */
export async function readDocument(path: string, o: ReadOptions = {}): Promise<ReadResult> {
  const kind = kindOf(path)
  if (!kind) throw new Error('That kind of file isn’t supported.')
  const bytes = new Uint8Array(await readFile(path))
  switch (kind) {
    case 'pdf': {
      const doc = await openPdfText(bytes)
      const count = doc.numPages
      await doc.close()
      const indexes = o.pages ? parsePages(o.pages, count) : undefined
      const pages = await pdfPageTexts(bytes, indexes)
      const empty = pages.every((p) => !p.text)
      const text = pages.map((p) => `--- Page ${p.page + 1} of ${count} ---\n${p.text || '(no text on this page)'}`).join('\n\n')
      return cap(text, kind, empty ? 'This PDF has no text layer (probably a scan), so its words can’t be read yet.' : indexes ? `Pages ${pagesLabel(indexes)} of ${count}.` : undefined)
    }
    case 'docx': {
      const mammoth = (await import('mammoth')).default
      const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
      return cap(r.value.replace(/\n{3,}/g, '\n\n').trim(), kind)
    }
    case 'xlsx':
      return cap(await xlsxText(bytes, o.sheet), kind)
    case 'pptx':
      return cap(await pptxText(bytes), kind)
    default:
      return cap(Buffer.from(bytes).toString('utf8'), kind)
  }
}
