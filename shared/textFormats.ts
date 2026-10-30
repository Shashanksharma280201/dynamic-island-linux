/**
 * Getting the words (or the table) out of more kinds of files, for drag
 * actions' Copy text and Convert: RTF, HTML, OpenDocument (content.xml of an
 * .odt, .odp or .ods) and tab-separated sheets, and a sheet's rows as JSON.
 * Pure.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '\u2014', hellip: '…', copy: '©', reg: '®', trade: '™', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', euro: '€', pound: '£' }

/** "&amp;" -> "&", "&#8364;" -> "€". */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Blank runs tidied: no trailing spaces, at most one empty line in a row. */
function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The readable text of a web page: no scripts or styles, a line per block. */
export function htmlToText(html: string): string {
  // Line breaks in the page's source are only spaces, except in <pre>.
  const pre: string[] = []
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_m, body: string) => `\u0000${pre.push(body) - 1}\u0000`)
    .replace(/\s+/g, ' ')
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => `\n${pre[Number(i)]}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|section|article|header|footer|blockquote|pre|title)\s*>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  return tidy(
    s
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, (w) => (w.includes('\t') ? '\t' : ' ')).replace(/^[ \t]+/, ''))
      .join('\n'),
  )
}

/**
 * The text of an RTF document: paragraphs and tabs kept, formatting and the
 * font, colour and style tables dropped, \'hh and \uN characters decoded
 * (Windows-1252 for \'hh).
 */
export function rtfToText(rtf: string): string {
  if (!rtf.startsWith('{\\rtf')) return rtf
  const CP1252: Record<number, string> = { 0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '\u2014', 0x99: '™' }
  const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'footnote', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'xmlnstbl', 'mmathPr', 'object', 'fldinst'])
  let out = ''
  // Per group: skipping it, and how many characters to drop after a \uN.
  const stack: { skip: boolean; uc: number }[] = []
  let skip = false
  let uc = 1
  let drop = 0
  let i = 0
  const n = rtf.length
  while (i < n) {
    const c = rtf[i]
    if (c === '{') {
      stack.push({ skip, uc })
      i++
      // {\*\destination …} is something this reader doesn't know: skip it.
      if (rtf.startsWith('\\*', i)) skip = true
      continue
    }
    if (c === '}') {
      const top = stack.pop()
      if (top) ({ skip, uc } = top)
      i++
      continue
    }
    if (c === '\\') {
      const next = rtf[i + 1]
      if (next === undefined) break
      if (next === '\\' || next === '{' || next === '}') {
        if (!skip) drop > 0 ? drop-- : (out += next)
        i += 2
        continue
      }
      if (next === "'") {
        const code = parseInt(rtf.slice(i + 2, i + 4), 16)
        if (!skip) {
          if (drop > 0) drop--
          else if (Number.isFinite(code)) out += CP1252[code] ?? String.fromCharCode(code)
        }
        i += 4
        continue
      }
      if (next === '~') {
        if (!skip) out += ' '
        i += 2
        continue
      }
      if (next === '-' || next === '_') {
        i += 2
        continue
      }
      if (next === '\n' || next === '\r') {
        if (!skip) out += '\n'
        i += 2
        continue
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40))
      if (!m) {
        i += 2
        continue
      }
      i += 1 + m[0].length
      const word = m[1]
      const arg = m[2] === undefined ? undefined : Number(m[2])
      if (SKIP.has(word)) {
        skip = true
        continue
      }
      if (skip) continue
      if (word === 'uc' && arg !== undefined) uc = arg
      else if (word === 'u' && arg !== undefined) {
        out += String.fromCharCode(arg < 0 ? arg + 65536 : arg)
        drop = uc
      } else if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n'
      else if (word === 'tab' || word === 'cell') out += '\t'
      else if (word === 'row') out += '\n'
      else if (word === 'emdash') out += '\u2014'
      else if (word === 'endash') out += '–'
      else if (word === 'bullet') out += '•'
      else if (word === 'lquote') out += '‘'
      else if (word === 'rquote') out += '’'
      else if (word === 'ldblquote') out += '“'
      else if (word === 'rdblquote') out += '”'
      continue
    }
    if (c === '\r' || c === '\n') {
      i++
      continue
    }
    if (!skip) drop > 0 ? drop-- : (out += c)
    i++
  }
  return tidy(out.replace(/\t+\n/g, '\n'))
}

/** An OpenDocument element's text: spaces (text:s), tabs and line breaks kept. */
function odfInline(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_m, c) => ' '.repeat(Number(c ?? 1)))
      .replace(/<text:tab\s*\/>/g, '\t')
      .replace(/<text:line-break\s*\/>/g, '\n')
      .replace(/<text:note\b[\s\S]*?<\/text:note>/g, '')
      .replace(/<[^>]+>/g, ''),
  )
}

/** The text of an .odt or .odp (its content.xml): a line per paragraph, heading and list item. */
export function odfText(contentXml: string): string {
  // Footnotes hold paragraphs of their own: out first.
  const body = (/<office:body>([\s\S]*)<\/office:body>/.exec(contentXml)?.[1] ?? contentXml).replace(/<text:note\b[\s\S]*?<\/text:note>/g, '')
  const lines: string[] = []
  // Pages of a presentation are split by an empty line.
  const blocks = body.replace(/<\/draw:page>/g, '<text:p></text:p>')
  for (const m of blocks.matchAll(/<text:(p|h)\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:\1>)/g)) lines.push(odfInline(m[2] ?? ''))
  return tidy(lines.join('\n'))
}

/** The rows of the first table in an .ods (its content.xml), repeated rows and cells expanded (within reason). */
export function odsRows(contentXml: string): string[][] {
  const table = /<table:table\b[^>]*>([\s\S]*?)<\/table:table>/.exec(contentXml)?.[1] ?? ''
  const rows: string[][] = []
  for (const r of table.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
    const cells: string[] = []
    for (const c of (r[2] ?? '').matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
      const repeat = Math.min(Number(/table:number-columns-repeated="(\d+)"/.exec(c[1])?.[1] ?? 1), 200)
      const paras = [...(c[2] ?? '').matchAll(/<text:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:p>)/g)].map((p) => odfInline(p[1] ?? ''))
      for (let k = 0; k < repeat; k++) cells.push(paras.join('\n'))
    }
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    const times = Math.min(Number(/table:number-rows-repeated="(\d+)"/.exec(r[1])?.[1] ?? 1), 1000)
    for (let k = 0; k < times; k++) rows.push([...cells])
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop()
  return rows
}

/** A tab-separated sheet's rows. */
export function parseTsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.map((l) => l.split('\t'))
}

/** Rows as tab-separated text: pastes into any spreadsheet as a table. */
export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
}

/** A cell as JSON: numbers and true/false as such, the rest as text, empty as null. */
function jsonValue(s: string): string | number | boolean | null {
  const t = s.trim()
  if (t === '') return null
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t) && t.length < 16) return Number(t)
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'
  return s
}

/** A sheet as JSON: the first row names the fields (unnamed or repeated ones get "Column 3", "Name 2"). */
export function rowsToJson(rows: string[][]): string {
  if (!rows.length) return '[]\n'
  const width = Math.max(...rows.map((r) => r.length))
  const seen = new Map<string, number>()
  const keys = Array.from({ length: width }, (_, i) => {
    const base = (rows[0][i] ?? '').trim() || `Column ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} ${n}`
  })
  const out = rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, jsonValue(r[i] ?? '')])))
  return JSON.stringify(out, null, 2) + '\n'
}
