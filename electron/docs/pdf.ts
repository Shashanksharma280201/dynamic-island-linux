import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage } from 'pdf-lib'

/** Open a PDF, with a readable error for the common failures. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (e: any) {
    if (/encrypt/i.test(String(e?.message))) throw new Error('This PDF is password-protected, so it can’t be changed.')
    throw new Error(`This PDF couldn’t be read (${String(e?.message ?? e).slice(0, 120)}).`)
  }
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await loadPdf(bytes)).getPageCount()
}

const save = (doc: PDFDocument) => doc.save({ useObjectStreams: true })

/** One PDF made of all pages of several, in order. */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  if (files.length < 2) throw new Error('Merging needs at least two PDFs.')
  const out = await PDFDocument.create()
  for (const bytes of files) {
    const src = await loadPdf(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    for (const p of pages) out.addPage(p)
  }
  return save(out)
}

/** A new PDF with exactly these pages (0-based), in this order. */
export async function selectPages(bytes: Uint8Array, indexes: number[]): Promise<Uint8Array> {
  if (!indexes.length) throw new Error('That leaves no pages.')
  const src = await loadPdf(bytes)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indexes)
  for (const p of pages) out.addPage(p)
  return save(out)
}

/** A new PDF without these pages. */
export async function deletePages(bytes: Uint8Array, indexes: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes)
  const drop = new Set(indexes)
  const keep = src.getPageIndices().filter((i) => !drop.has(i))
  if (!keep.length) throw new Error('That would delete every page.')
  return selectPages(bytes, keep)
}

/** Rotate pages (all, or these 0-based ones) clockwise by a multiple of 90°. */
export async function rotatePages(bytes: Uint8Array, by: number, indexes?: number[]): Promise<Uint8Array> {
  if (by % 90 !== 0) throw new Error('Pages can only turn by 90, 180 or 270 degrees.')
  const doc = await loadPdf(bytes)
  const pick = new Set(indexes ?? doc.getPageIndices())
  doc.getPages().forEach((p, i) => {
    if (pick.has(i)) p.setRotation(degrees((((p.getRotation().angle + by) % 360) + 360) % 360))
  })
  return save(doc)
}

/** Several PDFs, one per group of 0-based page indexes. */
export async function splitPdf(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = []
  for (const g of groups) out.push(await selectPages(bytes, g))
  return out
}

/** Groups of `every` pages: [[0,1],[2,3],[4]]. Pure. */
export function chunkPages(count: number, every: number): number[][] {
  if (!Number.isInteger(every) || every < 1) throw new Error('Split every 1 page or more.')
  const groups: number[][] = []
  for (let i = 0; i < count; i += every) groups.push(Array.from({ length: Math.min(every, count - i) }, (_, k) => i + k))
  return groups
}

export type StampOptions = {
  /** Text to put on every page. */
  text?: string
  /** Where the text goes. */
  position?: 'watermark' | 'header' | 'footer'
  /** Add "Page 3 of 10" at the bottom. */
  pageNumbers?: boolean
}

/** Write a watermark, header, footer and/or page numbers on every page. */
export async function stampPdf(bytes: Uint8Array, o: StampOptions): Promise<Uint8Array> {
  if (!o.text?.trim() && !o.pageNumbers) throw new Error('Say what to add: some text, page numbers, or both.')
  const doc = await loadPdf(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const text = o.text?.trim() ?? ''
  // The standard PDF fonts only cover Latin letters.
  for (const [f, t] of [[font, text], [bold, text]] as const) {
    try {
      f.encodeText(t)
    } catch {
      throw new Error('Stamped text can only use Latin letters, digits and common symbols.')
    }
  }
  const pages = doc.getPages()
  pages.forEach((page: PDFPage, i) => {
    const { width, height } = page.getSize()
    if (text) {
      const where = o.position ?? 'watermark'
      if (where === 'watermark') {
        const size = Math.min(72, (Math.hypot(width, height) * 0.7) / Math.max(4, text.length * 0.6))
        const w = bold.widthOfTextAtSize(text, size)
        const angle = Math.atan2(height, width)
        page.drawText(text, {
          x: width / 2 - (Math.cos(angle) * w) / 2,
          y: height / 2 - (Math.sin(angle) * w) / 2,
          size,
          font: bold,
          color: rgb(0.75, 0.1, 0.1),
          opacity: 0.18,
          rotate: degrees((angle * 180) / Math.PI),
        })
      } else {
        const size = 10
        const w = font.widthOfTextAtSize(text, size)
        page.drawText(text, { x: (width - w) / 2, y: where === 'header' ? height - 28 : 18, size, font, color: rgb(0.35, 0.35, 0.35) })
      }
    }
    if (o.pageNumbers) {
      const label = `Page ${i + 1} of ${pages.length}`
      const size = 9
      const w = font.widthOfTextAtSize(label, size)
      page.drawText(label, { x: width - w - 28, y: 18, size, font, color: rgb(0.35, 0.35, 0.35) })
    }
  })
  return save(doc)
}
