import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { HELPER, SystemLook, gdmKeyfile, orbPng, plymouthFiles, yaruTheme } from '../electron/systemLook'
import { parseDesktopConfig } from '../shared/desktop'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeFakeSystem } = require('../e2e/fake-system-tools.cjs')

test('the login screen’s settings and the splash’s files', () => {
  expect(yaruTheme('blue', true)).toBe('Yaru-blue-dark')
  expect(yaruTheme('orange', false)).toBe('Yaru')
  expect(gdmKeyfile('purple', true)).toMatch(/^# Written by Dynamic Island[^\n]*\n\[org\/gnome\/desktop\/interface\]\ncolor-scheme='prefer-dark'\ngtk-theme='Yaru-purple-dark'\nicon-theme='Yaru-purple'\n$/)
  const f = plymouthFiles()
  expect(f['island.plymouth']).toMatch(/ModuleName=script/)
  expect(f['island.plymouth']).toMatch(/ScriptFile=\/usr\/share\/plymouth\/themes\/island\/island.script/)
  expect(f['island.script']).toMatch(/Plymouth.SetDisplayPasswordFunction/)
  expect(f['island.script']).toMatch(/Image\("orb.png"\)/)
})

test('the orb is a real PNG: solid in the middle, clear at the corners', () => {
  const png = orbPng('#0a84ff', 64)
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(png.readUInt32BE(16)).toBe(64)
  expect(png.readUInt32BE(20)).toBe(64)
  // Read the pixels back.
  let at = 8
  const idat: Buffer[] = []
  while (at < png.length) {
    const len = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len))
    at += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const alpha = (x: number, y: number) => raw[y * (64 * 4 + 1) + 1 + x * 4 + 3]
  expect(alpha(32, 32)).toBe(255)
  expect(alpha(0, 0)).toBe(0)
  expect(alpha(32, 32 + 22)).toBeGreaterThan(0) // the glow
})

test('the root helper only does what it should, and Undo puts things back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'syslook-'))
  const fake = makeFakeSystem(dir)
  const helper = join(dir, 'helper.sh')
  writeFileSync(helper, HELPER)
  const run = (...args: string[]) => {
    try {
      return { code: 0, out: execFileSync('/bin/sh', [helper, ...args], { env: { ...process.env, ...fake.env } }).toString() }
    } catch (e) {
      return { code: (e as { status: number }).status, out: String((e as { stdout?: Buffer }).stdout ?? '') }
    }
  }
  // The login screen: only the three keys get through, whatever the file says.
  const keyfile = join(dir, 'gdm.ini')
  writeFileSync(keyfile, gdmKeyfile('blue', true) + "[org/gnome/shell]\nfavorite-apps=['evil.desktop']\ngtk-theme='x;rm -rf /'\n")
  const g = run('gdm', '1', keyfile, 'Yaru-blue')
  expect(g.code).toBe(0)
  expect(g.out).toMatch(/^previous-gdm \/usr\/share\/gnome-shell\/theme\/Yaru\/gnome-shell-theme.gresource$/m)
  expect(g.out).toMatch(/^shell Yaru-blue$/m)
  const written = readFileSync(join(fake.root, 'etc/dconf/db/gdm.d/90-dynamic-island'), 'utf8')
  expect(written).toMatch(/gtk-theme='Yaru-blue-dark'/)
  expect(written).not.toMatch(/evil|rm -rf|org\/gnome\/shell/)
  expect(readFileSync(join(fake.root, 'etc/dconf/profile/gdm'), 'utf8')).toMatch(/system-db:gdm/)
  expect(fake.value('gdm-theme.gresource')).toBe('/usr/share/gnome-shell/theme/Yaru-blue/gnome-shell-theme.gresource')
  expect(fake.calls()).toContain('dconf update')
  // An accent this Ubuntu has no login theme for: the rest is still done.
  expect(run('gdm', '0', keyfile, 'Yaru-olive').out).toMatch(/^no-shell Yaru-olive$/m)
  // Undo.
  expect(run('gdm-undo', '/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource').code).toBe(0)
  expect(existsSync(join(fake.root, 'etc/dconf/db/gdm.d/90-dynamic-island'))).toBe(false)
  expect(fake.value('gdm-theme.gresource')).toBe('/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource')

  // The splash: only from the island's own temp folder, only its three files.
  const src = mkdtempSync(join('/tmp', 'island-system-'))
  for (const [n, t] of Object.entries(plymouthFiles())) writeFileSync(join(src, n), t)
  writeFileSync(join(src, 'orb.png'), orbPng('#0a84ff', 32))
  const sp = run('splash', src)
  expect(sp.code).toBe(0)
  expect(sp.out).toMatch(/^previous-splash \/usr\/share\/plymouth\/themes\/bgrt\/bgrt.plymouth$/m)
  expect(existsSync(join(fake.root, 'usr/share/plymouth/themes/island/orb.png'))).toBe(true)
  expect(fake.value('default.plymouth')).toBe('/usr/share/plymouth/themes/island/island.plymouth')
  expect(fake.calls()).toContain('update-initramfs -u')
  expect(run('splash-undo', '/usr/share/plymouth/themes/bgrt/bgrt.plymouth').code).toBe(0)
  expect(fake.value('default.plymouth')).toBe('/usr/share/plymouth/themes/bgrt/bgrt.plymouth')
  expect(fake.list('default.plymouth')).not.toContain('/usr/share/plymouth/themes/island/island.plymouth')
  expect(existsSync(join(fake.root, 'usr/share/plymouth/themes/island'))).toBe(false)

  // Refused: anything else.
  expect(run('splash', '/etc').code).toBe(2)
  expect(run('splash', '/tmp/island-system-x/../../etc').code).toBe(2)
  expect(run('gdm', '2', keyfile, 'Yaru').code).toBe(2)
  expect(run('rm', '-rf', '/').code).toBe(2)
  // A previous value that isn't a real alternative is never set.
  run('gdm-undo', '/etc/shadow')
  expect(fake.value('gdm-theme.gresource')).toBe('/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource')
})

test('through pkexec: apply, then put back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'syslook-'))
  const fake = makeFakeSystem(dir)
  Object.assign(process.env, fake.env)
  try {
    const look = new SystemLook(fake.pkexec)
    const login = await look.loginScreen('purple', false)
    expect(login).toEqual({ ok: true, previous: '/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource', shellTheme: true })
    const splash = await look.bootSplash('#bf5af2')
    expect(splash).toEqual({ ok: true, previous: '/usr/share/plymouth/themes/bgrt/bgrt.plymouth' })
    expect(fake.calls().some((c: string) => c.startsWith('pkexec /bin/sh '))).toBe(true)
    expect((await look.loginScreenUndo(login.ok ? login.previous : '')).ok).toBe(true)
    expect((await look.bootSplashUndo(splash.ok ? splash.previous : '')).ok).toBe(true)
    expect(fake.value('default.plymouth')).toBe('/usr/share/plymouth/themes/bgrt/bgrt.plymouth')
    // No pkexec at all: says how to get it.
    expect(await new SystemLook(join(dir, 'nope')).loginScreen('blue', true)).toEqual({ ok: false, error: 'pkexec isn’t installed (sudo apt install pkexec).' })
  } finally {
    delete process.env.ISLAND_SYSROOT
    delete process.env.ISLAND_TEST_PATH
  }
})

test('what’s kept in the config is checked', () => {
  expect(parseDesktopConfig({}).system).toEqual({ applied: false, gdmPrevious: '', splashPrevious: '' })
  expect(parseDesktopConfig({ system: { applied: true, gdmPrevious: '/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource', splashPrevious: '/etc/../x' } }).system).toEqual({
    applied: true,
    gdmPrevious: '/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource',
    splashPrevious: '',
  })
})
