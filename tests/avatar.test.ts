import { initialsOf, avatarGradient, nameColor } from '../shared/avatar'
import { dayLabel, clockTime, dayKey } from '../shared/format'

test('initials use letters and digits only', () => {
  expect(initialsOf('Rahul (Work)')).toBe('RW')
  expect(initialsOf('Family ❤️')).toBe('F')
  expect(initialsOf('❤️🎉')).toBe('')
  expect(initialsOf('college friends 2016')).toBe('CF')
  expect(initialsOf('+91 98765 43210')).toBe('99')
})

test('avatar colours are stable per name and vary between names', () => {
  expect(avatarGradient('Alice')).toBe(avatarGradient('Alice'))
  const set = new Set(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Mallory'].map(avatarGradient))
  expect(set.size).toBeGreaterThan(2)
  expect(nameColor('Sam')).toMatch(/^#/)
})

test('day labels and clock times', () => {
  const now = new Date(2026, 8, 27, 15, 0).getTime()
  expect(dayLabel(new Date(2026, 8, 27, 9).getTime(), now)).toBe('Today')
  expect(dayLabel(new Date(2026, 8, 26, 9).getTime(), now)).toBe('Yesterday')
  expect(dayLabel(new Date(2026, 8, 23, 9).getTime(), now)).toBe('Wednesday')
  expect(dayLabel(new Date(2026, 2, 12, 9).getTime(), now)).toBe('12 Mar')
  expect(dayLabel(new Date(2024, 2, 12, 9).getTime(), now)).toBe('12 Mar 2024')
  expect(clockTime(new Date(2026, 0, 1, 7, 5).getTime())).toBe('07:05')
  expect(dayKey(new Date(2026, 0, 1, 1).getTime())).toBe(dayKey(new Date(2026, 0, 1, 23).getTime()))
})
