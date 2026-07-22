import { IPC } from '@shared/types'

test('IPC channels are defined', () => {
  expect(IPC.STATE).toBe('island:state')
  expect(IPC.DECISION).toBe('island:decision')
})
