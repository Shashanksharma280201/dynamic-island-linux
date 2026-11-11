import { clockText, clockTitle, msToNextMinute } from '../shared/clock'

test('the notch’s time: hours and minutes, without AM or PM', () => {
  const at = new Date(2026, 10, 11, 21, 7, 30)
  expect(clockText(at, 'en-US', true)).toBe('9:07')
  expect(clockText(at, 'en-GB', false)).toBe('21:07')
  expect(clockText(new Date(2026, 10, 11, 0, 5), 'en-US', true)).toBe('12:05')
  expect(clockText(new Date(2026, 10, 11, 9, 41), 'en-IN', true)).toBe('9:41')
  // The tooltip says the whole day and time.
  expect(clockTitle(at, 'en-GB', false)).toBe('Wednesday 11 November at 21:07')
  expect(clockTitle(at, 'en-US', true)).toMatch(/^Wednesday, November 11 at 9:07\sPM$/)
})

test('it turns over when the minute does', () => {
  expect(msToNextMinute(Date.UTC(2026, 10, 11, 9, 41, 0))).toBe(60_000)
  expect(msToNextMinute(Date.UTC(2026, 10, 11, 9, 41, 59, 500))).toBe(500)
})
