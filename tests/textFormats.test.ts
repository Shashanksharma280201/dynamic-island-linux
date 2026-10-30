import { decodeEntities, htmlToText, odfText, odsRows, parseTsv, rowsToJson, rtfToText, toTsv } from '@shared/textFormats'

test('entities', () => {
  expect(decodeEntities('Tom &amp; Jerry &lt;3 &#8364;5 &#x41; &bogus;')).toBe('Tom & Jerry <3 €5 A &bogus;')
})

test('a web page as text', () => {
  const html = `<html><head><title>T</title><style>p{color:red}</style></head><body>
    <h1>Report</h1><script>alert(1)</script>
    <p>Sales were <b>up</b>&nbsp;12%.<br>Costs flat.</p>
    <ul><li>North</li><li>South</li></ul>
    <table><tr><th>Region</th><th>Q1</th></tr><tr><td>North</td><td>10</td></tr></table>
  </body></html>`
  expect(htmlToText(html)).toBe('Report\nSales were up\u00a012%.\nCosts flat.\n\n• North\n• South\nRegion\tQ1\nNorth\t10')
})

test('an RTF document as text', () => {
  const rtf =
    "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times;}}{\\colortbl;\\red0\\green0\\blue0;}{\\*\\generator Word;}\\pard Hello {\\b world}\\par Caf\\'e9 \\u8364? price\\tab 5\\par{\\*\\expandedcolortbl;;}Line \\{3\\}}"
  expect(rtfToText(rtf)).toBe('Hello world\nCafé € price\t5\nLine {3}')
  expect(rtfToText('not rtf')).toBe('not rtf')
})

test('an OpenDocument text or presentation', () => {
  const xml = `<office:document-content><office:body><office:text>
    <text:h text:outline-level="1">Plan</text:h>
    <text:p>First<text:s text:c="2"/>step<text:tab/>now</text:p>
    <text:p/>
    <text:list><text:list-item><text:p>One &amp; two</text:p></text:list-item></text:list>
    <text:p>Note<text:note><text:note-body><text:p>hidden</text:p></text:note-body></text:note> here</text:p>
  </office:text></office:body></office:document-content>`
  expect(odfText(xml)).toBe('Plan\nFirst  step\tnow\n\nOne & two\nNote here')
})

test('an OpenDocument sheet', () => {
  const xml = `<office:body><office:spreadsheet><table:table table:name="S">
    <table:table-row><table:table-cell><text:p>Name</text:p></table:table-cell><table:table-cell><text:p>Qty</text:p></table:table-cell></table:table-row>
    <table:table-row><table:table-cell><text:p>Pens</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"><text:p>3</text:p></table:table-cell></table:table-row>
    <table:table-row table:number-rows-repeated="2"><table:table-cell><text:p>x</text:p></table:table-cell></table:table-row>
    <table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>
  </table:table></office:spreadsheet></office:body>`
  expect(odsRows(xml)).toEqual([['Name', 'Qty'], ['Pens', '3', '3'], ['x'], ['x']])
})

test('tab-separated rows', () => {
  expect(parseTsv('﻿a\tb\r\n1\t2\n\n')).toEqual([['a', 'b'], ['1', '2'], []].slice(0, 2))
  expect(toTsv([['a b', 'c\td'], ['1', 'x\ny']])).toBe('a b\tc d\n1\tx y')
})

test('rows as JSON', () => {
  const json = JSON.parse(rowsToJson([['Name', 'Qty', '', 'Name'], ['Pens', '3', 'blue', 'x'], ['', '', '', ''], ['Ink', '-1.5', 'TRUE', '']]))
  expect(json).toEqual([
    { Name: 'Pens', Qty: 3, 'Column 3': 'blue', 'Name 2': 'x' },
    { Name: 'Ink', Qty: -1.5, 'Column 3': true, 'Name 2': null },
  ])
  expect(rowsToJson([])).toBe('[]\n')
  // Long digit strings (phone numbers, ids) stay text.
  expect(JSON.parse(rowsToJson([['id'], ['00123'], ['12345678901234567890']]))).toEqual([{ id: '00123' }, { id: '12345678901234567890' }])
})
