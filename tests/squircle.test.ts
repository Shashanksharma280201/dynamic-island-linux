import { squirclePath } from '../renderer/island/squircle'

test('returns a non-trivial SVG path for a rounded rect', () => {
  const d = squirclePath(100, 40, 20, 0.6)
  expect(typeof d).toBe('string')
  expect(d.length).toBeGreaterThan(20)
  expect(d.startsWith('M')).toBe(true) // path moveto
})

test('clamps radius to half the smaller side', () => {
  // radius larger than height/2 should not throw and still produce a path
  const d = squirclePath(200, 40, 999, 0.6)
  expect(d.startsWith('M')).toBe(true)
})
