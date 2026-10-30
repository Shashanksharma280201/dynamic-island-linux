import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DropServer, type DropEvents } from '../electron/dropServer'
import {
  cleanDevice,
  cleanFileName,
  dropAddresses,
  dropKind,
  dropPairingLink,
  dropTitle,
  freeName,
  parseApproach,
  parseDropConfig,
  sizeText,
} from '@shared/drop'

describe('drop protocol', () => {
  test('file names are safe to save as', () => {
    expect(cleanFileName('IMG_2041.jpg')).toBe('IMG_2041.jpg')
    expect(cleanFileName('../../.bashrc')).toBe('bashrc')
    expect(cleanFileName('C:\\Users\\me\\Report.pdf')).toBe('Report.pdf')
    expect(cleanFileName('a\u0000b<c>.txt')).toBe('abc.txt')
    expect(cleanFileName('...')).toBe('file')
    expect(cleanFileName('')).toBe('file')
    const long = cleanFileName('x'.repeat(300) + '.jpeg')
    expect(long.length).toBe(150)
    expect(long.endsWith('.jpeg')).toBe(true)
  })

  test('a taken name gets a number', () => {
    const taken = new Set(['Photo.jpg', 'Photo (2).jpg', 'notes'])
    expect(freeName('Photo.jpg', (n) => taken.has(n))).toBe('Photo (3).jpg')
    expect(freeName('notes', (n) => taken.has(n))).toBe('notes (2)')
    expect(freeName('new.png', (n) => taken.has(n))).toBe('new.png')
  })

  test('an approach is checked', () => {
    const ok = parseApproach({ id: 'abc123', side: 'right', at: 1.7, files: [{ name: '../x.jpg', size: 10 }], device: 'Pixel 8', thumb: 'data:image/jpeg;base64,AAAA' })
    expect(ok).toEqual({ id: 'abc123', side: 'right', at: 1, files: [{ name: 'x.jpg', size: 10 }], device: 'Pixel 8', thumb: 'data:image/jpeg;base64,AAAA' })
    expect(parseApproach({ ...ok, side: 'middle' })).toBeNull()
    expect(parseApproach({ ...ok, id: 'a/b' })).toBeNull()
    expect(parseApproach({ ...ok, files: [] })).toBeNull()
    expect(parseApproach({ ...ok, files: [{ name: 'x', size: -1 }] })).toBeNull()
    expect(parseApproach({ ...ok, thumb: 'javascript:alert(1)' })?.thumb).toBeUndefined()
    expect(parseApproach({ ...ok, device: '<b>' })?.device).toBe('b')
    expect(cleanDevice(undefined)).toBe('Your phone')
  })

  test('kinds, sizes and titles', () => {
    expect(dropKind('a.HEIC')).toBe('image')
    expect(dropKind('deck.pptx')).toBe('slides')
    expect(dropKind('noext')).toBe('file')
    expect(sizeText(2_300_000)).toBe('2.2 MB')
    expect(sizeText(512)).toBe('512 B')
    expect(dropTitle([{ name: 'a.jpg', size: 1 }])).toBe('a.jpg')
    expect(dropTitle([{ name: 'a.jpg', size: 1 }, { name: 'b.png', size: 1 }])).toBe('2 photos')
    expect(dropTitle([{ name: 'a.jpg', size: 1 }, { name: 'b.pdf', size: 1 }])).toBe('2 files')
  })

  test('addresses: Wi-Fi first, then Tailscale, then others, no bridges', () => {
    const urls = dropAddresses(
      {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
        tailscale0: [{ address: '100.101.102.103', family: 'IPv4', internal: false }],
        wlp2s0: [
          { address: '192.168.1.20', family: 'IPv4', internal: false },
          { address: 'fe80::1', family: 'IPv6', internal: false },
        ],
        eth9: [{ address: '169.254.3.3', family: 'IPv4', internal: false }],
        eth1: [{ address: '203.0.113.7', family: 'IPv4', internal: false }],
      },
      8790,
    )
    expect(urls).toEqual(['http://192.168.1.20:8790', 'http://100.101.102.103:8790', 'http://203.0.113.7:8790'])
  })

  test('the pairing link', () => {
    const link = dropPairingLink('my laptop', 'tok&en', ['http://192.168.1.20:8790'])
    expect(link).toBe('islanddrop://pair?v=1&name=my%20laptop&token=tok%26en&url=http%3A%2F%2F192.168.1.20%3A8790')
  })

  test('config', () => {
    expect(parseDropConfig(null)).toEqual({ on: false, folder: 'downloads', port: 8790, secret: '' })
    expect(parseDropConfig({ on: true, folder: '/home/me/Inbox', port: 9000, secret: 'enc:x' })).toEqual({ on: true, folder: '/home/me/Inbox', port: 9000, secret: 'enc:x' })
    expect(parseDropConfig({ folder: 'relative/path', port: 80 })).toEqual({ on: false, folder: 'downloads', port: 8790, secret: '' })
  })
})

describe('drop server', () => {
  const TOKEN = 'a'.repeat(43)
  let folder: string
  let server: DropServer
  let port: number
  let log: string[]

  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), 'island-drop-'))
    log = []
    const events: DropEvents = {
      approach: (a) => log.push(`approach ${a.id} ${a.side}`),
      cancel: (id) => log.push(`cancel ${id}`),
      start: (id, i, name, size) => log.push(`start ${id} ${i} ${name} ${size}`),
      progress: () => {},
      saved: (id, i, path) => log.push(`saved ${id} ${i} ${basename(path)}`),
      failed: (id, why) => log.push(`failed ${id} ${why}`),
    }
    server = new DropServer({ token: () => TOKEN, folder: () => folder, name: () => 'test-laptop', events })
    port = 20000 + Math.floor(Math.random() * 20000)
    expect(await server.start(port, '127.0.0.1')).toBeNull()
  })
  afterEach(() => server.stop())

  const call = (path: string, init: RequestInit = {}, token = TOKEN) =>
    fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })

  test('says hello only with the token', async () => {
    const r = await call('/drop/hello')
    expect(await r.json()).toEqual({ ok: true, protocol: 1, app: 'dynamic-island', name: 'test-laptop' })
    expect((await call('/drop/hello', {}, 'b'.repeat(43))).status).toBe(401)
    expect((await call('/drop/hello', {}, '')).status).toBe(401)
  })

  test('approach and cancel', async () => {
    const r = await call('/drop/approach', { method: 'POST', body: JSON.stringify({ id: 'drop01', side: 'left', at: 0.5, files: [{ name: 'a.jpg', size: 3 }] }) })
    expect(r.status).toBe(200)
    expect((await call('/drop/approach', { method: 'POST', body: '{"id":"x"}' })).status).toBe(400)
    await call('/drop/cancel', { method: 'POST', body: JSON.stringify({ id: 'drop01' }) })
    expect(log).toEqual(['approach drop01 left', 'cancel drop01'])
  })

  test('saves a file whole, never over another', async () => {
    writeFileSync(join(folder, 'Photo.jpg'), 'old')
    const body = Buffer.from('hello island')
    const r = await call(`/drop/file?id=drop02&index=0&name=${encodeURIComponent('../Photo.jpg')}&size=${body.length}`, { method: 'PUT', body })
    expect(await r.json()).toEqual({ ok: true, name: 'Photo (2).jpg' })
    expect(readFileSync(join(folder, 'Photo (2).jpg'), 'utf8')).toBe('hello island')
    expect(readFileSync(join(folder, 'Photo.jpg'), 'utf8')).toBe('old')
    expect(log).toEqual([`start drop02 0 Photo.jpg ${body.length}`, 'saved drop02 0 Photo (2).jpg'])
    expect(readdirSync(folder).filter((n) => n.endsWith('.part'))).toEqual([])
  })

  test('a file that is not the size it said is thrown away', async () => {
    const r = await call('/drop/file?id=drop03&index=0&name=a.txt&size=100', { method: 'PUT', body: Buffer.from('short') })
    expect(r.status).toBe(400)
    expect(log.at(-1)).toBe('failed drop03 It didn’t arrive whole')
    const big = await call('/drop/file?id=drop04&index=0&name=b.txt&size=2', { method: 'PUT', body: Buffer.alloc(5000, 1) })
    expect(big.status).toBe(400)
    expect(log.at(-1)).toBe('failed drop04 It was bigger than it said')
    expect(readdirSync(folder)).toEqual([])
  })

  test('bad details and other paths are refused', async () => {
    expect((await call('/drop/file?id=bad/id&size=1&name=a', { method: 'PUT', body: 'a' })).status).toBe(400)
    expect((await call('/drop/file?id=drop05&size=-1&name=a', { method: 'PUT', body: 'a' })).status).toBe(400)
    expect((await call('/elsewhere')).status).toBe(404)
    expect((await call('/drop/nothing')).status).toBe(404)
    expect(readdirSync(folder)).toEqual([])
  })
})
