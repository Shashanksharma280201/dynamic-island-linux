import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { freshPath, kindOf, pagesLabel, parsePages, safeName, sizeLabel } from '../electron/docs/files'
import { chunkPages, deletePages, mergePdfs, pageCount, rotatePages, selectPages, splitPdf, stampPdf } from '../electron/docs/pdf'
import { pdfPageTexts, readDocument, colName } from '../electron/docs/read'
import { markdownToDocx, markdownToHtml, rowsToMarkdown } from '../electron/docs/create'
import { editDocx } from '../electron/docs/docxEdit'
import { editSheet, parseCsv, rowList, rowsToXlsx, toCsv, xlsxRows } from '../electron/docs/sheet'
import { diffSummary } from '../electron/docs/compare'
import { canConvert, convertDocument } from '../electron/docs/convert'

const dir = mkdtempSync(join(tmpdir(), 'docs-test-'))
const file = (name: string, bytes: Uint8Array | string) => {
  const p = join(dir, name)
  writeFileSync(p, bytes)
  return p
}

/** A PDF whose pages say "Page 1", "Page 2"… (plus a prefix). */
async function pdf(pages: number, prefix = 'Page'): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) doc.addPage().drawText(`${prefix} ${i}`, { x: 60, y: 700, size: 20, font })
  return doc.save()
}
const texts = async (bytes: Uint8Array) => (await pdfPageTexts(bytes)).map((p) => p.text)
const raw = async (bytes: Uint8Array) => (await (await import('mammoth')).default.extractRawText({ buffer: Buffer.from(bytes) })).value

test('page ranges', () => {
  expect(parsePages('1-3, 5', 6)).toEqual([0, 1, 2, 4])
  expect(parsePages('5-3', 6)).toEqual([4, 3, 2])
  expect(parsePages('4-', 6)).toEqual([3, 4, 5])
  expect(parsePages('last, first', 6)).toEqual([5, 0])
  expect(parsePages('odd', 5)).toEqual([0, 2, 4])
  expect(parsePages('even', 5)).toEqual([1, 3])
  expect(() => parsePages('9', 6)).toThrow('Page 9 doesn’t exist: the document has 6 pages.')
  expect(() => parsePages('two', 6)).toThrow('isn’t a page number')
  expect(() => parsePages(' ', 6)).toThrow('Say which pages')
  expect(pagesLabel([0, 1, 2, 4, 6, 7])).toBe('1-3, 5, 7-8')
})

test('names and paths', () => {
  expect(kindOf('/a/Report.PDF')).toBe('pdf')
  expect(kindOf('/a/photo.jpg')).toBeNull()
  expect(safeName('../../etc/passwd')).toBe('..-..-etc-passwd'.replace(/^\.+/, ''))
  expect(safeName('   ')).toBe('Document')
  const taken = new Set([join('/out', 'Report.pdf'), join('/out', 'Report (2).pdf')])
  expect(freshPath('/out', 'Report', 'pdf', (p) => taken.has(p))).toBe(join('/out', 'Report (3).pdf'))
  expect(freshPath('/out', 'Report.pdf', '.pdf', () => false)).toBe(join('/out', 'Report.pdf'))
  expect(sizeLabel(340 * 1024)).toBe('340 KB')
  expect(colName(1)).toBe('A')
  expect(colName(28)).toBe('AB')
})

test('PDF: merge, keep, delete, reorder, rotate, split', async () => {
  const a = await pdf(3, 'A')
  const b = await pdf(2, 'B')
  const merged = await mergePdfs([a, b])
  expect(await texts(merged)).toEqual(['A 1', 'A 2', 'A 3', 'B 1', 'B 2'])
  expect(await texts(await selectPages(merged, parsePages('5, 1', 5)))).toEqual(['B 2', 'A 1'])
  expect(await texts(await deletePages(merged, parsePages('2-4', 5)))).toEqual(['A 1', 'B 2'])
  await expect(deletePages(a, [0, 1, 2])).rejects.toThrow('every page')
  const turned = await PDFDocument.load(await rotatePages(a, 90, [1]))
  expect(turned.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0])
  const parts = await splitPdf(merged, chunkPages(5, 2))
  expect(await Promise.all(parts.map(pageCount))).toEqual([2, 2, 1])
  await expect(mergePdfs([a])).rejects.toThrow('at least two')
})

test('PDF: watermark, footer and page numbers', async () => {
  const stamped = await stampPdf(await pdf(2), { text: 'CONFIDENTIAL', position: 'watermark', pageNumbers: true })
  const t = await texts(stamped)
  expect(t[0]).toContain('CONFIDENTIAL')
  expect(t[1]).toContain('Page 2 of 2')
  await expect(stampPdf(await pdf(1), { text: 'गोपनीय' })).rejects.toThrow('Latin letters')
  await expect(stampPdf(await pdf(1), {})).rejects.toThrow('Say what to add')
})

test('reading PDFs, with pages', async () => {
  const p = file('read.pdf', await pdf(4))
  const all = await readDocument(p)
  expect(all.text).toContain('--- Page 4 of 4 ---\nPage 4')
  const some = await readDocument(p, { pages: '2-3' })
  expect(some.text).not.toContain('Page 1')
  expect(some.note).toBe('Pages 2-3 of 4.')
})

test('Word files from Markdown, and reading them back', async () => {
  const md = '# Proposal\n\nDear **Rahul**, here is the *plan*:\n\n1. Design\n2. Build\n\n- fast\n- cheap\n\n| Item | Cost |\n|---|---|\n| Logo | 100 |\n\n> Quoted\n\n<script>alert(1)</script>'
  const bytes = await markdownToDocx(md, 'Proposal')
  const p = file('proposal.docx', bytes)
  const r = await readDocument(p)
  for (const s of ['Proposal', 'Dear Rahul, here is the plan:', 'Design', 'cheap', 'Logo', '100', 'Quoted']) expect(r.text).toContain(s)
  const html = markdownToHtml(md, 'Proposal')
  expect(html).toContain('<h1>Proposal</h1>')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(rowsToMarkdown([['a', 'b|c'], ['1', '2']])).toBe('| a | b\\|c |\n| --- | --- |\n| 1 | 2 |')
})

test('Word corrections as tracked changes keep the formatting and read as corrected', async () => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun('Teh qu'), new TextRun({ text: 'ick', bold: true }), new TextRun(' brown fox recieved teh parcel.')] }),
          new Paragraph({ children: [new TextRun('Teh end.')] }),
        ],
      },
    ],
  })
  const src = new Uint8Array(await Packer.toBuffer(doc))
  const r = await editDocx(
    src,
    [
      { find: 'Teh quick', replace: 'The quick' },
      { find: 'recieved', replace: 'received' },
      { find: 'teh parcel', replace: 'the parcel' },
      { find: 'nonexistent words', replace: 'x' },
    ],
    { tracked: true, author: 'Sparky', date: new Date('2026-10-02T10:00:00Z') },
  )
  expect(r.applied).toEqual([
    { find: 'Teh quick', count: 1 },
    { find: 'recieved', count: 1 },
    { find: 'teh parcel', count: 1 },
  ])
  expect(r.notFound).toEqual(['nonexistent words'])
  const xml = await (await JSZip.loadAsync(r.bytes)).file('word/document.xml')!.async('string')
  expect(xml).toContain('w:author="Sparky"')
  expect(xml).toContain('w:date="2026-10-02T10:00:00Z"')
  expect(xml.match(/<w:del /g)!.length).toBe(4) // "Teh qu" + "ick" (two runs) + "recieved" + "teh parcel"
  expect(xml).toMatch(/<w:delText[^>]*>ick<\/w:delText>/)
  expect(xml).toMatch(/<w:ins [^>]*><w:r>(?:<w:rPr\/>)?<w:t xml:space="preserve">The quick<\/w:t>/)
  // Change ids are unique.
  const ids = [...xml.matchAll(/<w:(?:ins|del) w:id="(\d+)"/g)].map((m) => m[1])
  expect(new Set(ids).size).toBe(ids.length)
  // Read with changes accepted: the corrected text.
  expect(await raw(r.bytes)).toContain('The quick brown fox received the parcel.')
  // "Teh end." didn't match "Teh quick": untouched.
  expect(await raw(r.bytes)).toContain('Teh end.')
  // Applied directly (no tracking): clean text, bold run gone only where replaced.
  const direct = await editDocx(src, [{ find: 'brown fox', replace: 'red fox' }], { tracked: false, author: 'Sparky' })
  const dxml = await (await JSZip.loadAsync(direct.bytes)).file('word/document.xml')!.async('string')
  expect(dxml).not.toContain('<w:del')
  expect(await raw(direct.bytes)).toContain('Teh quick red fox recieved')
  expect(dxml).toMatch(/<w:b\/>[\s\S]*ick/) // the bold run is still bold
})

test('spreadsheets: edit cells and formulas, delete and add rows, CSV both ways', async () => {
  const csv = 'Item,Qty,Price\nPens,10,1.5\n"Paper, A4",2,4\nTape,1,3\n'
  expect(parseCsv(csv)[2]).toEqual(['Paper, A4', '2', '4'])
  expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  expect(toCsv([['a,b', 'c"d']])).toBe('"a,b","c""d"\n')
  expect(rowList('5-7, 2')).toEqual([7, 6, 5, 2])
  const book = await rowsToXlsx(parseCsv(csv), 'Stock')
  const edited = await editSheet(book, {
    changes: [
      { cell: 'D1', value: 'Total' },
      { cell: 'D2', formula: '=B2*C2' },
      { cell: 'b3', value: '5' },
    ],
    deleteRows: '4',
    appendRows: 'Glue,3,2',
  })
  expect(edited.summary).toEqual(['D1: Total', 'D2 = B2*C2', 'B3: 5', 'deleted 1 row', 'added 1 row'])
  const rows = await xlsxRows(edited.bytes)
  expect(rows.map((r) => r[0])).toEqual(['Item', 'Pens', 'Paper, A4', 'Glue'])
  expect(rows[2][1]).toBe('5')
  const p = file('stock.xlsx', edited.bytes)
  const read = await readDocument(p)
  expect(read.text).toContain('D2 = B2*C2')
  expect(read.text).toContain('A2: Pens | B2: 10 | C2: 1.5')
  await expect(editSheet(book, { changes: [{ cell: 'nope', value: '1' }] })).rejects.toThrow('isn’t a cell reference')
  await expect(editSheet(book, { sheet: 'Missing', changes: [{ cell: 'A1', value: '1' }] })).rejects.toThrow('no sheet called “Missing”')
})

test('comparing two versions', () => {
  const a = 'Title\nThe fee is 100.\nPayment in 30 days.\nSigned.'
  const b = 'Title\nThe fee is 120.\nPayment in 30 days.\nLate fees apply.\nSigned.'
  const d = diffSummary(a, b)
  expect(d.added).toBe(2)
  expect(d.removed).toBe(1)
  expect(d.text).toBe('  Title\n- The fee is 100.\n+ The fee is 120.\n  Payment in 30 days.\n+ Late fees apply.\n  Signed.')
  expect(diffSummary('same', 'same').text).toBe('The two documents have the same text.')
})

test('conversions', async () => {
  const printed: string[] = []
  const deps = { printPdf: async (html: string) => (printed.push(html), pdf(1, 'Printed')), soffice: () => null }
  const csvPath = file('stock.csv', 'Item,Qty\nPens,10\n')
  const x = await convertDocument(csvPath, 'xlsx', deps)
  expect((await xlsxRows(x.bytes))[1]).toEqual(['Pens', '10'])
  const xlsxPath = file('stock2.xlsx', x.bytes)
  expect(Buffer.from((await convertDocument(xlsxPath, 'csv', deps)).bytes).toString()).toBe('Item,Qty\nPens,10\n')
  const md = await convertDocument(file('n.md', '# Hi\n\nThere'), 'docx', deps)
  expect(await raw(md.bytes)).toContain('There')
  const t = await convertDocument(file('p.pdf', await pdf(2)), 'txt', deps)
  expect(Buffer.from(t.bytes).toString()).toBe('Page 1\n\nPage 2')
  const w = await convertDocument(file('p2.pdf', await pdf(2)), 'docx', deps)
  expect(w.note).toMatch(/Text only/)
  expect(await raw(w.bytes)).toContain('Page 2')
  await convertDocument(csvPath, 'pdf', deps)
  expect(printed[0]).toContain('<th>Item</th>')
  await convertDocument(file('w.docx', await markdownToDocx('# Hello <b>world</b>')), 'pdf', deps)
  expect(printed[1]).toContain('Hello')
  expect(canConvert('pptx', 'pdf', false)).toBe(false)
  expect(canConvert('pptx', 'pdf', true)).toBe(true)
  await expect(convertDocument(file('s.pptx', 'x'), 'pdf', deps)).rejects.toThrow('needs LibreOffice')
  await expect(convertDocument(csvPath, 'csv', deps)).rejects.toThrow('already a CSV')
  expect(existsSync(csvPath) && readFileSync(csvPath, 'utf8')).toBe('Item,Qty\nPens,10\n') // originals untouched
})
