import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { anyText, convertSheet, sheetRows, type AnyDocDeps } from '../electron/anyDoc'

const dir = mkdtempSync(join(tmpdir(), 'island-anydoc-'))
const deps: AnyDocDeps = { soffice: () => null, tesseract: () => null, pdftoppm: () => null, printPdf: async () => new Uint8Array() }
const has = (bin: string) => {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function ods(): Promise<string> {
  const zip = new JSZip()
  zip.file('content.xml', '<office:body><office:spreadsheet><table:table><table:table-row><table:table-cell><text:p>City</text:p></table:table-cell><table:table-cell><text:p>Pop</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>Pune</text:p></table:table-cell><table:table-cell><text:p>7</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body>')
  const p = join(dir, 'Cities.ods')
  writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer' }))
  return p
}

test('every kind of sheet reads as rows', async () => {
  const csv = join(dir, 'a.csv')
  writeFileSync(csv, '﻿Name,Qty\n"Pens, blue",3\n')
  const tsv = join(dir, 'a.tsv')
  writeFileSync(tsv, 'Name\tQty\nInk\t2\n')
  expect(await sheetRows(csv, 'csv', deps)).toEqual([['Name', 'Qty'], ['Pens, blue', '3']])
  expect(await sheetRows(tsv, 'tsv', deps)).toEqual([['Name', 'Qty'], ['Ink', '2']])
  expect(await sheetRows(await ods(), 'ods', deps)).toEqual([['City', 'Pop'], ['Pune', '7']])
  await expect(sheetRows(join(dir, 'old.xls'), 'xls', deps)).rejects.toThrow('Opening .xls files needs LibreOffice')
})

test('a sheet converts to JSON, TSV, Markdown and Excel', async () => {
  const p = await ods()
  const json = await convertSheet(p, 'ods', 'json', 'Cities', deps)
  expect(JSON.parse(Buffer.from(json.bytes).toString())).toEqual([{ City: 'Pune', Pop: 7 }])
  expect(Buffer.from((await convertSheet(p, 'ods', 'tsv', 'Cities', deps)).bytes).toString()).toBe('City\tPop\nPune\t7\n')
  expect(Buffer.from((await convertSheet(p, 'ods', 'md', 'Cities', deps)).bytes).toString()).toContain('| Pune | 7 |')
  const xlsx = await convertSheet(p, 'ods', 'xlsx', 'Cities', deps)
  const back = join(dir, 'back.xlsx')
  writeFileSync(back, xlsx.bytes)
  expect(await sheetRows(back, 'xlsx', deps)).toEqual([['City', 'Pop'], ['Pune', '7']])
})

test('the text of documents the island knows now', async () => {
  const html = join(dir, 'page.html')
  writeFileSync(html, '<h1>Hi</h1><p>there &amp; <b>you</b></p>')
  const json = join(dir, 'data.json')
  writeFileSync(json, '{"a": 1}')
  const bin = join(dir, 'blob.json')
  writeFileSync(bin, Buffer.from([1, 0, 2, 0]))
  expect(await anyText(html, 'html', deps)).toBe('Hi\nthere & you')
  expect(await anyText(json, 'json', deps)).toBe('{"a": 1}')
  await expect(anyText(bin, 'json', deps)).rejects.toThrow('isn’t text')
  // Sheets come as rows, ready to paste into a spreadsheet.
  expect(await anyText(await ods(), 'ods', deps)).toBe('City\tPop\nPune\t7')
  await expect(anyText(join(dir, 'x.png'), 'png', deps)).rejects.toThrow('needs tesseract')
})

test.skipIf(!has('tesseract') || !has('convert'))('the words in an image, by OCR', async () => {
  const img = join(dir, 'note.png')
  execFileSync('convert', ['-size', '900x200', 'xc:white', '-font', 'DejaVu-Sans', '-pointsize', '64', '-fill', 'black', '-annotate', '+40+120', 'Invoice 4521', img])
  const text = await anyText(img, 'png', { ...deps, tesseract: () => 'tesseract' })
  expect(text).toContain('Invoice 4521')
})
