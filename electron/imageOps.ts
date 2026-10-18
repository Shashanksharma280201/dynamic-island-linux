import { BrowserWindow, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { extOf } from '@shared/dragActions'

/** Largest image the island will convert (bigger ones are rarely photos). */
export const MAX_IMAGE_BYTES = 60 * 1024 * 1024

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

let win: BrowserWindow | null = null

/**
 * A hidden page that draws images on a canvas: it decodes and encodes PNG,
 * JPEG and WebP the same way on every system. No network, no files: the
 * image comes in as data and goes out as data.
 */
async function canvasPage(): Promise<BrowserWindow> {
  if (win && !win.isDestroyed()) return win
  const ses = session.fromPartition('island-images') // in memory, never saved
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !d.url.startsWith('data:') && d.url !== 'about:blank' }))
  ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } })
  win.on('closed', () => (win = null))
  await win.loadURL('about:blank')
  return win
}

export type Encoded = { bytes: Buffer; width: number; height: number }

/** An image file re-encoded as `to`, at most `maxSide` px on its longer side. */
export async function encodeImage(path: string, to: 'png' | 'jpg' | 'webp', o: { maxSide?: number; quality?: number } = {}): Promise<Encoded> {
  const from = MIME[extOf(path)]
  if (!from) throw new Error('That kind of image isn’t supported.')
  const data = await readFile(path)
  if (data.length > MAX_IMAGE_BYTES) throw new Error('That image is too big to convert here.')
  const page = await canvasPage()
  const src = `data:${from};base64,${data.toString('base64')}`
  const type = MIME[to]
  const r = await page.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = ${JSON.stringify(src)}
    await img.decode()
    let w = img.naturalWidth, h = img.naturalHeight
    const max = ${Number(o.maxSide) || 0}
    if (max && Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k) }
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    // JPEG has no transparency: a white page behind it, as a viewer would show.
    if (${JSON.stringify(type)} === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h) }
    g.drawImage(img, 0, 0, w, h)
    return { url: c.toDataURL(${JSON.stringify(type)}, ${Number(o.quality) || 0.9}), w, h }
  })()`)
  const url = String(r?.url ?? '')
  if (!url.startsWith(`data:${type}`)) throw new Error('The image couldn’t be read.')
  return { bytes: Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), width: r.w, height: r.h }
}

/** An image as a one-page PDF, the page the size of the picture. */
export async function imageToPdf(path: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const ext = extOf(path)
  const bytes = ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? await readFile(path) : (await encodeImage(path, 'png')).bytes
  const doc = await PDFDocument.create()
  const img = ext === 'jpg' || ext === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
  // 96 pixels to the inch, as on screen.
  const w = img.width * 0.75
  const h = img.height * 0.75
  doc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h })
  return doc.save()
}

export function closeImagePage(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
}
