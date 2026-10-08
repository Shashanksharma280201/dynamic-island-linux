import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir, arch } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

// Runs the real install scripts against a local stand-in for github.com:
// scripts/install.sh down the AppImage path (any Linux), and scripts/install.ps1
// with the installer itself stubbed out (where PowerShell 7 is installed).
const runSh = process.platform === 'linux' && arch() === 'x64' ? describe : describe.skip
const runPs1 = process.platform !== 'win32' && spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0 ? describe : describe.skip

const APPIMAGE = 'dynamic-island-linux-9.9.9-x86_64.AppImage'
const EXE = 'dynamic-island-windows-9.9.9-x64.exe'
const fakeApp = Buffer.from('#!/bin/sh\necho fake island "$@"\n')
const fakeExe = Buffer.from('MZ fake installer')
const files: Record<string, Buffer> = { [APPIMAGE]: fakeApp, [EXE]: fakeExe }
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

let server: Server
let base = ''
/** Whether the release has a SHA256SUMS.txt, and what it says. */
let release: { withSums: boolean; sums: string } = { withSums: true, sums: '' }

function run(cmd: string, args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    // No proxy: the stand-in is on this machine.
    const p = spawn(cmd, args, { env: { PATH: process.env.PATH ?? '', ...env }, cwd: join(__dirname, '..') })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code: code ?? -1, out }))
  })
}

const install = (home: string, extra: Record<string, string> = {}) =>
  run('bash', ['scripts/install.sh'], { HOME: home, DI_GITHUB: base, DI_ASSETS: `${base}/assets`, DI_REPO: 'o/r', DI_FORMAT: 'appimage', DI_NO_LAUNCH: '1', ...extra })

/**
 * Runs install.ps1 the way `irm … | iex` does, with stand-ins for the parts
 * that need Windows: the installer (exiting with `codes`, one per run, and
 * putting the app in place when it succeeds), the Installed apps list, and the
 * waits.
 */
function installPs1(extra: Record<string, string> = {}, codes: number[] = [0]) {
  const temp = mkdtempSync(join(tmpdir(), 'di-ps1-'))
  const stubs = String.raw`
    $global:runs = 0
    $app = Join-Path $env:TEMP 'Programs/DynamicIsland'
    function Start-Process { param($FilePath, $ArgumentList, [switch]$Wait, [switch]$PassThru)
      $global:runs++
      $codes = @(${codes.join(',')})
      $c = $codes[[Math]::Min($global:runs, $codes.Count) - 1]
      Write-Host "installer run $($global:runs): $(Split-Path -Leaf $FilePath) $ArgumentList, exit $c"
      if ($c -eq 0) {
        New-Item -ItemType Directory -Force $app | Out-Null
        Set-Content (Join-Path $app 'DynamicIsland.exe') 'app'
        Set-Content (Join-Path $app 'Uninstall DynamicIsland.exe') 'uninstaller'
      }
      [pscustomobject]@{ ExitCode = $c }
    }
    function Start-Sleep {}
    function Get-ChildItem {
      if ("$args" -like 'HKCU:*') {
        if (Test-Path $app) { [pscustomobject]@{ DisplayName = 'Dynamic Island 9.9.9'; UninstallString = '"' + (Join-Path $app 'Uninstall DynamicIsland.exe') + '" /currentuser' } }
        return
      }
      Microsoft.PowerShell.Management\Get-ChildItem @args
    }
    function Get-ItemProperty { process { $_ } }
  `
  return run('pwsh', ['-NoProfile', '-NonInteractive', '-Command', `${stubs}; Get-Content scripts/install.ps1 -Raw | Invoke-Expression`], {
    HOME: temp,
    TEMP: temp,
    DI_GITHUB: base,
    DI_REPO: 'o/r',
    DI_NO_LAUNCH: '1',
    ...extra,
  })
}

beforeAll(async () => {
  // Like github.com: .../releases/latest redirects to the latest release's
  // page, and its files redirect to where they're stored.
  server = createServer((req, res) => {
    const url = req.url ?? ''
    const redirect = (to: string) => {
      res.writeHead(302, { location: to })
      res.end()
    }
    const dl = '/o/r/releases/download/v9.9.9/'
    if (url === '/o/r/releases/latest') return redirect(`${base}/o/r/releases/tag/v9.9.9`)
    if (url === '/o/r/releases/tag/v9.9.9') return res.end('<html>release page</html>')
    if (url.startsWith(dl)) {
      const name = url.slice(dl.length)
      if (name in files || (name === 'SHA256SUMS.txt' && release.withSums)) return redirect(`${base}/storage/${name}`)
    }
    if (url.startsWith('/storage/')) {
      const name = url.slice('/storage/'.length)
      res.setHeader('content-type', 'application/octet-stream')
      return res.end(name === 'SHA256SUMS.txt' ? release.sums : files[name])
    }
    if (url === '/assets/icon.png') return res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    res.statusCode = 404
    res.end('Not Found')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const goodSums = () => `${sha(Buffer.from('other'))}  other.deb\n${sha(fakeApp)}  ${APPIMAGE}\n${sha(fakeExe)}  ${EXE}\n`

runSh('install.sh', () => {
  it('downloads the AppImage, checks it and adds a menu entry', async () => {
    release = { withSums: true, sums: goodSums() }
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

  it('installs a chosen release, with or without the v', async () => {
    release = { withSums: true, sums: goodSums() }
    for (const v of ['v9.9.9', '9.9.9']) {
      const home = mkdtempSync(join(tmpdir(), 'di-install-'))
      const r = await install(home, { DI_VERSION: v })
      expect(r.code, r.out).toBe(0)
      expect(r.out).toContain('Looking up the v9.9.9 release')
      expect(existsSync(join(home, '.local/bin/DynamicIsland.AppImage'))).toBe(true)
    }
  }, 20000)

  it('explains when the release does not exist', async () => {
    const r = await install(mkdtempSync(join(tmpdir(), 'di-install-')), { DI_VERSION: 'v0.0.0-missing' })
    expect(r.code).not.toBe(0)
    expect(r.out).toContain("There's no Dynamic Island release called v0.0.0-missing")
  }, 20000)

  it('explains when GitHub cannot be reached', async () => {
    const r = await install(mkdtempSync(join(tmpdir(), 'di-install-')), { DI_GITHUB: 'http://127.0.0.1:9' })
    expect(r.code).not.toBe(0)
    expect(r.out).toContain("Couldn't reach GitHub")
  }, 20000)
})

runPs1('install.ps1', () => {
  it('finds the latest release, checks the installer and installs it', async () => {
    release = { withSums: true, sums: goodSums() }
    const r = await installPs1()
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('Looking up the latest release')
    expect(r.out).toContain(`Downloading ${EXE}`)
    expect(r.out).toContain('Checksum OK')
    expect(r.out).toContain(`installer run 1: ${EXE} /S, exit 0`)
    expect(r.out).toMatch(/Done\. Dynamic Island v9\.9\.9 is installed \(.*DynamicIsland\.exe\)/)
  }, 30000)

  it('runs the installer once more when it crashes', async () => {
    release = { withSums: true, sums: goodSums() }
    const r = await installPs1({}, [-1073741819, 0])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('stopped unexpectedly (code -1073741819), so trying once more')
    expect(r.out).toContain('installer run 2')
    expect(r.out).toContain('is installed')
  }, 30000)

  it('gives up when the installer fails twice', async () => {
    release = { withSums: true, sums: goodSums() }
    const r = await installPs1({}, [-1073741819])
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('The installer stopped with code -1073741819')
    expect(r.out).not.toContain('installer run 3')
  }, 30000)

  it('refuses an installer that does not match its checksum, without running it', async () => {
    release = { withSums: true, sums: `${sha(Buffer.from('tampered'))}  ${EXE}\n` }
    const r = await installPs1()
    expect(r.code).not.toBe(0)
    expect(r.out).toContain("doesn't match its checksum")
    expect(r.out).not.toContain('installer run')
  }, 30000)

  it('installs a release without checksums, a chosen one, and explains a missing one', async () => {
    release = { withSums: false, sums: '' }
    let r = await installPs1({ DI_VERSION: '9.9.9' })
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('Looking up the v9.9.9 release')
    expect(r.out).toContain("can't be checked")
    r = await installPs1({ DI_VERSION: 'v0.0.0-missing' })
    expect(r.code).not.toBe(0)
    expect(r.out).toContain("There's no Dynamic Island release called v0.0.0-missing")
  }, 30000)
})
