import { attachmentNote } from '../shared/attachment'

test('an attached window reads plainly in the message', () => {
  expect(attachmentNote({ title: 'Pull request #12', path: '/d/window-1.png' })).toBe('(Attached: a screenshot of the window I was in ("Pull request #12"), at /d/window-1.png. Look at it if it helps.)')
  expect(attachmentNote({ title: 'Inbox', path: null })).toBe('(For context: I was in the window "Inbox".)')
})
