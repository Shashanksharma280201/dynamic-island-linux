import { displayKey, displayName, parseDisplayPref, pickDisplay, type DisplayInfo } from '../shared/displays'

const laptop: DisplayInfo = { id: 1, label: 'Built-in', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, primary: true }
const dell: DisplayInfo = { id: 2, label: 'DELL U2720Q', bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, primary: false }

test('the island goes where you chose', () => {
  expect(pickDisplay([laptop, dell], 'primary')).toBe(laptop)
  expect(pickDisplay([laptop, dell], displayKey(dell))).toBe(dell)
  expect(pickDisplay([laptop, dell], 'cursor', 2)).toBe(dell)
  expect(pickDisplay([laptop, dell], 'cursor')).toBe(laptop)
})

test('a monitor plugged back in elsewhere is still found; one that is gone falls back to the main one', () => {
  const moved = { ...dell, id: 7, bounds: { ...dell.bounds, x: -2560 } }
  expect(pickDisplay([laptop, moved], displayKey(dell))).toBe(moved)
  expect(pickDisplay([laptop], displayKey(dell))).toBe(laptop)
})

test('names and saved values', () => {
  expect(displayName(laptop, 0)).toBe('Built-in · 1920×1080 (main)')
  expect(displayName({ ...dell, label: '' }, 1)).toBe('Display 2 · 2560×1440')
  expect(parseDisplayPref('cursor')).toBe('cursor')
  expect(parseDisplayPref(displayKey(dell))).toBe(displayKey(dell))
  expect(parseDisplayPref(42)).toBe('primary')
  expect(parseDisplayPref('nonsense')).toBe('primary')
})
