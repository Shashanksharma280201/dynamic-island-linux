import { formatTime, currentPosition, ruleLabel } from '../shared/format'

test('formatTime', () => {
  expect(formatTime(0)).toBe('0:00')
  expect(formatTime(75.9)).toBe('1:15')
  expect(formatTime(3725)).toBe('1:02:05')
  expect(formatTime(-4)).toBe('0:00')
})

test('currentPosition extrapolates while playing and clamps to length', () => {
  const m = { position: 10, positionAt: 1000, length: 12, playing: true }
  expect(currentPosition(m, 2000)).toBe(11)
  expect(currentPosition(m, 99000)).toBe(12)
  expect(currentPosition({ ...m, playing: false }, 99000)).toBe(10)
  expect(currentPosition({ playing: true }, 5)).toBe(0)
})

test('ruleLabel describes suggested allow rules', () => {
  expect(ruleLabel(undefined)).toBeNull()
  expect(
    ruleLabel([{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }] }]),
  ).toBe('Bash(npm test)')
  expect(ruleLabel([{ rules: [{ toolName: 'WebFetch' }] }])).toBe('WebFetch')
})

import { relativeTime, fullTime } from '../shared/format'

test('relativeTime follows Mail/Messages conventions', () => {
  const now = new Date(2026, 8, 27, 15, 30).getTime() // Sun 27 Sep 2026 15:30
  expect(relativeTime(now - 20_000, now)).toBe('now')
  expect(relativeTime(now - 5 * 60_000, now)).toBe('5m')
  expect(relativeTime(new Date(2026, 8, 27, 9, 5).getTime(), now)).toBe('09:05')
  expect(relativeTime(new Date(2026, 8, 26, 23, 0).getTime(), now)).toBe('Yesterday')
  expect(relativeTime(new Date(2026, 8, 23, 12, 0).getTime(), now)).toBe('Wednesday')
  expect(relativeTime(new Date(2026, 2, 12, 12, 0).getTime(), now)).toBe('12 Mar')
  expect(fullTime(new Date(2026, 2, 12, 14, 5).getTime())).toBe('Thu 12 Mar, 14:05')
})
