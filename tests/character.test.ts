import { CHARACTERS, MOODS, moodFor, parseCharacter, restingMood, seasonalOutfit, wearing } from '../shared/character'
import { mergeConfig } from '../electron/config'
import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {} }))

test('every character has a name, kind and personality', () => {
  expect(CHARACTERS.map((c) => c.id)).toEqual(['orbit', 'bolt', 'puff'])
  for (const c of CHARACTERS) expect(c.name && c.kind && c.personality).toBeTruthy()
  expect(new Set(MOODS).size).toBe(MOODS.length)
})

test('stored character settings are validated', () => {
  expect(parseCharacter(null)).toEqual({ id: 'orbit', name: 'Orbit', outfit: 'auto', color: null })
  expect(parseCharacter({ id: 'bolt' })).toEqual({ id: 'bolt', name: 'Bolt', outfit: 'auto', color: null })
  expect(parseCharacter({ id: 'puff', name: '  Momo  ' })).toEqual({ id: 'puff', name: 'Momo', outfit: 'auto', color: null })
  // The blob used to be called Mochi: saved settings move over to Puff.
  expect(parseCharacter({ id: 'mochi', name: 'Momo' })).toEqual({ id: 'puff', name: 'Momo', outfit: 'auto', color: null })
  expect(parseCharacter({ id: 'mochi', name: 'Mochi' })).toEqual({ id: 'puff', name: 'Puff', outfit: 'auto', color: null })
  expect(parseCharacter({ id: 'dragon', name: 'X' })).toEqual({ id: 'orbit', name: 'X', outfit: 'auto', color: null })
  expect(parseCharacter({ id: 'bolt', name: 'A'.repeat(40) }).name).toHaveLength(24)
  expect(parseCharacter({ id: 'bolt', name: 42 }).name).toBe('Bolt')
  expect(mergeConfig({ character: { id: 'puff', name: 'Mo' } }).character).toEqual({ id: 'puff', name: 'Mo', outfit: 'auto', color: null })
  expect(mergeConfig({}).character).toEqual({ id: 'orbit', name: 'Orbit', outfit: 'auto', color: null })
})

test('what it wears, and its colour', () => {
  expect(parseCharacter({ id: 'bolt', outfit: 'crown', color: '#5ac8fa' })).toMatchObject({ outfit: 'crown', color: '#5ac8fa' })
  expect(parseCharacter({ outfit: 'tiara', color: '#123456' })).toMatchObject({ outfit: 'auto', color: null })
  expect(seasonalOutfit(new Date(2026, 9, 31))).toBe('witch')
  expect(seasonalOutfit(new Date(2026, 11, 24))).toBe('santa')
  expect(seasonalOutfit(new Date(2026, 11, 31))).toBe('party')
  expect(seasonalOutfit(new Date(2027, 0, 1))).toBe('party')
  expect(seasonalOutfit(new Date(2027, 1, 14))).toBe('flower')
  expect(seasonalOutfit(new Date(2027, 0, 20))).toBe('beanie')
  expect(seasonalOutfit(new Date(2027, 6, 4))).toBe('sunglasses')
  expect(seasonalOutfit(new Date(2027, 3, 4))).toBe('none')
  expect(wearing('auto', new Date(2026, 11, 24))).toBe('santa')
  expect(wearing('cap', new Date(2026, 11, 24))).toBe('cap')
  expect(wearing(undefined, new Date(2026, 11, 24))).toBe('none')
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
