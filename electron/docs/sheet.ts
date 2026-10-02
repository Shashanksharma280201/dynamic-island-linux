import type { Workbook, Worksheet } from 'exceljs'

const loadExcel = async () => (await import('exceljs')).default

/** Parse CSV (quotes, escaped quotes, commas / semicolons / tabs, CRLF). Pure. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** Rows as CSV text. Pure. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n'
}

/** A typed cell value from text: numbers, booleans, or the text itself. Pure. */
export function cellValue(text: string): string | number | boolean | null {
  const t = text.trim()
  if (t === '') return null
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'
  return text
}

const CELL_RE = /^([A-Z]{1,3})([1-9]\d{0,6})$/

function sheetOf(wb: Workbook, name?: string): Worksheet {
  const ws = name ? wb.worksheets.find((w) => w.name.toLowerCase() === name.toLowerCase()) : wb.worksheets[0]
  if (!ws) throw new Error(name ? `There’s no sheet called “${name}”. Sheets: ${wb.worksheets.map((w) => w.name).join(', ')}.` : 'This workbook has no sheets.')
  return ws
}

export type CellChange = { cell: string; value?: string; formula?: string }

export type SheetEdit = {
  sheet?: string
  changes?: CellChange[]
  /** Rows to delete, like "5-7, 10". */
  deleteRows?: string
  /** Rows to add at the end, as CSV. */
  appendRows?: string
}

/** Rows (1-based) from a spec like "5-7, 10", largest first so deleting keeps the others in place. Pure. */
export function rowList(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part)
    if (!m) throw new Error(`“${part}” isn’t a row number or range.`)
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b < a || b - a > 100_000) throw new Error(`“${part}” isn’t a valid range of rows.`)
    for (let i = a; i <= b; i++) out.add(i)
  }
  return [...out].sort((x, y) => y - x)
}

/** Edit a copy of a workbook: cells (values or formulas), deleted rows, appended rows. */
export async function editSheet(bytes: Uint8Array, e: SheetEdit): Promise<{ bytes: Uint8Array; summary: string[] }> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as any)
  const ws = sheetOf(wb, e.sheet)
  const summary: string[] = []
  for (const ch of e.changes ?? []) {
    const ref = ch.cell.trim().toUpperCase()
    if (!CELL_RE.test(ref)) throw new Error(`“${ch.cell}” isn’t a cell reference like B4.`)
    const cell = ws.getCell(ref)
    if (ch.formula != null && ch.formula.trim()) {
      cell.value = { formula: ch.formula.trim().replace(/^=/, '') } as any
      summary.push(`${ref} = ${ch.formula.trim().replace(/^=/, '')}`)
    } else {
      cell.value = cellValue(ch.value ?? '') as any
      summary.push(`${ref}: ${ch.value ?? '(cleared)'}`)
    }
  }
  if (e.deleteRows?.trim()) {
    const rows = rowList(e.deleteRows)
    for (const r of rows) ws.spliceRows(r, 1)
    summary.push(`deleted ${rows.length} row${rows.length === 1 ? '' : 's'}`)
  }
  if (e.appendRows?.trim()) {
    const rows = parseCsv(e.appendRows)
    for (const r of rows) ws.addRow(r.map(cellValue))
    summary.push(`added ${rows.length} row${rows.length === 1 ? '' : 's'}`)
  }
  if (!summary.length) throw new Error('No changes given.')
  // Spreadsheet apps recalculate formulas when the file opens.
  wb.calcProperties.fullCalcOnLoad = true
  return { bytes: new Uint8Array(await wb.xlsx.writeBuffer()), summary }
}

/** A tidy workbook from rows: bold header row, sensible column widths. */
export async function rowsToXlsx(rows: string[][], sheetName = 'Sheet1'): Promise<Uint8Array> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1')
  for (const r of rows) ws.addRow(r.map(cellValue))
  if (rows.length > 1) {
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  ws.columns.forEach((col, i) => {
    const width = Math.max(...rows.map((r) => (r[i] ?? '').length), 4)
    col.width = Math.min(60, width + 2)
  })
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

/** One sheet of a workbook as rows of text. */
export async function xlsxRows(bytes: Uint8Array, sheet?: string): Promise<string[][]> {
  const ExcelJS = await loadExcel()
  const { cellText } = await import('./read')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as any)
  const ws = sheetOf(wb, sheet)
  const rows: string[][] = []
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const vals: string[] = []
    for (let c = 1; c <= ws.actualColumnCount; c++) vals.push(cellText(row.getCell(c).value))
    rows[r - 1] = vals
  })
  return Array.from(rows, (r) => r ?? [])
}
