import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir, arch } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

// Runs the real scripts/install.sh against a local stand-in for GitHub: the
// AppImage path (any Linux), with good, bad and missing checksums.
const run = process.platform === 'linux' && arch() === 'x64' ? describe : describe.skip

const APPIMAGE = 'dynamic-island-linux-9.9.9-x86_64.AppImage'
const fakeApp = Buffer.from('#!/bin/sh\necho fake island "$@"\n')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

let server: Server
let base = ''
/** What the fake release lists, and what SHA256SUMS.txt says. */
let release: { withSums: boolean; sums: string } = { withSums: true, sums: '' }

function install(home: string, extra: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  // No proxy: the stand-in is on this machine.
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: home, DI_API: base, DI_ASSETS: `${base}/assets`, DI_REPO: 'o/r', DI_FORMAT: 'appimage', DI_NO_LAUNCH: '1', ...extra }
  return new Promise((resolve) => {
    const p = spawn('bash', ['scripts/install.sh'], { env, cwd: join(__dirname, '..') })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code: code ?? -1, out }))
  })
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? ''
    if (url === '/repos/o/r/releases/latest') {
      const assets = [{ name: APPIMAGE, browser_download_url: `${base}/dl/${APPIMAGE}` }]
      if (release.withSums) assets.push({ name: 'SHA256SUMS.txt', browser_download_url: `${base}/dl/SHA256SUMS.txt` })
      res.setHeader('content-type', 'application/json')
      // Pretty-printed, like api.github.com.
      return res.end(JSON.stringify({ tag_name: 'v9.9.9', assets }, null, 2))
    }
    if (url === `/dl/${APPIMAGE}`) return res.end(fakeApp)
    if (url === '/dl/SHA256SUMS.txt') return res.end(release.sums)
    if (url === '/assets/icon.png') return res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

run('install.sh', () => {
  it('downloads the AppImage, checks it and adds a menu entry', async () => {
    release = { withSums: true, sums: `${sha(Buffer.from('other'))}  other.deb\n${sha(fakeApp)}  ${APPIMAGE}\n` }
    const home = mkdtempSync(join(tmpdir(), 'di-install-'))
    const r = await install(home)
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('Checksum OK')
    const app = join(home, '.local/bin/DynamicIsland.AppImage')
    expect(readFileSync(app)).toEqual(fakeApp)
    expect(statSync(app).mode & 0o111).not.toBe(0)
    const entry = readFileSync(join(home, '.local/share/applications/dynamic-island-linux.desktop'), 'utf8')
    expect(entry).toContain(`"${app}"`)
    expect(entry).toContain('Icon=dynamic-island-linux')
    expect(existsSync(join(home, '.local/share/icons/hicolor/512x512/apps/dynamic-island-linux.png'))).toBe(true)
  }, 20000)

  it('refuses a download that does not match its checksum', async () => {
    release = { withSums: true, sums: `${sha(Buffer.from('tampered'))}  ${APPIMAGE}\n` }
    const home = mkdtempSync(join(tmpdir(), 'di-install-'))
    const r = await install(home)
    expect(r.code).not.toBe(0)
    expect(r.out).toContain("doesn't match its checksum")
    expect(existsSync(join(home, '.local/bin/DynamicIsland.AppImage'))).toBe(false)
  }, 20000)

  it('refuses a file the checksums leave out', async () => {
    release = { withSums: true, sums: `${sha(fakeApp)}  something-else.AppImage\n` }
    const r = await install(mkdtempSync(join(tmpdir(), 'di-install-')))
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('not listed')
  }, 20000)

  it('still installs an older release that has no checksums, and says so', async () => {
    release = { withSums: false, sums: '' }
    const home = mkdtempSync(join(tmpdir(), 'di-install-'))
    const r = await install(home)
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain("can't be checked")
    expect(existsSync(join(home, '.local/bin/DynamicIsland.AppImage'))).toBe(true)
  }, 20000)

  it('explains when the release cannot be found', async () => {
    const r = await install(mkdtempSync(join(tmpdir(), 'di-install-')), { DI_VERSION: 'v0.0.0-missing' })
    expect(r.code).not.toBe(0)
    expect(r.out).toContain("Couldn't reach GitHub to find the release v0.0.0-missing")
  }, 20000)
})
