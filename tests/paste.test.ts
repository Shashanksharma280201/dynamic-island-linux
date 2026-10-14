import { vi } from 'vitest'
vi.mock('electron', () => ({ clipboard: {} }))
import { dictatedText, pasteChord } from '../electron/paste'

test('terminals paste with Ctrl+Shift+V, other apps with Ctrl+V', () => {
  expect(pasteChord('gnome-terminal-server Gnome-terminal')).toBe('ctrl+shift+v')
  expect(pasteChord('kitty kitty')).toBe('ctrl+shift+v')
  expect(pasteChord('Alacritty Alacritty')).toBe('ctrl+shift+v')
  expect(pasteChord('gedit Gedit')).toBe('ctrl+v')
  expect(pasteChord('')).toBe('ctrl+v')
})

test('dictated text is one tidy line', () => {
  expect(dictatedText('  Hello there.\n How are you?  ')).toBe('Hello there. How are you?')
})
