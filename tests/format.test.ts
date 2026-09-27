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
