import { parseDock, columnBounds, sideForX, sideForPoint, islandTop, DEFAULT_DOCK, TOP_WIDTH } from '../shared/dock'

const WA = { x: 0, y: 32, width: 1920, height: 1048 }

test('parseDock validates and clamps', () => {
  expect(parseDock(undefined)).toEqual(DEFAULT_DOCK)
  expect(parseDock({ side: 'left', y: 0.5 })).toEqual({ side: 'left', y: 0.5 })
  expect(parseDock({ side: 'top', y: 7 })).toEqual({ side: 'top', y: 1 })
  expect(parseDock({ side: 'bottom', y: 0.2 })).toEqual({ side: 'right', y: 0.2 })
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

test('the top position is a centered band', () => {
  expect(columnBounds(WA, 'top')).toEqual({ x: (1920 - TOP_WIDTH) / 2, y: 32, width: TOP_WIDTH, height: 1048 })
  expect(columnBounds({ x: 1920, y: 0, width: 600, height: 800 }, 'top')).toEqual({ x: 1920, y: 0, width: 600, height: 800 })
})

test('dropping near the top center docks at the top, elsewhere on the nearer edge', () => {
  expect(sideForPoint(960, 60, WA)).toBe('top')
  expect(sideForPoint(700, 150, WA)).toBe('top')
  expect(sideForPoint(960, 400, WA)).toBe('right') // too low
  expect(sideForPoint(300, 60, WA)).toBe('left') // too far left of center
  expect(sideForPoint(1700, 60, WA)).toBe('right')
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

import { vi } from 'vitest'
vi.mock('electron', () => ({ desktopCapturer: {} }))
import { cropRect } from '../electron/backdrop'

test('cropRect maps window bounds into the display capture', () => {
  expect(cropRect({ x: 1440, y: 27, width: 480, height: 1053 }, { x: 0, y: 0 })).toEqual({
    x: 1440,
    y: 27,
    width: 480,
    height: 1053,
  })
  // second monitor to the right
  expect(cropRect({ x: 3360, y: 0, width: 480, height: 1080 }, { x: 1920, y: 0 })).toEqual({
    x: 1440,
    y: 0,
    width: 480,
    height: 1080,
  })
})
