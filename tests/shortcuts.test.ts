import { accelFromKeys, clash, DEFAULT_SHORTCUTS, keyFromCode, parseShortcuts, sameAccel, shortcutLabel, validAccel } from '../shared/shortcuts'

const press = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code, ...mods })

test('a key press becomes an accelerator, if it has a modifier', () => {
  expect(accelFromKeys(press('KeyK', { ctrlKey: true, altKey: true }))).toEqual({ accel: 'Control+Alt+K' })
  expect(accelFromKeys(press('Space', { metaKey: true, shiftKey: true }))).toEqual({ accel: 'Shift+Super+Space' })
  expect(accelFromKeys(press('F9'))).toEqual({ accel: 'F9' })
  expect('error' in accelFromKeys(press('KeyK', { shiftKey: true }))).toBe(true) // Shift alone: that's typing
  expect('error' in accelFromKeys(press('ControlLeft', { ctrlKey: true }))).toBe(true) // only a modifier so far
  expect(keyFromCode('ArrowUp')).toBe('Up')
  expect(keyFromCode('Digit7')).toBe('7')
})

test('only real accelerators are accepted', () => {
  expect(validAccel('Control+Alt+Y')).toBe(true)
  expect(validAccel('CommandOrControl+I')).toBe(true)
  expect(validAccel('F12')).toBe(true)
  expect(validAccel('Y')).toBe(false)
  expect(validAccel('Control+Control+Y')).toBe(false)
  expect(validAccel('Hyper+Y')).toBe(false)
  expect(validAccel('Control+Alt+')).toBe(false)
  expect(validAccel(42)).toBe(false)
})

test('clashes with our own shortcuts, however they are written', () => {
  expect(sameAccel('CommandOrControl+I', 'Control+I')).toBe(true)
  expect(sameAccel('CommandOrControl+I', 'Control+I', true)).toBe(false)
  expect(sameAccel('Alt+Control+Y', 'Control+Alt+Y')).toBe(true)
  expect(clash(DEFAULT_SHORTCUTS, 'voice', 'Control+Alt+Y')).toBe('allow')
  expect(clash(DEFAULT_SHORTCUTS, 'allow', 'Control+Alt+Y')).toBeNull()
  expect(clash(DEFAULT_SHORTCUTS, 'voice', 'Control+Alt+K')).toBeNull()
})

test('labels and saved values', () => {
  expect(shortcutLabel('CommandOrControl+I')).toBe('Ctrl+I')
  expect(shortcutLabel('Control+Alt+Space')).toBe('Ctrl+Alt+Space')
  expect(shortcutLabel('Control+Alt+Y', true)).toBe('⌃⌥Y')
  expect(parseShortcuts({ voice: 'Control+Alt+K', allow: 'nonsense' })).toEqual({ ...DEFAULT_SHORTCUTS, voice: 'Control+Alt+K' })
  expect(parseShortcuts(null)).toEqual(DEFAULT_SHORTCUTS)
})
