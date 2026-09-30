import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, ipcMain: {}, shell: {}, protocol: {}, BrowserWindow: class {} }))
import { byteRange, mediaUrl, parseMediaUrl } from '../electron/inbox'
import { downloadMediaInPage } from '../electron/providers/whatsappStore'

test('media URLs round-trip chat and message ids', () => {
  const url = mediaUrl('120363@g.us', 'false_120363@g.us_3EB0ABC_91987@c.us')
  expect(url).toBe('island-media://wa/120363%40g.us/false_120363%40g.us_3EB0ABC_91987%40c.us')
  expect(parseMediaUrl(url)).toEqual({ chatId: '120363@g.us', msgId: 'false_120363@g.us_3EB0ABC_91987@c.us' })
  expect(parseMediaUrl('island-media://other/a/b')).toBeNull()
  expect(parseMediaUrl('island-media://wa/only-one')).toBeNull()
  expect(parseMediaUrl('https://wa/a/b')).toBeNull()
})

test('byte ranges for seeking in videos', () => {
  expect(byteRange(null, 100)).toBeNull()
  expect(byteRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 })
  expect(byteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
  expect(byteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
  expect(byteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  expect(byteRange('bytes=200-', 100)).toBeNull()
  expect(byteRange('bytes=5-2', 100)).toBeNull()
  expect(byteRange('items=0-1', 100)).toBeNull()
})

// ---- the in-page downloader, against a stand-in WhatsApp Web ----
class FakeReader {
  result: string | null = null
  error: unknown = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(b: Blob) {
    b.arrayBuffer().then((ab) => {
      this.result = `data:${b.type};base64,${Buffer.from(ab).toString('base64')}`
      this.onload?.()
    })
  }
}
const bytes = (s: string) => new TextEncoder().encode(s).buffer
function page(msg: any, decrypt: (o: any) => Promise<ArrayBuffer>) {
  ;(globalThis as any).window = {
    require: (name: string) => {
      if (name === 'WAWebCollections') return { Msg: { get: (id: string) => (id === 'm1' ? msg : undefined), getMessagesById: async () => ({ messages: [] }) } }
      if (name === 'WAWebDownloadManager') return { downloadManager: { downloadAndMaybeDecrypt: decrypt } }
      throw new Error(name)
    },
  }
}
beforeEach(() => {
  ;(globalThis as any).FileReader = FakeReader
})
afterEach(() => {
  delete (globalThis as any).window
  delete (globalThis as any).FileReader
})

test('downloads and decrypts straight from WhatsApp', async () => {
  const seen: any[] = []
  page({ type: 'image', mimetype: 'image/jpeg', directPath: '/v/1', mediaKey: 'k', mediaData: { mediaStage: 'INIT' } }, async (o) => (seen.push(o), bytes('JPEGDATA')))
  const r = await downloadMediaInPage('m1')
  expect(Buffer.from(r.data, 'base64').toString()).toBe('JPEGDATA')
  expect(r.mimetype).toBe('image/jpeg')
  expect(seen[0]).toMatchObject({ directPath: '/v/1', mediaKey: 'k', type: 'image' })
})

test('uses the copy WhatsApp already has', async () => {
  const blob = new Blob(['KEPT'], { type: 'video/mp4' })
  page({ type: 'video', mimetype: 'video/mp4', mediaData: { mediaStage: 'RESOLVED', mediaBlob: { forceToBlob: () => blob } } }, async () => {
    throw new Error('should not be called')
  })
  expect(Buffer.from((await downloadMediaInPage('m1')).data, 'base64').toString()).toBe('KEPT')
})

test('an expired link is re-requested through WhatsApp, then retried', async () => {
  let resolved = false
  const msg: any = {
    type: 'document',
    mimetype: 'application/pdf',
    filename: 'a.pdf',
    mediaData: { mediaStage: 'INIT' },
    downloadMedia: async () => {
      resolved = true
      msg.mediaData.mediaStage = 'RESOLVED'
    },
  }
  page(msg, async () => {
    if (!resolved) throw new Error('410 gone')
    return bytes('PDF')
  })
  const r = await downloadMediaInPage('m1')
  expect(resolved).toBe(true)
  expect(r).toMatchObject({ mimetype: 'application/pdf', filename: 'a.pdf' })
  expect(Buffer.from(r.data, 'base64').toString()).toBe('PDF')
})

test('media the phone no longer has says so', async () => {
  const msg: any = {
    type: 'image',
    mediaData: { mediaStage: 'INIT' },
    downloadMedia: async () => void (msg.mediaData.mediaStage = 'FETCHING_ERROR'),
  }
  page(msg, async () => {
    throw new Error('404')
  })
  await expect(downloadMediaInPage('m1')).rejects.toThrow(/no longer available/)
  await expect(downloadMediaInPage('nope')).rejects.toThrow(/not found/)
})
