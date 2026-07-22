import { pointInRect } from '../shared/hitbox'

test('point inside rect', () => {
  const r = { x: 10, y: 0, width: 100, height: 40 }
  expect(pointInRect(50, 20, r)).toBe(true)
  expect(pointInRect(5, 20, r)).toBe(false) // left of rect
  expect(pointInRect(50, 50, r)).toBe(false) // below rect
  expect(pointInRect(10, 0, r)).toBe(true) // top-left edge inclusive
  expect(pointInRect(110, 40, r)).toBe(true) // bottom-right edge inclusive
})
