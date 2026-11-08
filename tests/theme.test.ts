import { vi } from 'vitest'

vi.mock('electron', () => ({ nativeTheme: { on: () => {}, themeSource: 'system', shouldUseDarkColors: false } }))
import { darkFrom } from '../electron/theme'

test('darkFrom reads GNOME’s style', () => {
  // Ubuntu 22.04's Appearance sets both; color-scheme wins.
  expect(darkFrom("'prefer-dark'\n", "'Yaru-dark'\n")).toBe(true)
  expect(darkFrom("'prefer-light'", "'Yaru-dark'")).toBe(false)
  // No color-scheme preference: the GTK theme's name decides.
  expect(darkFrom("'default'", "'Yaru-dark'")).toBe(true)
  expect(darkFrom("'default'", "'Yaru'")).toBe(false)
  expect(darkFrom('', "'Adwaita-dark'")).toBe(true)
  // Nothing known: leave it to Electron.
  expect(darkFrom('', '')).toBeNull()
  expect(darkFrom('', "'/some/path'")).toBeNull()
  expect(darkFrom("'default'", '')).toBe(false)
})
