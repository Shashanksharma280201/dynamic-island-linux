import { DesktopLook, lookSettings, yaruAccent } from '../electron/desktopLook'

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
