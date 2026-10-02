import { CHARACTERS, MOODS, moodFor, parseCharacter, restingMood } from '../shared/character'
import { mergeConfig } from '../electron/config'
import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {} }))

test('every character has a name, kind and personality', () => {
  expect(CHARACTERS.map((c) => c.id)).toEqual(['orbit', 'bolt', 'mochi'])
  for (const c of CHARACTERS) expect(c.name && c.kind && c.personality).toBeTruthy()
  expect(new Set(MOODS).size).toBe(MOODS.length)
})

test('stored character settings are validated', () => {
  expect(parseCharacter(null)).toEqual({ id: 'orbit', name: 'Orbit' })
  expect(parseCharacter({ id: 'bolt' })).toEqual({ id: 'bolt', name: 'Bolt' })
  expect(parseCharacter({ id: 'mochi', name: '  Momo  ' })).toEqual({ id: 'mochi', name: 'Momo' })
  expect(parseCharacter({ id: 'dragon', name: 'X' })).toEqual({ id: 'orbit', name: 'X' })
  expect(parseCharacter({ id: 'bolt', name: 'A'.repeat(40) }).name).toHaveLength(24)
  expect(parseCharacter({ id: 'bolt', name: 42 }).name).toBe('Bolt')
  expect(mergeConfig({ character: { id: 'mochi', name: 'Mo' } }).character).toEqual({ id: 'mochi', name: 'Mo' })
  expect(mergeConfig({}).character).toEqual({ id: 'orbit', name: 'Orbit' })
})

test('what the agent is doing becomes a mood', () => {
  expect(moodFor('listening')).toBe('listening')
  expect(moodFor('transcribing')).toBe('thinking')
  expect(moodFor('thinking')).toBe('thinking')
  expect(moodFor('tool', 'Read')).toBe('searching')
  expect(moodFor('tool', 'WebSearch')).toBe('searching')
  expect(moodFor('tool', 'Edit')).toBe('writing')
  expect(moodFor('tool', 'Bash')).toBe('working')
  expect(moodFor('writing')).toBe('writing')
  expect(moodFor('done')).toBe('done')
  expect(moodFor('error')).toBe('error')
  expect(moodFor('stopped')).toBe('idle')
  expect(moodFor('idle')).toBe('idle')
})

test('it sleeps late at night', () => {
  const at = (h: number) => new Date(2026, 9, 2, h, 30)
  expect(restingMood(at(23))).toBe('sleeping')
  expect(restingMood(at(3))).toBe('sleeping')
  expect(restingMood(at(6))).toBe('idle')
  expect(restingMood(at(14))).toBe('idle')
})
