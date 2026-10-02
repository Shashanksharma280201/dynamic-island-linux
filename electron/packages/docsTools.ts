import type { DocEntry } from '@shared/docs'
import { schema, str, strList, type AgentTool } from '../agent/tools'
import { CONVERT_TARGETS, type ConvertTarget } from '../docs/convert'
import { describeEntry, type DocsService } from '../docs/service'

/** What the Documents tools reach (the workspace service). */
export type DocsContext = Pick<
  DocsService,
  'list' | 'find' | 'resolve' | 'read' | 'merge' | 'pages' | 'rotate' | 'split' | 'stamp' | 'editWord' | 'editSheet' | 'convert' | 'create' | 'compare' | 'trash' | 'outLabel'
>

const fileParam = { type: 'string' as const, description: 'The file: its id from docs_list (like "d3"), its name, or its full path.' }
const nameParam = { type: 'string' as const, description: 'Name for the new file, without extension (optional).' }
const CREATE_FORMATS = ['docx', 'pdf', 'xlsx', 'csv', 'md', 'txt'] as const

/** "Saved “X.pdf” (id d9 · PDF · 4 pages) in ~/Documents/Dynamic Island." */
function saved(ctx: DocsContext, e: DocEntry, what = 'Saved'): string {
  return `${what} ${describeEntry(e)} in ${ctx.outLabel()}.`
}

export function docsTools(ctx: DocsContext): AgentTool[] {
  return [
    {
      name: 'docs_list',
      description:
        'List the documents in the user’s Documents workspace: files they added (dropped on the island or picked) and files made from them, newest first, with id, type, pages and location. Refer to files by id in the other document tools.',
      input_schema: schema({}),
      label: () => 'Looking at your documents',
      run: async () => {
        const all = await ctx.list()
        if (!all.length)
          return 'The Documents workspace is empty. The user can drop files on the island or pick them in the Documents tab, and docs_find can look for a file by name.'
        return all
          .slice(0, 60)
          .map((e) => `${describeEntry(e)} · ${e.origin === 'made' ? 'made here' : 'added'}${e.missing ? ' · MOVED OR DELETED' : ''}\n  ${e.path}`)
          .join('\n')
      },
    },
    {
      name: 'docs_find',
      description:
        'Look for documents by name in the user’s Documents, Downloads and Desktop folders (newest first). What’s found is added to the workspace, so the other tools can use it.',
      input_schema: schema(
        {
          query: { type: 'string', description: 'Words in the file name, like "invoice march".' },
          where: { type: 'string', description: 'documents, downloads or desktop (default: all three).' },
        },
        ['query'],
      ),
      label: (i) => `Looking for “${str(i.query)}”`,
      run: async (i) => {
        const where = str(i.where).toLowerCase() || undefined
        const found = await ctx.find(str(i.query), where)
        if (!found.length) return `No document named like “${str(i.query)}” in ${where ? `the ${where} folder` : 'Documents, Downloads or Desktop'}.`
        return found.map((e) => `${describeEntry(e)}\n  ${e.path}`).join('\n')
      },
    },
    {
      name: 'docs_read',
      description:
        'Read a document’s text: a PDF (with page markers), Word, Excel or CSV (each cell with its reference, and formulas), PowerPoint, Markdown or text. Very long documents are cut off; read them in parts with "pages".',
      input_schema: schema(
        {
          file: fileParam,
          pages: { type: 'string', description: 'PDF only: which pages, like "1-3, 7" (default: all).' },
          sheet: { type: 'string', description: 'Excel only: one sheet’s name (default: every sheet).' },
        },
        ['file'],
      ),
      label: (i) => `Reading ${str(i.file)}`,
      run: async (i) => {
        const e = await ctx.resolve(str(i.file))
        const r = await ctx.read(e, { pages: str(i.pages) || undefined, sheet: str(i.sheet) || undefined })
        const head = [describeEntry(e), r.note, r.truncated ? 'The text was cut off here because it’s long: read the rest in parts (pages).' : ''].filter(Boolean).join('\n')
        return `${head}\n\n${r.text || '(no text)'}`
      },
    },
    {
      name: 'pdf_merge',
      description: 'Combine PDFs into one new PDF, in the order given.',
      input_schema: schema(
        {
          files: { type: 'array', items: { type: 'string' }, description: 'The PDFs in order (ids, names or paths).' },
          name: nameParam,
        },
        ['files'],
      ),
      label: (i) => `Merging ${strList(i.files).length} PDFs`,
      run: async (i) => {
        const files = strList(i.files)
        if (files.length < 2) throw new Error('Give at least two PDFs to merge.')
        return saved(ctx, await ctx.merge(files, str(i.name) || undefined))
      },
    },
    {
      name: 'pdf_pages',
      description:
        'Make a new PDF from some pages of one: keep only the pages given (in the order given, so "3, 1-2" reorders), or delete them.',
      input_schema: schema(
        {
          file: fileParam,
          pages: { type: 'string', description: 'Pages like "1-3, 5, 8-" ("8-" is 8 to the end), "last", "odd" or "even".' },
          mode: { type: 'string', description: 'keep (default) or delete.' },
          name: nameParam,
        },
        ['file', 'pages'],
      ),
      label: (i) => (str(i.mode) === 'delete' ? `Removing pages ${str(i.pages)}` : `Taking pages ${str(i.pages)}`),
      run: async (i) => {
        const mode = str(i.mode) || 'keep'
        if (mode !== 'keep' && mode !== 'delete') throw new Error('mode must be keep or delete.')
        const r = await ctx.pages(str(i.file), str(i.pages), mode, str(i.name) || undefined)
        return saved(ctx, r.entry)
      },
    },
    {
      name: 'pdf_rotate',
      description: 'Make a copy of a PDF with pages turned clockwise by 90, 180 or 270 degrees.',
      input_schema: schema(
        {
          file: fileParam,
          degrees: { type: 'number', description: '90, 180 or 270 (clockwise); -90 turns left.' },
          pages: { type: 'string', description: 'Which pages, like "2, 4-5" (default: all).' },
        },
        ['file', 'degrees'],
      ),
      label: () => 'Rotating pages',
      run: async (i) => saved(ctx, await ctx.rotate(str(i.file), Number(i.degrees), str(i.pages) || undefined)),
    },
    {
      name: 'pdf_split',
      description: 'Split a PDF into several new files: every N pages, or one file per page range.',
      input_schema: schema(
        {
          file: fileParam,
          every: { type: 'number', description: 'Pages per file (1 makes one file per page).' },
          ranges: { type: 'array', items: { type: 'string' }, description: 'One range per file instead, like ["1-3", "4-9"].' },
        },
        ['file'],
      ),
      label: () => 'Splitting a PDF',
      run: async (i) => {
        const ranges = strList(i.ranges)
        const every = typeof i.every === 'number' ? Math.floor(i.every) : undefined
        if (!ranges.length && !(every && every > 0)) throw new Error('Say how to split: every (pages per file) or ranges.')
        const parts = await ctx.split(str(i.file), { every, ranges })
        const list = parts.slice(0, 30).map((e) => `- ${describeEntry(e)}`)
        return `Made ${parts.length} file${parts.length === 1 ? '' : 's'} in ${ctx.outLabel()}:\n${list.join('\n')}${parts.length > 30 ? `\n…and ${parts.length - 30} more.` : ''}`
      },
    },
    {
      name: 'pdf_stamp',
      description:
        'Make a copy of a PDF with text added on every page (a watermark across the page, or a header or footer line) and/or page numbers ("Page 2 of 9").',
      input_schema: schema(
        {
          file: fileParam,
          text: { type: 'string', description: 'The text, like "DRAFT" or "Confidential" (optional).' },
          position: { type: 'string', description: 'watermark (default), header or footer.' },
          page_numbers: { type: 'boolean', description: 'Add page numbers at the bottom right.' },
        },
        ['file'],
      ),
      label: (i) => (str(i.text) ? `Stamping “${str(i.text)}”` : 'Numbering the pages'),
      run: async (i) => {
        const position = (str(i.position) || 'watermark') as 'watermark' | 'header' | 'footer'
        if (!['watermark', 'header', 'footer'].includes(position)) throw new Error('position must be watermark, header or footer.')
        return saved(ctx, await ctx.stamp(str(i.file), { text: str(i.text) || undefined, position, pageNumbers: i.page_numbers === true }))
      },
    },
    {
      name: 'docx_edit',
      description:
        'Correct a Word (.docx) document by replacing exact pieces of its text; formatting is kept and the original file is left as it was. ' +
        'By default the corrections are tracked changes the user can accept or reject in Word or LibreOffice. ' +
        'Read it first with docs_read, then copy each piece exactly as it appears, within one paragraph, with a few words around short ones so they only match where intended. ' +
        'Every occurrence is replaced. An empty replace deletes the text.',
      input_schema: schema(
        {
          file: fileParam,
          edits: {
            type: 'array',
            description: 'The corrections.',
            items: {
              type: 'object',
              properties: {
                find: { type: 'string', description: 'Exact text to replace.' },
                replace: { type: 'string', description: 'The corrected text.' },
              },
              required: ['find', 'replace'],
              additionalProperties: false,
            },
          },
          tracked: { type: 'boolean', description: 'Show the corrections as tracked changes (default true).' },
        },
        ['file', 'edits'],
      ),
      label: (i) => `Correcting ${str(i.file)}`,
      run: async (i) => {
        const edits = (Array.isArray(i.edits) ? i.edits : []).map((x: any) => ({ find: str(x?.find), replace: str(x?.replace) })).filter((x) => x.find)
        if (!edits.length) throw new Error('No corrections given.')
        const r = await ctx.editWord(str(i.file), edits, i.tracked !== false)
        const n = r.applied.reduce((s, a) => s + a.count, 0)
        return [
          saved(ctx, r.entry, `Made ${n} change${n === 1 ? '' : 's'}${i.tracked !== false ? ' (tracked)' : ''}. Saved`),
          r.notFound.length ? `Not found (copy them exactly, within one paragraph): ${r.notFound.map((f) => `“${f}”`).join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      },
    },
    {
      name: 'sheet_edit',
      description:
        'Make a copy of an Excel (.xlsx) workbook with changes: set cells (a value, or a formula), delete rows, or add rows at the end. Read it first with docs_read to see the cells.',
      input_schema: schema(
        {
          file: fileParam,
          sheet: { type: 'string', description: 'The sheet’s name (default: the first).' },
          changes: {
            type: 'array',
            description: 'Cells to set.',
            items: {
              type: 'object',
              properties: {
                cell: { type: 'string', description: 'Like "B4".' },
                value: { type: 'string', description: 'The new value (numbers, dates and TRUE/FALSE are kept as such).' },
                formula: { type: 'string', description: 'A formula instead of a value, like "SUM(B2:B9)".' },
              },
              required: ['cell'],
              additionalProperties: false,
            },
          },
          delete_rows: { type: 'string', description: 'Rows to delete, like "5-7, 10".' },
          append_rows: { type: 'string', description: 'Rows to add at the end, as CSV lines.' },
        },
        ['file'],
      ),
      label: (i) => `Editing ${str(i.file)}`,
      run: async (i) => {
        const changes = (Array.isArray(i.changes) ? i.changes : []).map((c: any) => ({
          cell: str(c?.cell),
          value: typeof c?.value === 'string' ? c.value : undefined,
          formula: typeof c?.formula === 'string' ? c.formula : undefined,
        }))
        const r = await ctx.editSheet(str(i.file), {
          sheet: str(i.sheet) || undefined,
          changes,
          deleteRows: str(i.delete_rows) || undefined,
          appendRows: str(i.append_rows) || undefined,
        })
        return `${saved(ctx, r.entry)}\nChanges: ${r.summary.slice(0, 40).join('; ')}${r.summary.length > 40 ? '…' : ''}`
      },
    },
    {
      name: 'docs_convert',
      description:
        'Convert a document into a new file of another type: pdf (from Word, Excel, CSV, Markdown, text; PowerPoint needs LibreOffice), docx (Word), xlsx (from CSV), csv (from Excel), md or txt (the text of anything).',
      input_schema: schema({ file: fileParam, to: { type: 'string', description: 'pdf, docx, xlsx, csv, md or txt.' } }, ['file', 'to']),
      label: (i) => `Converting to ${str(i.to).toUpperCase()}`,
      run: async (i) => {
        const to = str(i.to).toLowerCase().replace(/^\./, '') as ConvertTarget
        if (!CONVERT_TARGETS.includes(to)) throw new Error(`to must be one of: ${CONVERT_TARGETS.join(', ')}.`)
        const r = await ctx.convert(str(i.file), to)
        return [saved(ctx, r.entry), r.note].filter(Boolean).join('\n')
      },
    },
    {
      name: 'docs_create',
      description:
        'Write a new document: a Word file (docx) or PDF from Markdown (headings, lists, tables, bold, links), a spreadsheet (xlsx or csv) from CSV, or a Markdown or text file.',
      input_schema: schema(
        {
          name: { type: 'string', description: 'File name, without extension.' },
          format: { type: 'string', description: 'docx, pdf, xlsx, csv, md or txt.' },
          content: { type: 'string', description: 'Markdown for docx, pdf and md; CSV for xlsx and csv; plain text for txt.' },
        },
        ['name', 'format', 'content'],
      ),
      label: (i) => `Writing ${str(i.name) || 'a document'}`,
      run: async (i) => {
        const format = str(i.format).toLowerCase().replace(/^\./, '') as (typeof CREATE_FORMATS)[number]
        if (!CREATE_FORMATS.includes(format)) throw new Error(`format must be one of: ${CREATE_FORMATS.join(', ')}.`)
        return saved(ctx, await ctx.create(str(i.name).trim() || 'Document', format, str(i.content).slice(0, 400_000)))
      },
    },
    {
      name: 'docs_compare',
      description: 'Compare the text of two documents (of any type, like two versions of a contract) and list the lines added and removed.',
      input_schema: schema({ a: { ...fileParam, description: 'The first (older) file.' }, b: { ...fileParam, description: 'The second (newer) file.' } }, ['a', 'b']),
      label: () => 'Comparing documents',
      run: async (i) => {
        const r = await ctx.compare(str(i.a), str(i.b))
        return `Comparing ${r.names[0]} (−) with ${r.names[1]} (+): ${r.added} line${r.added === 1 ? '' : 's'} added, ${r.removed} removed.\n\n${r.text}`
      },
    },
    {
      name: 'docs_trash',
      description: 'Move a document to the Trash (the user can restore it from there). The user is asked first.',
      input_schema: schema({ file: fileParam }, ['file']),
      label: (i) => `Moving ${str(i.file)} to the Trash`,
      asks: async (i) => {
        const e = await ctx.resolve(str(i.file))
        return { title: `Move “${e.name}” to the Trash`, body: e.path }
      },
      run: async (i) => `Moved ${await ctx.trash(str(i.file))} to the Trash.`,
    },
  ]
}
