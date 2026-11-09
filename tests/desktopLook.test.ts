import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesktopLook, extensionSettings, lookSettings, yaruAccent } from '../electron/desktopLook'
import { ExtensionInstaller, extensionSchemaDirs, findExtension } from '../electron/gnomeExtensions'
import { EXTENSION_SWITCH, extensionKey, parseDesktopConfig, parseStrv, strv } from '../shared/desktop'

test('the island’s accent in Yaru, and the settings for the look', () => {
  expect(yaruAccent('blue')).toBe('blue')
  expect(yaruAccent('pink')).toBe('magenta')
  expect(yaruAccent('orange')).toBe('')
  const s = lookSettings({ accent: 'purple', dark: true, dock: true, buttonsLeft: true })
  expect(s.find((x) => x.key === 'gtk-theme')?.value).toBe("'Yaru-purple-dark'")
  expect(s.find((x) => x.key === 'icon-theme')?.value).toBe("'Yaru-purple'")
  expect(s.find((x) => x.key === 'color-scheme')?.value).toBe("'prefer-dark'")
  expect(s.find((x) => x.key === 'dock-position')?.value).toBe("'BOTTOM'")
  expect(s.find((x) => x.key === 'button-layout')?.value).toBe("'close,minimize,maximize:'")
  expect(lookSettings({ accent: 'orange', dark: false, dock: false, buttonsLeft: false }).map((x) => x.value)).toEqual(["'default'", "'Yaru'", "'Yaru'"])
})

test('apply keeps the first original, skips what this desktop lacks, and undo puts it back', async () => {
  const store: Record<string, string> = {
    'org.gnome.desktop.interface color-scheme': "'default'",
    'org.gnome.desktop.interface gtk-theme': "'Yaru'",
    'org.gnome.desktop.interface icon-theme': "'Yaru'",
  }
  const runner = async (args: string[]) => {
    if (args[0] === 'list-schemas') return { ok: true, out: 'org.gnome.desktop.interface\norg.gnome.desktop.wm.preferences' }
    const id = `${args[1]} ${args[2]}`
    if (args[0] === 'get') return { ok: id in store, out: store[id] ?? '' }
    store[id] = args[3]
    return { ok: true, out: '' }
  }
  const look = new DesktopLook('gsettings', runner)
  const first = await look.apply(lookSettings({ accent: 'blue', dark: true, dock: true, buttonsLeft: false }))
  expect(first.changed).toEqual(['Dark style', 'Apps in Yaru-blue-dark', 'Icons to match'])
  expect(first.skipped).toContain('The Dock at the bottom')
  expect(store['org.gnome.desktop.interface gtk-theme']).toBe("'Yaru-blue-dark'")
  // Again, with another accent: the original stays the very first one.
  const second = await look.apply(lookSettings({ accent: 'red', dark: true, dock: false, buttonsLeft: false }), first.original)
  expect(second.original['org.gnome.desktop.interface gtk-theme']).toBe("'Yaru'")
  expect(await look.undo(second.original)).toBe(3)
  expect(store['org.gnome.desktop.interface gtk-theme']).toBe("'Yaru'")
  expect(store['org.gnome.desktop.interface color-scheme']).toBe("'default'")
})

describe('GNOME extensions', () => {
  it('reads and writes GSettings string lists', () => {
    expect(parseStrv("['ubuntu-dock@ubuntu.com', 'ding@rastersoft.com']")).toEqual(['ubuntu-dock@ubuntu.com', 'ding@rastersoft.com'])
    expect(parseStrv('@as []')).toEqual([])
    expect(parseStrv("['it\\'s']")).toEqual(["it's"])
    expect(parseStrv('nonsense')).toEqual([])
    expect(strv(['a@b', "it's"])).toBe("['a@b', 'it\\'s']")
    expect(parseStrv(strv(['x', "y'z"]))).toEqual(['x', "y'z"])
  })

  it('turns on what’s installed and wanted, and hides the clock', () => {
    expect(extensionSettings({})).toEqual([])
    const s = extensionSettings({ blur: '/e/blur', clock: '/e/jp' })
    expect(s.find((x) => x.key === 'enabled-extensions')).toMatchObject({ addToList: ['blur-my-shell@aunetx', 'just-perfection-desktop@just-perfection'], what: 'Blur my Shell and Just Perfection on' })
    expect(s.find((x) => x.key === 'disabled-extensions')?.removeFromList).toHaveLength(2)
    expect(s.find((x) => x.key === 'clock-menu')).toMatchObject({ value: 'false', schemadir: '/e/jp/schemas' })
    expect(extensionSettings({ blur: '/e/blur' }).some((x) => x.key === 'clock-menu')).toBe(false)
    expect(extensionKey('org.gnome.shell enabled-extensions')).toBe(true)
    expect(extensionKey('org.gnome.shell.extensions.just-perfection clock-menu')).toBe(true)
    expect(extensionKey('org.gnome.shell.extensions.dash-to-dock dock-position')).toBe(false)
  })

  it('hides the top bar like a Mac’s menu bar with Hide Top Bar', () => {
    const s = extensionSettings({ bar: '/e/htb' })
    expect(s.find((x) => x.key === 'enabled-extensions')).toMatchObject({ addToList: ['hidetopbar@mathieu.bidon.ca'], what: 'Hide Top Bar on' })
    const bar = Object.fromEntries(s.filter((x) => x.schema === 'org.gnome.shell.extensions.hidetopbar').map((x) => [x.key, x.value]))
    // Always hidden (not only when a window is under it); back at the top edge and in the overview.
    expect(bar).toEqual({ 'mouse-sensitive': 'true', 'enable-intellihide': 'false', 'show-in-overview': 'true', 'mouse-triggers-overview': 'false' })
    expect(s.filter((x) => x.schema === 'org.gnome.shell.extensions.hidetopbar').every((x) => x.schemadir === '/e/htb/schemas')).toBe(true)
    expect(extensionSettings({ bar: '/e/htb', blur: '/e/blur', clock: '/e/jp' }).find((x) => x.key === 'enabled-extensions')?.what).toBe('Hide Top Bar and Blur my Shell and Just Perfection on')
    expect(extensionSettings({ blur: '/e/blur' }).some((x) => x.schema === 'org.gnome.shell.extensions.hidetopbar')).toBe(false)
    expect(extensionKey('org.gnome.shell.extensions.hidetopbar mouse-sensitive')).toBe(true)
    expect(EXTENSION_SWITCH.hidebar).toBe('hideBar')
    expect(parseDesktopConfig({}).hideBar).toBe(false)
    expect(parseDesktopConfig({ hideBar: true }).hideBar).toBe(true)
  })

  it('adds to the list, keeps the original for Undo, and uses the extension’s own schemas', async () => {
    const store: Record<string, string> = {
      'org.gnome.shell enabled-extensions': "['ubuntu-dock@ubuntu.com']",
      'org.gnome.shell disabled-extensions': "['blur-my-shell@aunetx']",
      'org.gnome.shell disable-user-extensions': 'false',
      'org.gnome.shell.extensions.just-perfection clock-menu': 'true',
    }
    const calls: string[][] = []
    const runner = async (args: string[]) => {
      calls.push(args)
      let a = args
      if (a[0] === '--schemadir') {
        if (a[1] !== '/e/jp/schemas') return { ok: false, out: '' }
        a = a.slice(2)
        if (a[0] === 'list-keys') return { ok: a[1] === 'org.gnome.shell.extensions.just-perfection', out: 'clock-menu' }
      }
      if (a[0] === 'list-schemas') return { ok: true, out: 'org.gnome.desktop.interface\norg.gnome.shell' }
      const id = `${a[1]} ${a[2]}`
      if (a[0] === 'get') return { ok: id in store, out: store[id] ?? '' }
      store[id] = a[3]
      return { ok: true, out: '' }
    }
    const look = new DesktopLook('gsettings', runner)
    const r = await look.apply(lookSettings({ accent: 'blue', dark: false, dock: false, buttonsLeft: false, extensions: { blur: '/e/blur', clock: '/e/jp' } }))
    expect(store['org.gnome.shell enabled-extensions']).toBe("['ubuntu-dock@ubuntu.com', 'blur-my-shell@aunetx', 'just-perfection-desktop@just-perfection']")
    expect(store['org.gnome.shell disabled-extensions']).toBe('[]')
    expect(store['org.gnome.shell.extensions.just-perfection clock-menu']).toBe('false')
    expect(r.changed).toContain('Blur my Shell and Just Perfection on')
    expect(r.changed).toContain('The top bar’s clock hidden')
    expect(calls.some((c) => c[0] === '--schemadir' && c[2] === 'set')).toBe(true)
    // Applied again: nothing is added twice.
    await look.apply(lookSettings({ accent: 'blue', dark: false, dock: false, buttonsLeft: false, extensions: { blur: '/e/blur', clock: '/e/jp' } }), r.original)
    expect(parseStrv(store['org.gnome.shell enabled-extensions'])).toHaveLength(3)
    await look.undo(r.original, { 'org.gnome.shell.extensions.just-perfection': '/e/jp/schemas' })
    expect(store['org.gnome.shell enabled-extensions']).toBe("['ubuntu-dock@ubuntu.com']")
    expect(store['org.gnome.shell disabled-extensions']).toBe("['blur-my-shell@aunetx']")
    expect(store['org.gnome.shell.extensions.just-perfection clock-menu']).toBe('true')
  })

  it('finds installed extensions, and gets one from extensions.gnome.org', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-'))
    const home = join(dir, 'home')
    expect(findExtension('blur-my-shell@aunetx', home)).toBeNull()
    // A stand-in extensions.gnome.org, gnome-shell and gnome-extensions.
    const asked: string[] = []
    const server = createServer((req, res) => {
      asked.push(req.url!)
      if (req.url!.startsWith('/extension-info/')) {
        const v = new URL(req.url!, 'http://x').searchParams.get('shell_version')
        if (v !== '42') return void res.writeHead(404).end()
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ download_url: '/download-extension/blur-my-shell@aunetx.shell-extension.zip?version_tag=1' }))
      }
      res.writeHead(200).end('PK fake zip')
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const shell = join(dir, 'gnome-shell')
    writeFileSync(shell, '#!/bin/sh\necho "GNOME Shell 42.9"\n', { mode: 0o755 })
    const gx = join(dir, 'gnome-extensions')
    writeFileSync(gx, `#!/bin/sh\n[ "$1" = install ] || exit 1\nd="${home}/.local/share/gnome-shell/extensions/$(basename "$3" .zip)"\nmkdir -p "$d/schemas" && echo '{}' > "$d/metadata.json"\n`, { mode: 0o755 })
    const notes: string[] = []
    const egress = { blocked: () => null, note: (_f: string, to: string, what: string) => void notes.push(`${to}: ${what}`) }
    const inst = new ExtensionInstaller({ egress, base, gnomeExtensions: gx, gnomeShell: shell })
    expect(await inst.shellVersion()).toBe('42')
    expect(await inst.install('blur-my-shell@aunetx')).toBeNull()
    expect(findExtension('blur-my-shell@aunetx', home)).toBe(join(home, '.local/share/gnome-shell/extensions/blur-my-shell@aunetx'))
    expect(extensionSchemaDirs(home)['org.gnome.shell.extensions.blur-my-shell']).toMatch(/schemas$/)
    expect(asked[0]).toBe('/extension-info/?uuid=blur-my-shell%40aunetx&shell_version=42')
    expect(notes[0]).toMatch(/which version of Blur my Shell works with GNOME 42/)
    // Paused, unknown, or no version for this GNOME: says why.
    expect(await new ExtensionInstaller({ egress: { ...egress, blocked: () => 'Paused.' }, base, gnomeExtensions: gx, gnomeShell: shell }).install('blur-my-shell@aunetx')).toBe('Paused.')
    expect(await inst.install('evil@x')).toMatch(/isn’t an extension the island uses/)
    const old = join(dir, 'gnome-shell-40')
    writeFileSync(old, '#!/bin/sh\necho "GNOME Shell 40.1"\n', { mode: 0o755 })
    expect(await new ExtensionInstaller({ egress, base, gnomeExtensions: gx, gnomeShell: old }).install('blur-my-shell@aunetx')).toMatch(/no version of Blur my Shell for GNOME 40/)
    server.close()
  })
})
