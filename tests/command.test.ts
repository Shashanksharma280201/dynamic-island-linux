import { calc, cleanExec, matchScore, parseDesktopEntry, parseRecent, systemCommand } from '../shared/command'

const FIREFOX = `[Desktop Entry]
Version=1.0
Name=Firefox Web Browser
Name[de]=Firefox-Webbrowser
Comment=Browse the World Wide Web
GenericName=Web Browser
Keywords=Internet;WWW;Browser;Web;Explorer
Exec=firefox %u
Icon=firefox
Terminal=false
Type=Application

[Desktop Action new-window]
Name=Open a New Window
Exec=firefox -new-window`

test('desktop entries: listed apps, their names and commands', () => {
  const app = parseDesktopEntry('firefox.desktop', FIREFOX)
  expect(app).toEqual({ id: 'firefox.desktop', name: 'Firefox Web Browser', comment: 'Browse the World Wide Web', exec: 'firefox %u', icon: 'firefox', keywords: ['Internet', 'WWW', 'Browser', 'Web', 'Explorer'], terminal: false })
  expect(parseDesktopEntry('firefox.desktop', FIREFOX, 'de_DE')?.name).toBe('Firefox-Webbrowser')
  expect(parseDesktopEntry('x.desktop', '[Desktop Entry]\nType=Application\nName=X\nExec=x\nNoDisplay=true')).toBeNull()
  expect(parseDesktopEntry('x.desktop', '[Desktop Entry]\nType=Link\nName=X\nURL=y')).toBeNull()
  expect(cleanExec('firefox %u')).toEqual(['firefox'])
  expect(cleanExec('"/opt/My App/app" --flag %F')).toEqual(['/opt/My App/app', '--flag'])
  expect(cleanExec('sh -c "echo 100%%"')).toEqual(['sh', '-c', 'echo 100%'])
})

test('matching what you type', () => {
  expect(matchScore('fire', 'Firefox Web Browser')).toBeGreaterThan(matchScore('fire', 'Bonfire'))
  expect(matchScore('web', 'Firefox Web Browser')).toBe(60)
  expect(matchScore('vsc', 'Visual Studio Code')).toBe(40)
  expect(matchScore('internet', 'Firefox Web Browser', ['Internet'])).toBe(35)
  expect(matchScore('zzz', 'Firefox')).toBe(0)
})

test('sums, and nothing that isn’t one', () => {
  expect(calc('2+2')).toBe(4)
  expect(calc('(1.5 + 2.5) * 3')).toBe(12)
  expect(calc('2^10 / 4')).toBe(256)
  expect(calc('-3 * -3')).toBe(9)
  expect(calc('10 % 3')).toBe(1)
  expect(calc('1,000 * 2')).toBe(2000)
  expect(calc('42')).toBeNull()
  expect(calc('process.exit()')).toBeNull()
  expect(calc('2+')).toBeNull()
})

test('recent files and system words', () => {
  const xbel = `<?xml version="1.0"?><xbel><bookmark href="file:///home/s/a%20b.pdf" added="2026-11-01T10:00:00Z" modified="2026-11-02T10:00:00Z" visited="2026-11-02T10:00:00Z"></bookmark><bookmark href="file:///home/s/c.txt" added="2026-11-03T10:00:00Z" modified="2026-11-05T10:00:00Z"></bookmark></xbel>`
  expect(parseRecent(xbel).map((r) => r.path)).toEqual(['/home/s/c.txt', '/home/s/a b.pdf'])
  expect(systemCommand('Dark mode')?.action).toEqual({ t: 'theme', value: 'dark' })
  expect(systemCommand('volume 40')?.action).toEqual({ t: 'volume', value: 40 })
  expect(systemCommand('volume 400')?.action).toEqual({ t: 'volume', value: 100 })
  expect(systemCommand('dnd off')?.action).toEqual({ t: 'dnd', on: false })
  expect(systemCommand('wallpaper misty forest')?.action).toEqual({ t: 'wallpaper', query: 'misty forest' })
  expect(systemCommand('open firefox')).toBeNull()
})

test('the System package finds apps by name and asks before each action', async () => {
  const { findApp, systemTools } = await import('../electron/packages/systemTools')
  const apps = [parseDesktopEntry('firefox.desktop', FIREFOX)!, parseDesktopEntry('code.desktop', '[Desktop Entry]\nType=Application\nName=Visual Studio Code\nExec=code %F\nKeywords=vscode;')!]
  expect(findApp(apps, 'firefox')?.id).toBe('firefox.desktop')
  expect(findApp(apps, 'vscode')?.id).toBe('code.desktop')
  expect(findApp(apps, 'gimp')).toBeNull()
  const launched: string[] = []
  const tools = systemTools({ apps: () => apps, launch: (a) => launched.push(a.id), volume: () => {}, mute: () => {}, theme: () => {}, dnd: () => {}, lock: () => {} })
  expect(tools.every((t) => !!t.asks)).toBe(true)
  const open = tools.find((t) => t.name === 'system_open_app')!
  expect(await open.asks!({ name: 'firefox' })).toEqual({ title: 'Open Firefox Web Browser?', body: 'Browse the World Wide Web' })
  expect(await open.run({ name: 'firefox' })).toBe('Opened Firefox Web Browser.')
  expect(launched).toEqual(['firefox.desktop'])
})
