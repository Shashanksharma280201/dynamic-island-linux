import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {} }))
import { desktopEntry, quoteExecArg, autostartFile } from '../electron/autostart'
import { mergeConfig } from '../electron/config'

test('quoteExecArg quotes only when needed', () => {
  expect(quoteExecArg('/opt/app/island')).toBe('/opt/app/island')
  expect(quoteExecArg('/home/a b/Island.AppImage')).toBe('"/home/a b/Island.AppImage"')
  expect(quoteExecArg('/x/$HOME')).toBe('"/x/\\$HOME"')
})

test('desktopEntry is a valid autostart entry', () => {
  const e = desktopEntry(['/usr/bin/electron', '/home/a b/app'])
  expect(e).toContain('[Desktop Entry]')
  expect(e).toContain('Exec=/usr/bin/electron "/home/a b/app"')
  expect(e).toContain('X-GNOME-Autostart-enabled=true')
})

test('autostartFile honours XDG_CONFIG_HOME', () => {
  expect(autostartFile({ XDG_CONFIG_HOME: '/cfg' })).toBe(
    '/cfg/autostart/dynamic-island-linux.desktop',
  )
})

test('mergeConfig ignores unknown and mistyped keys', () => {
  expect(mergeConfig(null)).toEqual({ notifications: true })
  expect(mergeConfig({ notifications: 'no', x: 1 })).toEqual({ notifications: true })
  expect(mergeConfig({ notifications: false })).toEqual({ notifications: false })
})
