import { vi } from 'vitest'
vi.mock('electron', () => ({ ipcMain: { on: vi.fn() } }))
import {
  parseDecisionMsg,
  parseMediaCmd,
  parseSysCmd,
  parseReply,
  parseMessageAction,
  parseNotifAction,
} from '../electron/ipc'

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
  expect(parseMediaCmd({ type: 'seek', position: 12.5 })).toEqual({ type: 'seek', position: 12.5 })
  expect(parseMediaCmd({ type: 'seek', position: -3 })).toEqual({ type: 'seek', position: 0 })
  expect(parseMediaCmd({ type: 'seek', position: 'x' })).toBeNull()
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

test('parseReply trims and bounds text', () => {
  expect(parseReply({ id: 'a', text: '  hi  ' })).toEqual({ id: 'a', text: 'hi' })
  expect(parseReply({ id: 'a', text: '   ' })).toBeNull()
  expect(parseReply({ id: 'a', text: 'x'.repeat(5000) })).toBeNull()
  expect(parseReply({ id: 1, text: 'x' })).toBeNull()
})

test('parseMessageAction / parseNotifAction', () => {
  expect(parseMessageAction({ id: 'a', action: 'read' })).toEqual({ id: 'a', action: 'read' })
  expect(parseMessageAction({ id: 'a', action: 'delete' })).toBeNull()
  expect(parseNotifAction({ id: 'a', key: '0' })).toEqual({ id: 'a', key: '0' })
  expect(parseNotifAction({ id: 'a' })).toBeNull()
})
