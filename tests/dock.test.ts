import { parseDock, columnBounds, sideForX, islandTop, DEFAULT_DOCK } from '../shared/dock'

const WA = { x: 0, y: 32, width: 1920, height: 1048 }

test('parseDock validates and clamps', () => {
  expect(parseDock(undefined)).toEqual(DEFAULT_DOCK)
  expect(parseDock({ side: 'left', y: 0.5 })).toEqual({ side: 'left', y: 0.5 })
  expect(parseDock({ side: 'top', y: 7 })).toEqual({ side: 'right', y: 1 })
  expect(parseDock({ side: 'left', y: 'x' })).toEqual({ side: 'left', y: DEFAULT_DOCK.y })
})

test('columnBounds hugs the chosen edge of the work area', () => {
  expect(columnBounds(WA, 'right', 480)).toEqual({ x: 1440, y: 32, width: 480, height: 1048 })
  expect(columnBounds(WA, 'left', 480)).toEqual({ x: 0, y: 32, width: 480, height: 1048 })
  // second monitor to the right, narrower than the column
  expect(columnBounds({ x: 1920, y: 0, width: 400, height: 800 }, 'right', 480)).toEqual({
    x: 1920,
    y: 0,
    width: 400,
    height: 800,
  })
})

test('sideForX splits the work area in half', () => {
  expect(sideForX(100, WA)).toBe('left')
  expect(sideForX(959, WA)).toBe('left')
  expect(sideForX(960, WA)).toBe('right')
  expect(sideForX(3000, WA)).toBe('right')
})

test('islandTop centers on the anchor but stays on screen', () => {
  expect(islandTop(500, 100, 1000)).toBe(450)
  expect(islandTop(20, 100, 1000)).toBe(10)
  expect(islandTop(990, 100, 1000)).toBe(890)
  expect(islandTop(500, 2000, 1000)).toBe(10) // taller than the area: pin to top
})
