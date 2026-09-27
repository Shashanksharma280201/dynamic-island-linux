import { vi } from 'vitest'
vi.mock('x11', () => ({ default: {} }))
import { shapeRect } from '../electron/inputShape'

test('shapeRect scales, pads and never goes negative', () => {
  expect(shapeRect({ x: 400, y: 300, width: 40, height: 80 }, 1)).toEqual([400, 300, 40, 80])
  expect(shapeRect({ x: 400, y: 300, width: 40, height: 80 }, 2, 4)).toEqual([792, 592, 96, 176])
  expect(shapeRect({ x: 2, y: 1, width: 10, height: 10 }, 1.5, 4)).toEqual([0, 0, 27, 27])
})
