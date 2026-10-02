import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kindOf, stem, KIND_LABEL, type DocKind } from './files'
import { pdfPageTexts } from './read'
import { markdownToDocx, markdownToHtml, rowsToHtml, rowsToMarkdown, textToDocx, wrapHtml } from './create'
import { parseCsv, rowsToXlsx, toCsv, xlsxRows } from './sheet'

export type ConvertTarget = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md'
export const CONVERT_TARGETS: ConvertTarget[] = ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md']

export type ConvertDeps = {
  /** Print an HTML page to PDF (an offscreen Electron window). */
  printPdf: (html: string) => Promise<Uint8Array>
  /** LibreOffice's command, when installed (best fidelity for Office files). */
  soffice: () => string | null
}

export type Converted = { bytes: Uint8Array; ext: ConvertTarget; note?: string }

/** Which conversions exist (from → to), for the agent and the quick actions. Pure. */
export function canConvert(from: DocKind, to: ConvertTarget, hasLibreOffice: boolean): boolean {
  if (from === to) return false
  switch (to) {
    case 'pdf':
      return from === 'pptx' ? hasLibreOffice : true
    case 'docx':
      return from !== 'pptx' || hasLibreOffice
    case 'xlsx':
      return from === 'csv'
    case 'csv':
      return from === 'xlsx'
    case 'txt':
    case 'md':
      return true
  }
}

/** Convert an Office file with LibreOffice into a temporary folder; returns the bytes. */
async function viaLibreOffice(soffice: string, path: string, to: 'pdf' | 'docx'): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'island-convert-'))
  try {
    // Its own profile, so it works even while LibreOffice is open.
    const profile = `-env:UserInstallation=file://${join(dir, 'profile')}`
    await new Promise<void>((resolve, reject) =>
      execFile(soffice, [profile, '--headless', '--norestore', '--convert-to', to, '--outdir', dir, path], { timeout: 120_000 }, (e) => (e ? reject(e) : resolve())),
    )
    return new Uint8Array(await readFile(join(dir, `${stem(path)}.${to}`)))
  } catch (e: any) {
    throw new Error(`LibreOffice couldn’t convert it (${String(e?.message ?? e).split('\n')[0].slice(0, 160)}).`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** All the text of a document (no length limit), page by page for PDFs. */
async function pagesOf(path: string, kind: DocKind, bytes: Uint8Array): Promise<string[]> {
  switch (kind) {
    case 'pdf':
      return (await pdfPageTexts(bytes)).map((p) => p.text)
    case 'docx': {
      const mammoth = (await import('mammoth')).default
      return [(await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value]
    }
    case 'xlsx':
      return [toCsv(await xlsxRows(bytes))]
    case 'pptx': {
      const { pptxText } = await import('./read')
      return (await pptxText(bytes)).split(/\n(?=--- Slide )/)
    }
    default:
      return [Buffer.from(bytes).toString('utf8')]
  }
}

/** Convert a document; the original is only read. */
export async function convertDocument(path: string, to: ConvertTarget, d: ConvertDeps): Promise<Converted> {
  const from = kindOf(path)
  if (!from) throw new Error('That kind of file isn’t supported.')
  const soffice = d.soffice()
  if (!canConvert(from, to, !!soffice)) {
    if (from === to) throw new Error(`It’s already a ${KIND_LABEL[from]} file.`)
    if (from === 'pptx') throw new Error('Converting PowerPoint files needs LibreOffice (sudo apt install libreoffice).')
    throw new Error(`A ${KIND_LABEL[from]} file can’t be turned into ${to.toUpperCase()}.`)
  }
  const bytes = new Uint8Array(await readFile(path))
  const title = stem(path)
  const text = async () => (await pagesOf(path, from, bytes)).join('\n\n')
  switch (to) {
    case 'txt':
      return { bytes: Buffer.from(await text()), ext: 'txt' }
    case 'md': {
      if (from === 'xlsx' || from === 'csv') {
        const rows = from === 'xlsx' ? await xlsxRows(bytes) : parseCsv(Buffer.from(bytes).toString('utf8'))
        return { bytes: Buffer.from(rowsToMarkdown(rows) + '\n'), ext: 'md' }
      }
      return { bytes: Buffer.from(await text()), ext: 'md', note: from === 'pdf' ? 'Text only: the layout of a PDF can’t be kept.' : undefined }
    }
    case 'csv':
      return { bytes: Buffer.from(toCsv(await xlsxRows(bytes))), ext: 'csv', note: 'The first sheet, as values.' }
    case 'xlsx':
      return { bytes: await rowsToXlsx(parseCsv(Buffer.from(bytes).toString('utf8')), title), ext: 'xlsx' }
    case 'docx': {
      if (from === 'md') return { bytes: await markdownToDocx(Buffer.from(bytes).toString('utf8'), title), ext: 'docx' }
      if (from === 'xlsx' || from === 'csv') {
        const rows = from === 'xlsx' ? await xlsxRows(bytes) : parseCsv(Buffer.from(bytes).toString('utf8'))
        return { bytes: await markdownToDocx(rowsToMarkdown(rows), title), ext: 'docx' }
      }
      if (from === 'pptx' && soffice) return { bytes: await viaLibreOffice(soffice, path, 'docx'), ext: 'docx' }
      return {
        bytes: await textToDocx(await pagesOf(path, from, bytes), title),
        ext: 'docx',
        note: from === 'pdf' ? 'Text only: a PDF’s layout, images and fonts can’t be turned back into an editable Word file.' : undefined,
      }
    }
    case 'pdf': {
      if ((from === 'docx' || from === 'pptx' || from === 'xlsx') && soffice) return { bytes: await viaLibreOffice(soffice, path, 'pdf'), ext: 'pdf' }
      if (from === 'docx') {
        const mammoth = (await import('mammoth')).default
        // Images left out: the page is printed with no network or files.
        const r = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, { convertImage: (mammoth.images as any).imgElement(() => Promise.resolve({ src: '' })) } as any)
        return { bytes: await d.printPdf(wrapHtml(r.value, title)), ext: 'pdf', note: 'Made without LibreOffice: layout is simplified and images left out. Install LibreOffice for an exact copy.' }
      }
      if (from === 'xlsx' || from === 'csv') {
        const rows = from === 'xlsx' ? await xlsxRows(bytes) : parseCsv(Buffer.from(bytes).toString('utf8'))
        return { bytes: await d.printPdf(rowsToHtml(rows, title)), ext: 'pdf' }
      }
      if (from === 'md') return { bytes: await d.printPdf(markdownToHtml(Buffer.from(bytes).toString('utf8'), title)), ext: 'pdf' }
      // Plain text: keep its lines as they are.
      const esc = (await text()).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return { bytes: await d.printPdf(wrapHtml(`<pre style="white-space:pre-wrap;font:10.5pt/1.5 'DejaVu Sans Mono',monospace;background:none;padding:0">${esc}</pre>`, title)), ext: 'pdf' }
    }
  }
}
