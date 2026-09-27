import { vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { on: vi.fn() } }))
import { parseDecisionMsg, parseMediaCmd, parseSysCmd } from '../electron/ipc'

test('parseDecisionMsg validates and trims renderer input', () => {
  expect(parseDecisionMsg(null)).toBeNull()
  expect(parseDecisionMsg({ id: 'a', decision: 'yolo' })).toBeNull()
  expect(parseDecisionMsg({ id: 'a', decision: 'deny', message: '  no  ', always: true })).toEqual({
    id: 'a',
    decision: 'deny',
    message: 'no',
  })
  expect(parseDecisionMsg({ id: 'a', decision: 'allow', always: true, message: 'x' })).toEqual({
    id: 'a',
    decision: 'allow',
    always: true,
  })
  expect(parseDecisionMsg({ id: 'a', decision: 'ask' })).toEqual({ id: 'a', decision: 'ask' })
})

test('parseMediaCmd only accepts known commands', () => {
  expect(parseMediaCmd('next')).toBe('next')
  expect(parseMediaCmd('rm -rf')).toBeNull()
})

test('parseSysCmd checks value types', () => {
  expect(parseSysCmd({ type: 'volume', value: 30 })).toEqual({ type: 'volume', value: 30 })
  expect(parseSysCmd({ type: 'volume', value: '30' })).toBeNull()
  expect(parseSysCmd({ type: 'wifi', value: 1 })).toBeNull()
  expect(parseSysCmd({ type: 'bluetooth', value: false })).toEqual({
    type: 'bluetooth',
    value: false,
  })
  expect(parseSysCmd({ type: 'mute', value: 'x' })).toEqual({ type: 'mute' })
  expect(parseSysCmd({ type: 'reboot' })).toBeNull()
})
