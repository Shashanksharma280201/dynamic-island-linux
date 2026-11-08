import { desktopCapturer, nativeImage, type Display } from 'electron'
// @ts-expect-error - x11 ships no types
import x11 from 'x11'
import { isPrivateWindow, type Shot } from '@shared/buddy'

type Rect = { x: number; y: number; width: number; height: number }

/** Fills each rectangle with black in a BGRA bitmap, clipped to it. Pure (changes `bmp`). */
export function blackOut(bmp: Buffer, width: number, height: number, rects: Rect[]): number {
  let n = 0
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(width, Math.ceil(r.x + r.width))
    const y1 = Math.min(height, Math.ceil(r.y + r.height))
    if (x1 <= x0 || y1 <= y0) continue
    n++
    for (let y = y0; y < y1; y++) {
      const row = y * width * 4
      for (let x = x0; x < x1; x++) {
        const i = row + x * 4
        bmp[i] = 0
        bmp[i + 1] = 0
        bmp[i + 2] = 0
        bmp[i + 3] = 255
      }
    }
  }
  return n
}

/** The size to send: the long edge at most `max`, never larger than captured. Pure. */
export function sendSize(width: number, height: number, max = 1920): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** Every top-level window's title and place on the screen (X11 pixels). */
export function listWindows(): Promise<{ title: string; rect: Rect }[]> {
  return new Promise((resolve) => {
    if (!process.env.DISPLAY) return resolve([])
    const timer = setTimeout(() => resolve([]), 3000)
    const display = x11.createClient((err: unknown, d: any) => {
      if (err || !d) {
        clearTimeout(timer)
        return resolve([])
      }
      const X = d.client
      const root = d.screen[0].root
      X.on('error', () => {})
      const done = (v: { title: string; rect: Rect }[]) => {
        clearTimeout(timer)
        try {
          X.terminate()
        } catch {}
        resolve(v)
      }
      const atom = (name: string) => new Promise<number>((res) => X.InternAtom(false, name, (e: unknown, a: number) => res(e ? 0 : a)))
      const prop = (win: number, a: number, type = 0) =>
        new Promise<Buffer | null>((res) => X.GetProperty(0, win, a, type, 0, 100_000, (e: unknown, p: any) => res(e || !p?.data?.length ? null : p.data)))
      const ids = (b: Buffer | null) => (b ? Array.from({ length: b.length / 4 }, (_x, i) => b.readUInt32LE(i * 4)) : [])
      const run = async () => {
        const [list, netName, utf8] = await Promise.all([atom('_NET_CLIENT_LIST'), atom('_NET_WM_NAME'), atom('UTF8_STRING')])
        let wins = ids(await prop(root, list))
        // No window manager (tests): the top-level windows themselves.
        if (!wins.length) wins = await new Promise<number[]>((res) => X.QueryTree(root, (e: unknown, t: any) => res(e ? [] : t.children)))
        const out: { title: string; rect: Rect }[] = []
        for (const id of wins) {
          const title = ((await prop(id, netName, utf8))?.toString('utf8') || (await prop(id, 39 /* WM_NAME */))?.toString('latin1') || '').replace(/\0/g, '').trim()
          if (!title) continue
          const rect = await new Promise<Rect | null>((res) =>
            X.GetGeometry(id, (e: unknown, g: any) => {
              if (e || !g) return res(null)
              X.TranslateCoordinates(id, root, 0, 0, (e2: unknown, t: any) => res(e2 || !t ? null : { x: t.destX, y: t.destY, width: g.width, height: g.height }))
            }),
          )
          if (rect && rect.width > 1 && rect.height > 1) out.push({ title, rect })
        }
        done(out)
      }
      run().catch(() => done([]))
    })
    display?.on?.('error', () => {
      clearTimeout(timer)
      resolve([])
    })
  })
}

/**
 * A screenshot of one display for the model: private windows blacked out
 * first, then scaled down. Only ever in memory.
 */
export async function captureScreen(d: Display, privateWords: string[]): Promise<{ jpeg: string; shot: Shot; blanked: number } | null> {
  const k = d.scaleFactor || 1
  const full = { width: Math.round(d.size.width * k), height: Math.round(d.size.height * k) }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: full })
  const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0]
  if (!src || src.thumbnail.isEmpty()) return null
  let img = src.thumbnail
  const size = img.getSize()
  // X11 windows are in device pixels from the root's corner; the capture is this display only.
  const ox = d.bounds.x * k
  const oy = d.bounds.y * k
  const sx = size.width / full.width
  const sy = size.height / full.height
  const hidden = (await listWindows())
    .filter((w) => isPrivateWindow(w.title, privateWords))
    .map((w) => ({ x: (w.rect.x - ox) * sx, y: (w.rect.y - oy) * sy, width: w.rect.width * sx, height: w.rect.height * sy }))
  let blanked = 0
  if (hidden.length) {
    const bmp = Buffer.from(img.toBitmap())
    blanked = blackOut(bmp, size.width, size.height, hidden)
    if (blanked) img = nativeImage.createFromBitmap(bmp, { width: size.width, height: size.height })
  }
  const out = sendSize(size.width, size.height)
  if (out.width !== size.width) img = img.resize({ ...out, quality: 'good' })
  return {
    jpeg: img.toJPEG(80).toString('base64'),
    shot: { width: out.width, height: out.height, origin: { x: d.bounds.x, y: d.bounds.y }, screen: { width: d.bounds.width, height: d.bounds.height } },
    blanked,
  }
}
