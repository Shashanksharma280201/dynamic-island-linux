import { CHARACTERS, MOODS, moodFor, parseCharacter, restingMood } from '../shared/character'
import { mergeConfig } from '../electron/config'
import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {} }))

test('every character has a name, kind and personality', () => {
  expect(CHARACTERS.map((c) => c.id)).toEqual(['orbit', 'bolt', 'puff'])
  for (const c of CHARACTERS) expect(c.name && c.kind && c.personality).toBeTruthy()
  expect(new Set(MOODS).size).toBe(MOODS.length)
})

test('stored character settings are validated', () => {
  // The assistant is Friday until you rename it, whichever orb it is.
  expect(parseCharacter(null)).toEqual({ id: 'orbit', name: 'Friday', color: null })
  expect(parseCharacter({ id: 'bolt' })).toEqual({ id: 'bolt', name: 'Friday', color: null })
  // It used to take its orb's name: one saved that way was never chosen, so it becomes Friday too.
  expect(parseCharacter({ id: 'orbit', name: 'Orbit' }).name).toBe('Friday')
  expect(parseCharacter({ id: 'puff', name: 'Bolt' }).name).toBe('Friday')
  expect(parseCharacter({ id: 'bolt', name: 'Jarvis' }).name).toBe('Jarvis')
  expect(parseCharacter({ id: 'puff', name: '  Momo  ' })).toEqual({ id: 'puff', name: 'Momo', color: null })
  // The blob used to be called Mochi: saved settings move over to Puff.
  expect(parseCharacter({ id: 'mochi', name: 'Momo' })).toEqual({ id: 'puff', name: 'Momo', color: null })
  expect(parseCharacter({ id: 'mochi', name: 'Mochi' })).toEqual({ id: 'puff', name: 'Friday', color: null })
  expect(parseCharacter({ id: 'dragon', name: 'X' })).toEqual({ id: 'orbit', name: 'X', color: null })
  expect(parseCharacter({ id: 'bolt', name: 'A'.repeat(40) }).name).toHaveLength(24)
  expect(parseCharacter({ id: 'bolt', name: 42 }).name).toBe('Friday')
  expect(mergeConfig({ character: { id: 'puff', name: 'Mo' } }).character).toEqual({ id: 'puff', name: 'Mo', color: null })
  expect(mergeConfig({}).character).toEqual({ id: 'orbit', name: 'Friday', color: null })
})

test('its colour', () => {
  expect(parseCharacter({ id: 'bolt', color: '#5ac8fa' })).toMatchObject({ color: '#5ac8fa' })
  expect(parseCharacter({ color: '#123456' })).toMatchObject({ color: null })
  // Outfits were dropped with the faces: an old setting is just left behind.
  expect(parseCharacter({ id: 'bolt', outfit: 'crown' })).toEqual({ id: 'bolt', name: 'Friday', color: null })
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
