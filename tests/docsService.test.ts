import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { DocsService, type DocsDeps } from '../electron/docs/service'
import { markdownToDocx } from '../electron/docs/create'
import { rowsToXlsx } from '../electron/docs/sheet'
import { pageCount } from '../electron/docs/pdf'
import { pdfPageTexts } from '../electron/docs/read'
import { packageTools } from '../electron/packages/tools'
import { runTool } from '../electron/agent/tools'

/** A PDF whose pages say "<prefix> 1", "<prefix> 2"… */
async function pdf(pages: number, prefix = 'Page'): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) doc.addPage().drawText(`${prefix} ${i}`, { x: 60, y: 700, size: 20, font })
  return doc.save()
}
const raw = async (bytes: Uint8Array) => (await (await import('mammoth')).default.extractRawText({ buffer: Buffer.from(bytes) })).value

/** A fresh workspace in a temporary home folder, with its own files. */
async function setup(over: Partial<DocsDeps> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'docs-service-'))
  const home = join(root, 'home')
  const downloads = join(home, 'Downloads')
  const out = join(home, 'Documents', 'Dynamic Island')
  for (const d of [downloads, join(home, 'Documents'), join(home, '.secret'), join(downloads, 'Taxes 2026')]) mkdirSync(d, { recursive: true })
  const put = (path: string, bytes: Uint8Array | string) => (writeFileSync(path, bytes), path)
  const files = {
    a: put(join(downloads, 'Invoice March.pdf'), await pdf(2, 'A')),
    b: put(join(downloads, 'Invoice April.pdf'), await pdf(3, 'B')),
    contract: put(join(home, 'Contract.docx'), await markdownToDocx('# Lease\n\nThe tenant shall pay teh rent on the first day of each month.\n')),
    sheet: put(join(downloads, 'Budget.xlsx'), await rowsToXlsx([['Item', 'Qty'], ['Pens', '10']], 'Budget')),
    csv: put(join(downloads, 'People.csv'), 'name,age\nAda,36\n'),
    nested: put(join(downloads, 'Taxes 2026', 'Invoice tax.pdf'), await pdf(1, 'T')),
    hidden: put(join(home, '.secret', 'keys.txt'), 'secret'),
    photo: put(join(downloads, 'photo.jpg'), 'jpg'),
  }
  const trashed: string[] = []
  const printed: string[] = []
  let changes = 0
  const deps: DocsDeps = {
    dataDir: join(root, 'data'),
    outDir: () => out,
    home: () => home,
    searchRoots: () => ({ downloads, documents: join(home, 'Documents') }),
    printPdf: async (html) => (printed.push(html), pdf(1, 'Printed')),
    soffice: () => null,
    trash: async (p) => void trashed.push(p),
    author: () => 'Sparky',
    onChange: () => void changes++,
    ...over,
  }
  const docs = new DocsService(deps)
  return { docs, deps, home, out, files, trashed, printed, changes: () => changes }
}

test('adding files: what is kept, what is skipped and why', async () => {
  const { docs, files, changes } = await setup()
  const r = await docs.add([files.a, files.b, files.photo, 'relative.pdf', join(files.a, '..', 'Missing.pdf')])
  expect(r.added.map((e) => [e.id, e.name, e.kind, e.pages, e.origin])).toEqual([
    ['d1', 'Invoice March.pdf', 'pdf', 2, 'added'],
    ['d2', 'Invoice April.pdf', 'pdf', 3, 'added'],
  ])
  expect(r.skipped.map((s) => s.why)).toEqual(['not a PDF, Word, Excel, CSV, PowerPoint, Markdown or text file', 'not a file path', 'not found'])
  expect(changes()).toBe(1)
  // Adding the same file again keeps its id (and moves it to the top).
  const again = await docs.add([files.a])
  expect(again.added[0].id).toBe('d1')
  expect((await docs.list()).map((e) => e.id)).toEqual(['d1', 'd2'])
})

test('finding a file: by id, by name, by part of a name, or by its path in the home folder', async () => {
  const { docs, files, home } = await setup()
  await docs.add([files.a, files.b])
  expect((await docs.resolve('d2')).name).toBe('Invoice April.pdf')
  expect((await docs.resolve('invoice march.pdf')).id).toBe('d1')
  expect((await docs.resolve('april')).id).toBe('d2')
  await expect(docs.resolve('invoice')).rejects.toThrow('“invoice” matches several files: Invoice April.pdf (d2), Invoice March.pdf (d1). Use the id.')
  // An id never matches a name by accident.
  await expect(docs.resolve('d9')).rejects.toThrow('There’s no file d9 in Documents any more')
  // A path in the home folder is added on the way; hidden folders and other places are off limits.
  const c = await docs.resolve('~/Contract.docx')
  expect([c.id, c.kind]).toEqual(['d3', 'docx'])
  expect(docs.openable(files.hidden)).toBeNull()
  expect(docs.openable('/etc/hosts.txt')).toBeNull()
  expect(docs.openable(join(home, 'notes.md'))).toBe(join(home, 'notes.md'))
  await expect(docs.resolve(files.hidden)).rejects.toThrow('No file')
})

test('PDF operations write new files and leave the originals as they were', async () => {
  const { docs, files, out } = await setup()
  await docs.add([files.a, files.b])
  const before = readFileSync(files.a)
  const merged = await docs.merge(['d1', 'd2'])
  expect([merged.name, merged.pages, merged.origin]).toEqual(['Invoice March (merged).pdf', 5, 'made'])
  expect(merged.path).toBe(join(out, 'Invoice March (merged).pdf'))
  expect(readFileSync(files.a).equals(before)).toBe(true)
  // Never overwrites: the same name gets a number.
  expect((await docs.merge(['d1', 'd2'])).name).toBe('Invoice March (merged) (2).pdf')

  const kept = await docs.pages('d2', '3, 1', 'keep')
  expect(kept.entry.name).toBe('Invoice April (pages 1, 3).pdf')
  expect((await pdfPageTexts(readFileSync(kept.entry.path))).map((p) => p.text)).toEqual(['B 3', 'B 1'])
  const without = await docs.pages('d2', '2', 'delete')
  expect([without.entry.name, without.entry.pages]).toEqual(['Invoice April (without 2).pdf', 2])

  const parts = await docs.split('d2', { every: 1 })
  expect(parts.map((p) => p.name)).toEqual(['Invoice April (part 1, pages 1).pdf', 'Invoice April (part 2, pages 2).pdf', 'Invoice April (part 3, pages 3).pdf'])
  const ranges = await docs.split('d2', { ranges: ['1-2', '3'] })
  expect(await Promise.all(ranges.map(async (p) => pageCount(readFileSync(p.path))))).toEqual([2, 1])

  const rotated = await docs.rotate('d1', 90)
  const r = await PDFDocument.load(readFileSync(rotated.path))
  expect(r.getPage(0).getRotation().angle).toBe(90)
  const numbered = await docs.stamp('d1', { pageNumbers: true })
  expect((await pdfPageTexts(readFileSync(numbered.path)))[1].text).toContain('Page 2 of 2')

  await docs.add([files.csv])
  await expect(docs.merge(['d1', 'People.csv'])).rejects.toThrow('People.csv isn’t a PDF. Convert it first (docs_convert to pdf).')
})

test('Word corrections, spreadsheet edits, conversions, new documents and comparing', async () => {
  const { docs, files, printed } = await setup()
  const word = (await docs.add([files.contract])).added[0]
  const fixed = await docs.editWord(word.id, [{ find: 'teh rent', replace: 'the rent' }, { find: 'not there', replace: 'x' }], true)
  expect(fixed.entry.name).toBe('Contract (corrected, tracked changes).docx')
  expect(fixed.applied).toEqual([{ find: 'teh rent', count: 1 }])
  expect(fixed.notFound).toEqual(['not there'])
  expect(await raw(readFileSync(fixed.entry.path))).toContain('pay the rent')
  expect(readFileSync(fixed.entry.path, 'latin1')).not.toBe('')
  await expect(docs.editWord(word.id, [{ find: 'nowhere', replace: 'x' }], true)).rejects.toThrow('None of the text to change was found in Contract.docx: “nowhere”.')

  const sheet = (await docs.add([files.sheet])).added[0]
  const edited = await docs.editSheet(sheet.id, { changes: [{ cell: 'B2', value: '12' }], appendRows: 'Ink,3' })
  expect(edited.summary).toEqual(['B2: 12', 'added 1 row'])
  expect(edited.entry.name).toBe('Budget (edited).xlsx')

  const csv = (await docs.add([files.csv])).added[0]
  const xlsx = await docs.convert(csv.id, 'xlsx')
  expect([xlsx.entry.name, xlsx.entry.kind]).toEqual(['People.xlsx', 'xlsx'])
  const asPdf = await docs.convert(csv.id, 'pdf')
  expect(asPdf.entry.kind).toBe('pdf')
  expect(printed.at(-1)).toContain('<td>Ada</td>')

  const memo = await docs.create('Memo', 'docx', '# Memo\n\n- one\n- two\n')
  expect(await raw(readFileSync(memo.path))).toContain('one')
  const md = await docs.create('Plan.md', 'md', '# Plan\n')
  expect([md.name, readFileSync(md.path, 'utf8')]).toEqual(['Plan.md', '# Plan\n'])
  await expect(docs.create('Empty', 'txt', '  ')).rejects.toThrow('The document is empty.')

  const cmp = await docs.compare(word.id, fixed.entry.id)
  expect(cmp.names).toEqual(['Contract.docx', 'Contract (corrected, tracked changes).docx'])
  expect([cmp.added, cmp.removed]).toEqual([1, 1])
})

test('the list is kept between runs; trash, remove and recipes', async () => {
  const s = await setup()
  await s.docs.add([s.files.a, s.files.b])
  await s.docs.merge(['d1', 'd2'])
  const again = new DocsService(s.deps)
  expect((await again.list()).map((e) => [e.id, e.origin])).toEqual([
    ['d3', 'made'],
    ['d2', 'added'],
    ['d1', 'added'],
  ])
  // New ids carry on from where they were.
  expect((await again.add([s.files.csv])).added[0].id).toBe('d4')

  expect(await again.trash('d3')).toBe('Invoice March (merged).pdf')
  expect(s.trashed).toEqual([join(s.out, 'Invoice March (merged).pdf')])
  again.remove(['d1'])
  expect((await again.list()).map((e) => e.id)).toEqual(['d4', 'd2'])
  expect(existsSync(s.files.a)).toBe(true) // only taken off the list

  const r = again.saveRecipe({ name: 'Merge + number', instruction: 'Merge these and add page numbers' })
  expect(r).toMatchObject([{ name: 'Merge + number', instruction: 'Merge these and add page numbers' }])
  expect(again.saveRecipe({ id: r[0].id, name: 'Merge and number', instruction: 'x' })).toEqual([{ id: r[0].id, name: 'Merge and number', instruction: 'x' }])
  expect(again.removeRecipe(r[0].id)).toEqual([])
  expect(() => again.saveRecipe({ name: ' ', instruction: 'x' })).toThrow('A recipe needs a name and what to do.')
})

test('looking for documents by name in the usual folders (not hidden ones)', async () => {
  const { docs } = await setup()
  const found = await docs.find('invoice')
  expect(found.map((e) => e.name).sort()).toEqual(['Invoice April.pdf', 'Invoice March.pdf', 'Invoice tax.pdf'])
  expect((await docs.find('invoice march')).map((e) => e.name)).toEqual(['Invoice March.pdf'])
  expect(await docs.find('keys')).toEqual([])
  await expect(docs.find('  ')).rejects.toThrow('Say what to look for')
})

test('the agent’s document tools', async () => {
  const s = await setup()
  const tools = packageTools({ disabled: ['notes', 'chats', 'mail', 'music'] }, { docs: s.docs } as any)
  const run = (name: string, input: unknown, approve?: () => Promise<boolean>) => runTool(tools, name, input, approve && (async () => approve()))

  expect((await run('docs_list', {})).output).toContain('The Documents workspace is empty.')
  const found = await run('docs_find', { query: 'invoice march', where: 'downloads' })
  expect(found.output).toBe(`Invoice March.pdf (id d1) · PDF · 2 pages\n  ${s.files.a}`)
  await run('docs_find', { query: 'april' })

  const read = await run('docs_read', { file: 'd2', pages: '2-3' })
  expect(read.output).toContain('Invoice April.pdf (id d2) · PDF · 3 pages\nPages 2-3 of 3.')
  expect(read.output).toContain('--- Page 3 of 3 ---\nB 3')

  const merged = await run('pdf_merge', { files: ['d1', 'Invoice April.pdf'], name: 'Both invoices' })
  expect(merged).toEqual({ ok: true, output: 'Saved Both invoices.pdf (id d3) · PDF · 5 pages in ~/Documents/Dynamic Island.' })
  expect((await run('pdf_merge', { files: ['d1'] })).output).toBe('Failed: Give at least two PDFs to merge.')
  expect((await run('pdf_merge', { files: 'd1' })).output).toBe('Invalid input: "files" must be a list.')

  expect((await run('pdf_pages', { file: 'd3', pages: '9' })).output).toBe('Failed: Page 9 doesn’t exist: the document has 5 pages.')
  expect((await run('pdf_split', { file: 'd3', every: 2 })).output).toMatch(/^Made 3 files in ~\/Documents\/Dynamic Island:\n- Both invoices \(part 1, pages 1-2\)\.pdf/)
  expect((await run('pdf_stamp', { file: 'd3', text: 'DRAFT', position: 'footer', page_numbers: true })).output).toContain('Saved Both invoices (stamped).pdf')

  await run('docs_read', { file: '~/Contract.docx' })
  const edit = await run('docx_edit', { file: 'Contract.docx', edits: [{ find: 'teh rent', replace: 'the rent' }, { find: 'gone', replace: '' }] })
  expect(edit.output).toBe('Made 1 change (tracked). Saved Contract (corrected, tracked changes).docx (id d9) · Word in ~/Documents/Dynamic Island.\nNot found (copy them exactly, within one paragraph): “gone”')
  expect((await run('docx_edit', { file: 'Contract.docx', edits: [{ find: 'x' }] })).output).toBe('Invalid input: Item 1 of "edits": Missing "replace".')

  expect((await run('docs_convert', { file: 'd1', to: 'exe' })).output).toBe('Failed: to must be one of: pdf, docx, xlsx, csv, txt, md.')
  expect((await run('docs_create', { name: 'Notes', format: 'md', content: '# Hi' })).output).toBe('Saved Notes.md (id d10) · Markdown in ~/Documents/Dynamic Island.')
  expect((await run('docs_compare', { a: 'Contract.docx', b: 'd9' })).output).toMatch(/^Comparing Contract\.docx \(−\) with Contract \(corrected, tracked changes\)\.docx \(\+\): 1 line added, 1 removed\./)

  // Moving to the Trash asks first; a "no" leaves the file alone.
  expect((await run('docs_trash', { file: 'd10' }, async () => false)).output).toContain('The user did not allow this')
  expect(s.trashed).toEqual([])
  expect((await run('docs_trash', { file: 'd10' }, async () => true)).output).toBe('Moved Notes.md to the Trash.')
  expect(s.trashed).toEqual([join(s.out, 'Notes.md')])

  const list = (await run('docs_list', {})).output
  expect(list.split('\n')[0]).toBe('Contract (corrected, tracked changes).docx (id d9) · Word · made here')
  expect(readdirSync(s.out).length).toBeGreaterThan(5)
})

test('a long document is read in parts, and the agent is told so', async () => {
  const s = await setup()
  const long = join(s.home, 'Long.txt')
  writeFileSync(long, 'word '.repeat(12_000)) // 60,000 characters
  const tools = packageTools({ disabled: ['notes', 'chats', 'mail', 'music'] }, { docs: s.docs } as any)
  const r = await runTool(tools, 'docs_read', { file: long })
  expect(r.output).toContain('The text was cut off here because it’s long')
  expect(r.output.length).toBeLessThan(50_000)
})
