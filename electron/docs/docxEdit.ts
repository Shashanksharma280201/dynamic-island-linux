import JSZip from 'jszip'
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element } from '@xmldom/xmldom'

/**
 * Corrections in a Word file, made as tracked changes (insertions and
 * deletions shown in Word / LibreOffice, to accept or reject one by one) or
 * applied directly. Works on the document XML so the formatting stays as it
 * was: a run that's partly changed is split, keeping its look.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

export type DocxEdit = { find: string; replace: string }
export type DocxEditOptions = { tracked: boolean; author: string; date?: Date }
export type DocxEditResult = { bytes: Uint8Array; applied: { find: string; count: number }[]; notFound: string[] }

/** The parts of a .docx that hold visible text. */
const TEXT_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/

const isW = (n: any, local: string) => n && n.nodeType === 1 && n.namespaceURI === W && n.localName === local

/** The nearest ancestor (or self) that's a w:<local>, stopping at `stop`. */
function closest(n: any, local: string, stop?: any): Element | null {
  for (let x = n; x && x !== stop; x = x.parentNode) if (isW(x, local)) return x
  return null
}

type Seg = { run: Element; kind: 'text' | 'other'; text: string }

/** Content children of a run (everything but its properties). */
const contents = (run: Element) => Array.from(run.childNodes).filter((c: any) => c.nodeType === 1 && !isW(c, 'rPr')) as Element[]

/** Split a run that holds several pieces of content into one run per piece, so each can change on its own. */
function normalizeRun(run: Element): Element[] {
  const kids = contents(run)
  if (kids.length <= 1) return [run]
  const doc = run.ownerDocument!
  const rPr = Array.from(run.childNodes).find((c: any) => isW(c, 'rPr')) as Element | undefined
  const out: Element[] = []
  for (const k of kids) {
    const r = doc.createElementNS(W, 'w:r')
    if (rPr) r.appendChild(rPr.cloneNode(true))
    r.appendChild(k.cloneNode(true))
    run.parentNode!.insertBefore(r, run)
    out.push(r)
  }
  run.parentNode!.removeChild(run)
  return out
}

/** The visible text pieces of a paragraph, in order (accepted view: deletions left out). */
function segments(p: Element): Seg[] {
  const runs = Array.from(p.getElementsByTagNameNS(W, 'r')).filter(
    (r) => closest(r.parentNode, 'p') === p && !closest(r, 'del', p) && !closest(r, 'moveFrom', p),
  )
  const segs: Seg[] = []
  for (const r0 of runs) {
    for (const r of normalizeRun(r0)) {
      const [k] = contents(r)
      if (!k) continue
      if (isW(k, 't')) segs.push({ run: r, kind: 'text', text: k.textContent ?? '' })
      else if (isW(k, 'tab')) segs.push({ run: r, kind: 'other', text: '\t' })
      else if (isW(k, 'br') || isW(k, 'cr')) segs.push({ run: r, kind: 'other', text: '\n' })
      // drawings, field codes… aren't text: they neither match nor break a match
    }
  }
  return segs
}

function setText(t: Element, text: string): void {
  while (t.firstChild) t.removeChild(t.firstChild)
  t.appendChild(t.ownerDocument!.createTextNode(text))
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
}

/** Split a text run at `offset`; returns [left, right]. */
function splitRun(seg: Seg, offset: number): [Seg, Seg] {
  const right = seg.run.cloneNode(true) as Element
  seg.run.parentNode!.insertBefore(right, seg.run.nextSibling)
  setText(contents(seg.run)[0], seg.text.slice(0, offset))
  setText(contents(right)[0], seg.text.slice(offset))
  return [
    { run: seg.run, kind: 'text', text: seg.text.slice(0, offset) },
    { run: right, kind: 'text', text: seg.text.slice(offset) },
  ]
}

/** The runs covering [start, end) of the paragraph's text, split so they cover exactly that. */
function isolate(p: Element, start: number, end: number): Seg[] | null {
  const segs = segments(p)
  let pos = 0
  const out: Seg[] = []
  for (let i = 0; i < segs.length; i++) {
    let s = segs[i]
    const a = pos
    const b = pos + s.text.length
    pos = b
    if (b <= start || a >= end) continue
    if (s.kind === 'other' && (a < start || b > end)) return null
    if (s.kind === 'text' && a < start) {
      ;[, s] = splitRun(s, start - a)
    }
    const from = Math.max(a, start)
    if (s.kind === 'text' && b > end) {
      ;[s] = splitRun(s, end - from)
    }
    out.push(s)
  }

  return out.length ? out : null
}

type Ctx = { doc: XmlDocument; tracked: boolean; author: string; date: string; nextId: () => string }

function apply(p: Element, start: number, end: number, replace: string, c: Ctx): boolean {
  const hit = isolate(p, start, end)
  if (!hit) return false
  const first = hit[0].run
  const rPr = Array.from(first.childNodes).find((n: any) => isW(n, 'rPr')) as Element | undefined
  const newRun = () => {
    const r = c.doc.createElementNS(W, 'w:r')
    if (rPr) r.appendChild(rPr.cloneNode(true))
    const t = c.doc.createElementNS(W, 'w:t')
    setText(t, replace)
    r.appendChild(t)
    return r
  }
  if (!c.tracked) {
    const last = hit[hit.length - 1].run
    if (replace) last.parentNode!.insertBefore(newRun(), last.nextSibling)
    for (const s of hit) s.run.parentNode!.removeChild(s.run)
    return true
  }
  const mark = (el: Element) => {
    el.setAttributeNS(W, 'w:id', c.nextId())
    el.setAttributeNS(W, 'w:author', c.author)
    el.setAttributeNS(W, 'w:date', c.date)
    return el
  }
  let lastDel: Element | null = null
  for (const s of hit) {
    const del = mark(c.doc.createElementNS(W, 'w:del'))
    s.run.parentNode!.insertBefore(del, s.run)
    del.appendChild(s.run)
    // Deleted text is stored as w:delText.
    for (const t of contents(s.run).filter((k) => isW(k, 't'))) {
      const dt = c.doc.createElementNS(W, 'w:delText')
      setText(dt, t.textContent ?? '')
      s.run.replaceChild(dt, t)
    }
    lastDel = del
  }
  if (replace && lastDel) {
    const ins = mark(c.doc.createElementNS(W, 'w:ins'))
    ins.appendChild(newRun())
    lastDel.parentNode!.insertBefore(ins, lastDel.nextSibling)
  }
  return true
}

/** Apply corrections to a .docx (in memory); the original file is untouched. */
export async function editDocx(bytes: Uint8Array, edits: DocxEdit[], o: DocxEditOptions): Promise<DocxEditResult> {
  if (!edits.length) throw new Error('No corrections given.')
  const zip = await JSZip.loadAsync(bytes)
  const parts = Object.keys(zip.files).filter((f) => TEXT_PARTS.test(f))
  if (!parts.includes('word/document.xml')) throw new Error('This isn’t a Word document (no word/document.xml).')
  const counts = new Map<string, number>(edits.map((e) => [e.find, 0]))
  const date = (o.date ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z')
  // Change ids must be unique across the whole document.
  let maxId = 0
  const docs = new Map<string, XmlDocument>()
  for (const part of parts) {
    const xml = await zip.file(part)!.async('string')
    const doc = new DOMParser().parseFromString(xml, 'text/xml') as unknown as XmlDocument
    docs.set(part, doc)
    for (const m of xml.matchAll(/w:id="(\d+)"/g)) maxId = Math.max(maxId, Number(m[1]))
  }
  const ctx = (doc: XmlDocument): Ctx => ({ doc, tracked: o.tracked, author: o.author, date, nextId: () => String(++maxId) })
  for (const [part, doc] of docs) {
    const c = ctx(doc)
    const paras = Array.from(doc.getElementsByTagNameNS(W, 'p'))
    for (const e of edits) {
      if (!e.find) continue
      for (const p of paras) {
        let from = 0
        for (let guard = 0; guard < 500; guard++) {
          const text = segments(p).map((s) => s.text).join('')
          const at = text.indexOf(e.find, from)
          if (at < 0) break
          if (!apply(p, at, at + e.find.length, e.replace, c)) {
            from = at + 1
            continue
          }
          counts.set(e.find, (counts.get(e.find) ?? 0) + 1)
          from = at + e.replace.length
        }
      }
    }
    zip.file(part, new XMLSerializer().serializeToString(doc as any))
  }
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return {
    bytes: out,
    applied: edits.map((e) => ({ find: e.find, count: counts.get(e.find) ?? 0 })).filter((a) => a.count > 0),
    notFound: edits.filter((e) => !counts.get(e.find)).map((e) => e.find),
  }
}
