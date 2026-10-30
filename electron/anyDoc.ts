import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { htmlToText, odfText, odsRows, parseTsv, rowsToJson, rtfToText, toTsv } from '@shared/textFormats'
import { markdownToDocx, rowsToHtml, rowsToMarkdown } from './docs/create'
import { viaLibreOffice } from './docs/convert'
import { readDocument } from './docs/read'
import { parseCsv, rowsToXlsx, toCsv, xlsxRows } from './docs/sheet'

/**
 * Drag actions on more kinds of files: every sheet (Excel, OpenDocument, CSV,
 * TSV, old .xls) to every common format, and the text of any document, OCR
 * included for images and scans when tesseract is installed.
 */
export type AnyDocDeps = {
  soffice: () => string | null
  tesseract: () => string | null
  pdftoppm: () => string | null
  printPdf: (html: string) => Promise<Uint8Array>
}

/** The biggest text file read whole (bigger ones are logs or dumps: the start is enough). */
const MAX_TEXT = 20 * 1024 * 1024

const run = (bin: string, args: string[], timeout = 120_000) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).split('\n')[0])) : resolve(out))))

async function zipEntry(path: string, name: string): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await readFile(path))
  const f = zip.file(name)
  if (!f) throw new Error('That file looks damaged (no content inside).')
  return f.async('string')
}

function needsOffice(ext: string): Error {
  return new Error(`Opening .${ext} files needs LibreOffice (sudo apt install libreoffice).`)
}

/** A sheet's rows (its first sheet), whatever kind of sheet it is. */
export async function sheetRows(path: string, ext: string, d: AnyDocDeps): Promise<string[][]> {
  switch (ext) {
    case 'xlsx':
      return xlsxRows(new Uint8Array(await readFile(path)))
    case 'csv':
      return parseCsv((await readFile(path, 'utf8')).replace(/^﻿/, ''))
    case 'tsv':
      return parseTsv(await readFile(path, 'utf8'))
    case 'ods':
      return odsRows(await zipEntry(path, 'content.xml'))
    case 'xls': {
      const soffice = d.soffice()
      if (!soffice) throw needsOffice(ext)
      return xlsxRows(await viaLibreOffice(soffice, path, 'xlsx'))
    }
  }
  throw new Error('That isn’t a sheet.')
}

export type SheetTarget = 'xlsx' | 'csv' | 'tsv' | 'pdf' | 'docx' | 'md' | 'json' | 'html'

/** A sheet as another format: the bytes, and a note for the card. */
export async function convertSheet(path: string, ext: string, to: SheetTarget, title: string, d: AnyDocDeps): Promise<{ bytes: Uint8Array; note: string }> {
  const soffice = d.soffice()
  // An exact PDF (fonts, colours, column widths) when LibreOffice can make one.
  if (to === 'pdf' && soffice && (ext === 'xlsx' || ext === 'ods' || ext === 'xls')) {
    try {
      return { bytes: await viaLibreOffice(soffice, path, 'pdf'), note: '' }
    } catch {
      // the simple table below
    }
  }
  if (to === 'xlsx' && soffice && (ext === 'ods' || ext === 'xls')) return { bytes: await viaLibreOffice(soffice, path, 'xlsx'), note: 'Every sheet, with its formatting' }
  const rows = await sheetRows(path, ext, d)
  const many = ext === 'xlsx' || ext === 'ods' || ext === 'xls'
  const first = many ? 'The first sheet' : ''
  const enc = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'))
  switch (to) {
    case 'csv':
      return { bytes: enc(toCsv(rows)), note: first ? `${first}, as values` : '' }
    case 'tsv':
      return { bytes: enc(toTsv(rows) + '\n'), note: first ? `${first}, as values` : '' }
    case 'xlsx':
      return { bytes: await rowsToXlsx(rows, title.slice(0, 31) || 'Sheet1'), note: '' }
    case 'json':
      return { bytes: enc(rowsToJson(rows)), note: 'One object per row, named by the first row' }
    case 'md':
      return { bytes: enc(rowsToMarkdown(rows) + '\n'), note: first }
    case 'html':
      return { bytes: enc(rowsToHtml(rows, title)), note: first }
    case 'docx':
      return { bytes: await markdownToDocx(rowsToMarkdown(rows), title), note: first ? `${first}, as a table` : 'As a table' }
    case 'pdf':
      return { bytes: await d.printPdf(rowsToHtml(rows, title)), note: first ? `${first}, as a table` : 'As a table' }
  }
}

/** The words in an image (or a scan), by tesseract. */
async function ocr(path: string, d: AnyDocDeps): Promise<string> {
  const t = d.tesseract()
  if (!t) throw new Error('Copying the words in an image needs tesseract (sudo apt install tesseract-ocr).')
  return (await run(t, [path, 'stdout'])).trim()
}

/** A scanned PDF's words: each page as an image, then OCR. */
async function ocrPdf(path: string, d: AnyDocDeps): Promise<string> {
  const pdftoppm = d.pdftoppm()
  if (!pdftoppm || !d.tesseract()) return ''
  const dir = await mkdtemp(join(tmpdir(), 'island-ocr-'))
  try {
    await run(pdftoppm, ['-r', '200', '-png', '-l', '30', path, join(dir, 'page')])
    const pages = (await readdir(dir)).filter((n) => n.endsWith('.png')).sort()
    const texts: string[] = []
    for (const p of pages) texts.push(await ocr(join(dir, p), d))
    return texts.join('\n\n').trim()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** All the text of a file, for Copy text. Sheets come as tab-separated rows (they paste as a table). */
export async function anyText(path: string, ext: string, d: AnyDocDeps): Promise<string> {
  switch (ext) {
    case 'xlsx':
    case 'xls':
    case 'ods':
    case 'csv':
    case 'tsv':
      return toTsv(await sheetRows(path, ext, d))
    case 'pdf': {
      const r = await readDocument(path)
      const text = r.text.replace(/^--- Page \d+ of \d+ ---\n/gm, '').replace(/^\(no text on this page\)$/gm, '').trim()
      // A scan: read its pages instead.
      return text || ocrPdf(path, d)
    }
    case 'docx':
    case 'pptx':
    case 'md':
    case 'markdown':
    case 'txt':
      return (await readDocument(path)).text
    case 'odt':
    case 'odp':
      return odfText(await zipEntry(path, 'content.xml'))
    case 'rtf':
      return rtfToText(await readFile(path, 'latin1'))
    case 'html':
    case 'htm':
      return htmlToText(await readFile(path, 'utf8'))
    case 'doc':
    case 'ppt': {
      const soffice = d.soffice()
      if (!soffice) throw needsOffice(ext)
      if (ext === 'doc') return Buffer.from(await viaLibreOffice(soffice, path, 'txt:Text')).toString('utf8').replace(/^﻿/, '')
      const pdf = await viaLibreOffice(soffice, path, 'pdf')
      const dir = await mkdtemp(join(tmpdir(), 'island-ppt-'))
      try {
        const tmp = join(dir, 'slides.pdf')
        await (await import('node:fs/promises')).writeFile(tmp, pdf)
        return (await readDocument(tmp)).text.replace(/^--- Page (\d+) of \d+ ---$/gm, '--- Slide $1 ---')
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
    case 'bmp':
    case 'tif':
    case 'tiff':
      return ocr(path, d)
  }
  // Anything else that's text (code, JSON, logs…): as it is.
  const buf = await readFile(path)
  const head = buf.subarray(0, Math.min(buf.length, MAX_TEXT))
  if (head.subarray(0, 8000).includes(0)) throw new Error('That file isn’t text.')
  return head.toString('utf8').replace(/^﻿/, '')
}
