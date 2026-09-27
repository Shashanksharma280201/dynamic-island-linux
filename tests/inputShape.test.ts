import { vi } from 'vitest'
vi.mock('x11', () => ({ default: {} }))
import { shapeRect, wmHints, clientMessage } from '../electron/inputShape'

test('shapeRect scales, pads and never goes negative', () => {
  expect(shapeRect({ x: 400, y: 300, width: 40, height: 80 }, 1)).toEqual([400, 300, 40, 80])
  expect(shapeRect({ x: 400, y: 300, width: 40, height: 80 }, 2, 4)).toEqual([792, 592, 96, 176])
  expect(shapeRect({ x: 2, y: 1, width: 10, height: 10 }, 1.5, 4)).toEqual([0, 0, 27, 27])
})

test('focus requests: WM_HINTS input flag and _NET_ACTIVE_WINDOW message', () => {
  const on = wmHints(true)
  expect(on.length).toBe(36)
  expect([on.readUInt32LE(0), on.readUInt32LE(4)]).toEqual([1, 1])
  expect(wmHints(false).readUInt32LE(4)).toBe(0)
  const m = clientMessage(0x1234, 99, [2, 0, 0])
  expect(m.length).toBe(32)
  expect([m[0], m[1], m.readUInt32LE(4), m.readUInt32LE(8), m.readUInt32LE(12)]).toEqual([33, 32, 0x1234, 99, 2])
})
