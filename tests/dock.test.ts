import { parseDock, columnBounds, sideForX, sideForPoint, islandTop, panelTop, topLeft, PANEL_PLACE_HEIGHT, DEFAULT_DOCK, TOP_WIDTH } from '../shared/dock'

test('at the top the box is centred; a notch itself stays centred whatever hangs beside it', () => {
  // The floating pill: the whole row (the island and a second activity's bubble) is centred.
  expect(topLeft(820, 184)).toBe(318)
  expect(topLeft(820, 184 + 8 + 26)).toBe(301)
  // The notch: the island is at the centre with or without the bubble beside it.
  expect(topLeft(820, 184, { x: 0, w: 184 })).toBe(318)
  expect(topLeft(820, 184 + 8 + 26, { x: 0, w: 184 })).toBe(318)
  // A wider pill under it ("2 more · Clear all") centres the island in the box: still at the centre.
  expect(topLeft(820, 240, { x: 28, w: 184 }) + 28 + 92).toBe(410)
  // Not measured yet: the box is centred.
  expect(topLeft(820, 184, { x: 0, w: 0 })).toBe(318)
})

const WA = { x: 0, y: 32, width: 1920, height: 1048 }

test('parseDock validates and clamps', () => {
  expect(parseDock(undefined)).toEqual(DEFAULT_DOCK)
  expect(parseDock({ side: 'left', y: 0.5 })).toEqual({ side: 'left', y: 0.5 })
  expect(parseDock({ side: 'top', y: 7 })).toEqual({ side: 'top', y: 1 })
  expect(DEFAULT_DOCK.side).toBe('top')
  expect(parseDock({ side: 'bottom', y: 0.2 })).toEqual({ side: 'top', y: 0.2 })
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

test('panelTop keeps the open panel still whichever section is open', () => {
  // Sections of different heights all start at the same place on a tall screen.
  const at = 500 - PANEL_PLACE_HEIGHT / 2
  for (const h of [260, 380, 480, 560]) expect(panelTop(500, h, 1200)).toBe(at)
  // A section too tall to fit there moves up only as far as it needs.
  expect(panelTop(500, 960, 1200)).toBe(1200 - 960 - 10)
  // Near the top or on a short screen: the margin.
  expect(panelTop(100, 300, 1200)).toBe(10)
  expect(panelTop(300, 700, 600)).toBe(10)
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
