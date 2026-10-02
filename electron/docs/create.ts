import { Marked, type Token, type Tokens } from 'marked'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx'

/**
 * New documents from Markdown (what the agent writes): a Word file with real
 * headings, lists and tables, or HTML that prints to a clean PDF.
 */

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Markdown with raw HTML shown as text (the agent's output never becomes markup or scripts). */
function markdown(): Marked {
  const m = new Marked({ gfm: true, breaks: false })
  m.use({ renderer: { html: ({ text }) => escapeHtml(text) } })
  return m
}

// ------------------------------------------------------------------ Word ----

type Style = { bold?: boolean; italics?: boolean; code?: boolean; strike?: boolean }

function inline(tokens: Token[] | undefined, style: Style = {}): ParagraphChild[] {
  const out: ParagraphChild[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inline((t as Tokens.Strong).tokens, { ...style, bold: true }))
        break
      case 'em':
        out.push(...inline((t as Tokens.Em).tokens, { ...style, italics: true }))
        break
      case 'del':
        out.push(...inline((t as Tokens.Del).tokens, { ...style, strike: true }))
        break
      case 'codespan':
        out.push(new TextRun({ text: (t as Tokens.Codespan).text, font: 'Courier New', bold: style.bold, italics: style.italics }))
        break
      case 'br':
        out.push(new TextRun({ text: '', break: 1 }))
        break
      case 'link': {
        const l = t as Tokens.Link
        out.push(new ExternalHyperlink({ link: l.href, children: [new TextRun({ text: l.text, style: 'Hyperlink', bold: style.bold, italics: style.italics })] }))
        break
      }
      case 'text':
      case 'escape': {
        const tt = t as Tokens.Text
        if (tt.tokens?.length) out.push(...inline(tt.tokens, style))
        else out.push(new TextRun({ text: decode(tt.text), bold: style.bold, italics: style.italics, strike: style.strike }))
        break
      }
      default:
        if ('text' in t && typeof (t as any).text === 'string') out.push(new TextRun({ text: decode((t as any).text), ...style }))
    }
  }
  return out
}

/** marked escapes &, <, > in text tokens; Word wants the characters. */
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]

function blocks(tokens: Token[], ctx: { lists: number }, level = 0): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = []
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const h = t as Tokens.Heading
        out.push(new Paragraph({ heading: HEADINGS[Math.min(5, h.depth - 1)], children: inline(h.tokens) }))
        break
      }
      case 'paragraph':
        out.push(new Paragraph({ children: inline((t as Tokens.Paragraph).tokens), spacing: { after: 120 } }))
        break
      case 'list': {
        const l = t as Tokens.List
        const instance = ++ctx.lists
        for (const item of l.items) {
          const [first, ...rest] = item.tokens
          const lead = first && (first.type === 'text' || first.type === 'paragraph') ? inline((first as Tokens.Text).tokens ?? [first]) : []
          const prefix = item.task ? [new TextRun({ text: item.checked ? '☑ ' : '☐ ' })] : []
          out.push(
            new Paragraph({
              children: [...prefix, ...lead],
              ...(l.ordered ? { numbering: { reference: 'numbered', level: Math.min(level, 8), instance } } : { bullet: { level: Math.min(level, 8) } }),
            }),
          )
          const nested = first && (first.type === 'text' || first.type === 'paragraph') ? rest : item.tokens
          out.push(...blocks(nested, ctx, level + 1))
        }
        break
      }
      case 'table': {
        const tb = t as Tokens.Table
        const cell = (c: Tokens.TableCell, header: boolean) =>
          new TableCell({
            children: [new Paragraph({ children: inline(c.tokens, header ? { bold: true } : {}) })],
            shading: header ? { type: ShadingType.CLEAR, fill: 'EDEDED', color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          })
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ tableHeader: true, children: tb.header.map((c) => cell(c, true)) }), ...tb.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) }))],
          }),
          new Paragraph({ children: [] }),
        )
        break
      }
      case 'code':
        for (const line of (t as Tokens.Code).text.split('\n')) {
          out.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Courier New', size: 19 })], shading: { type: ShadingType.CLEAR, fill: 'F4F4F4', color: 'auto' }, spacing: { after: 0 } }))
        }
        out.push(new Paragraph({ children: [] }))
        break
      case 'blockquote':
        // Quoted paragraphs: indented, italic, with a rule on the left.
        for (const q of (t as Tokens.Blockquote).tokens) {
          if (q.type === 'paragraph')
            out.push(
              new Paragraph({
                children: inline((q as Tokens.Paragraph).tokens, { italics: true }),
                indent: { left: 400 },
                border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'C7C7CC', space: 8 } },
              }),
            )
          else out.push(...blocks([q], ctx, level))
        }
        break
      case 'hr':
        out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } } }))
        break
      case 'space':
        break
      default:
        if ('text' in t && typeof (t as any).text === 'string' && (t as any).text.trim()) out.push(new Paragraph({ children: [new TextRun(decode((t as any).text))] }))
    }
  }
  return out
}

/** A Word file from Markdown. */
export async function markdownToDocx(md: string, title?: string): Promise<Uint8Array> {
  const tokens = markdown().lexer(md)
  const doc = new Document({
    creator: 'Dynamic Island',
    title: title ?? '',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [
        {
          reference: 'numbered',
          levels: Array.from({ length: 9 }, (_, lvl) => ({
            level: lvl,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][lvl % 3],
            text: `%${lvl + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: blocks(tokens, { lists: 0 }) }],
  })
  return new Uint8Array(await Packer.toBuffer(doc))
}

/** A Word file from plain text: one paragraph per block, page breaks where given. */
export async function textToDocx(pages: string[], title?: string): Promise<Uint8Array> {
  const children: Paragraph[] = []
  pages.forEach((page, i) => {
    const paras = page.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    paras.forEach((p, k) =>
      children.push(
        new Paragraph({
          pageBreakBefore: i > 0 && k === 0,
          spacing: { after: 120 },
          children: p.split('\n').flatMap((line, n) => (n ? [new TextRun({ text: line, break: 1 })] : [new TextRun(line)])),
        }),
      ),
    )
  })
  const doc = new Document({
    creator: 'Dynamic Island',
    title: title ?? '',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: children.length ? children : [new Paragraph({ children: [] })] }],
  })
  return new Uint8Array(await Packer.toBuffer(doc))
}

/** Rows as a Markdown table (for Word and PDF output). Pure. */
export function rowsToMarkdown(rows: string[][]): string {
  if (!rows.length) return ''
  const width = Math.max(...rows.map((r) => r.length))
  const cell = (c: string | undefined) => (c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i])).join(' | ')} |`
  return [line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n')
}

// ------------------------------------------------------------- PDF (HTML) ----

const PRINT_CSS = `
@page { size: A4; margin: 22mm 20mm; }
* { box-sizing: border-box; }
body { font: 11pt/1.5 'Inter', 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif; color: #1d1d1f; }
h1 { font-size: 22pt; margin: 0 0 10pt; line-height: 1.2; }
h2 { font-size: 15pt; margin: 16pt 0 6pt; }
h3 { font-size: 12.5pt; margin: 12pt 0 4pt; }
p, ul, ol { margin: 0 0 8pt; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 10pt; }
th, td { border: 0.6pt solid #c7c7cc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f2f2f4; }
code { font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace; font-size: 9.5pt; background: #f4f4f6; padding: 0 2pt; border-radius: 2pt; }
pre { background: #f4f4f6; padding: 8pt; border-radius: 4pt; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
blockquote { margin: 0 0 8pt; padding-left: 10pt; border-left: 3pt solid #d1d1d6; color: #48484a; }
hr { border: 0; border-top: 0.6pt solid #c7c7cc; margin: 12pt 0; }
a { color: #0a5cff; text-decoration: none; }
img { display: none; }
`

/** A printable HTML page from Markdown (raw HTML in it is shown as text). */
export function markdownToHtml(md: string, title = 'Document'): string {
  const body = markdown().parse(md) as string
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`
}

/** A printable HTML page from already-safe HTML (e.g. converted from Word). */
export function wrapHtml(bodyHtml: string, title = 'Document'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`
}

/** An HTML table for rows (first row as the header). */
export function rowsToHtml(rows: string[][], title = 'Sheet'): string {
  const [head = [], ...rest] = rows
  const tr = (r: string[], tag: string) => `<tr>${r.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`
  return wrapHtml(`<h1>${escapeHtml(title)}</h1><table><thead>${tr(head, 'th')}</thead><tbody>${rest.map((r) => tr(r, 'td')).join('')}</tbody></table>`, title)
}
