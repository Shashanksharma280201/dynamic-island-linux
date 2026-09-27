import { pointInRect, toPhysicalRect, isRect } from '../shared/hitbox'

test('pointInRect is inclusive and rejects outside points', () => {
  const r = { x: 10, y: 0, width: 100, height: 40 }
  expect(pointInRect(10, 0, r)).toBe(true)
  expect(pointInRect(110, 40, r)).toBe(true)
  expect(pointInRect(111, 20, r)).toBe(false)
  expect(pointInRect(50, 41, r)).toBe(false)
})

test('toPhysicalRect offsets by window position and applies scale + padding', () => {
  const r = { x: 100, y: 6, width: 200, height: 30 }
  expect(toPhysicalRect(r, { x: 0, y: 0 }, 1)).toEqual(r)
  expect(toPhysicalRect(r, { x: 1920, y: 0 }, 2, 4)).toEqual({
    x: (1920 + 96) * 2,
    y: 2 * 2,
    width: 208 * 2,
    height: 38 * 2,
  })
})

test('isRect validates IPC input', () => {
  expect(isRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
  expect(isRect({ x: 0, y: 0, width: NaN, height: 1 })).toBe(false)
  expect(isRect(null)).toBe(false)
})
