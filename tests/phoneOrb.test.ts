// The phone app draws the island's orb from its own copies (its bundle holds
// only its own code): they must say what the island's say.
import { MODE_FRAMES, resolvePreset } from 'thinking-orbs/engine'
import { scaleCounts as orbScaleCounts, scaleRadii as orbScaleRadii } from 'thinking-orbs'
import { CHARACTER_COLOR, CHARACTER_DOTS, MOODS, MOOD_COLOR as ISLAND_MOOD_COLOR, ringKind as islandRing } from '@shared/character'
import { ORB_FOR_MOOD as ISLAND_ORB_FOR_MOOD, orbFps as islandFps, orbSpeed as islandSpeed } from '@shared/orbs'
import { MOOD_COLOR, ORB_COLOR, ORB_DOTS, ORB_FOR_MOOD, dotsPath, inkOf, moodWords, orbFps, orbForMood, orbInk, orbSpeed, ringKind, scaleCounts, scaleRadii, shadeGroups } from '../mobile/src/orb'
import { dayTitle } from '../mobile/src/words'

test('the phone’s orbs are the island’s', () => {
  expect(ORB_COLOR).toEqual(CHARACTER_COLOR)
  expect(ORB_DOTS).toEqual(CHARACTER_DOTS)
  expect(ORB_FOR_MOOD).toEqual(ISLAND_ORB_FOR_MOOD)
  expect(MOOD_COLOR).toEqual(ISLAND_MOOD_COLOR)
  for (const m of MOODS) {
    expect(orbSpeed(m)).toBe(islandSpeed(m))
    expect(orbFps(m)).toBe(islandFps(m))
    expect(ringKind(m)).toBe(islandRing(m))
    expect(orbForMood(m)).toBe(ISLAND_ORB_FOR_MOOD[m])
    expect(moodWords(m)).toBeTruthy()
  }
  // A mood the phone doesn't know yet: the resting globe.
  expect(orbForMood('juggling')).toBe('searching')
  expect(orbSpeed(undefined)).toBe(0.25)
})

test('its preset scaling is the orb engine’s', () => {
  for (const state of Object.keys(ISLAND_ORB_FOR_MOOD).map((m) => ISLAND_ORB_FOR_MOOD[m as keyof typeof ISLAND_ORB_FOR_MOOD])) {
    for (const base of [20, 32, 64] as const) {
      const { opts } = resolvePreset(state, base)
      for (const k of [0.72, 1, 1.45]) {
        expect(scaleCounts(opts, k)).toEqual(orbScaleCounts(opts, k))
        expect(scaleRadii(opts, k)).toEqual(orbScaleRadii(opts, k))
      }
    }
  }
})

test('a frame becomes a few paths, one per shade', () => {
  const { mode, opts } = resolvePreset('searching', 64)
  const frame = MODE_FRAMES[mode](64, 1.5, opts)
  const groups = shadeGroups(frame.dots)
  expect(groups.length).toBeGreaterThan(0)
  expect(groups.length).toBeLessThanOrEqual(121)
  expect(groups.reduce((n, g) => n + g.dots.length, 0)).toBe(frame.dots.filter((d) => Math.round(Math.min(1, Math.max(0, d.a ?? 1)) * 10) > 0).length)
  expect(dotsPath([{ x: 10, y: 10, r: 2 }])).toBe('M8 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0')
  // Its colour on dark; a deeper shade on light; back dots fade only partly.
  expect(orbInk('#ff8a65', false)).toEqual({ r: 255, g: 138, b: 101 })
  expect(orbInk('#ff8a65', true)).toEqual({ r: 189, g: 102, b: 75 })
  expect(inkOf(1, 1, { r: 200, g: 100, b: 0 }, false)).toBe('rgba(90,45,0,1)')
})

test('the day in words', () => {
  expect(dayTitle('2026-11-09')).toBe('Monday, 9 November')
  expect(dayTitle('2027-01-01')).toBe('Friday, 1 January')
  expect(dayTitle('soon')).toBe('soon')
})
