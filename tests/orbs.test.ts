import { describe, expect, it } from 'vitest'
import { ORB_FOR_MOOD, orbFps, orbForRun, orbForTool, orbForVoice, orbSpeed } from '../shared/orbs'
import { MOODS } from '../shared/character'
import { inkOf, orbBase, orbInk, pace, parseTint, shadeGroups } from '../renderer/orb/Orb'

describe('orbs', () => {
  it('pick an animation for what an agent is doing', () => {
    expect(orbForTool('Read')).toBe('searching')
    expect(orbForTool('Grep')).toBe('searching')
    expect(orbForTool('MultiEdit')).toBe('composing')
    expect(orbForTool('Bash')).toBe('working')
    expect(orbForTool('WebFetch')).toBe('connecting')
    expect(orbForTool('mcp__github__get_issue')).toBe('connecting')
    expect(orbForTool('Task')).toBe('weaving')
    expect(orbForTool('TodoWrite')).toBe('shaping')
    expect(orbForTool(undefined)).toBe('working')
    expect(orbForRun('thinking')).toBe('solving')
    expect(orbForRun('tool', 'Edit')).toBe('composing')
    expect(orbForRun('done')).toBe('breathing')
    expect(orbForVoice('listening')).toBe('listening')
    expect(orbForVoice('transcribing')).toBe('weaving')
  })

  it('draw any size from the nearest tuned preset', () => {
    expect(orbBase(16)).toEqual({ base: 20, scale: 0.8 })
    expect(orbBase(40)).toEqual({ base: 32, scale: 1.25 })
    expect(orbBase(128)).toEqual({ base: 64, scale: 2 })
  })

  it('read a colour for the ink', () => {
    expect(parseTint('#f80')).toEqual({ r: 255, g: 136, b: 0 })
    expect(parseTint('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 })
    expect(parseTint('teal')).toBeUndefined()
  })
})

describe('orb frame pacing', () => {
  test('draws at the asked rate on a faster screen', () => {
    // 30 frames a second on a 60 Hz screen: every other refresh.
    let due = 0
    const drawn: number[] = []
    for (let i = 0; i < 60; i++) {
      const now = i * (1000 / 60)
      const r = pace(now, due, 1000 / 30)
      due = r.due
      if (r.draw) drawn.push(i)
    }
    expect(drawn.length).toBeGreaterThanOrEqual(29)
    expect(drawn.length).toBeLessThanOrEqual(31)
    expect(drawn.slice(0, 4)).toEqual([0, 2, 4, 6])
  })

  test('after a pause it carries on, without a burst of frames', () => {
    const every = 50
    const after = pace(10_000, 100, every)
    expect(after.draw).toBe(true)
    expect(pace(10_001, after.due, every).draw).toBe(false)
  })
})

describe('the character as an orb', () => {
  test('every mood has an orb, and resting ones draw fewer frames', () => {
    for (const m of MOODS) expect(ORB_FOR_MOOD[m]).toBeTruthy()
    // Resting: a globe turning slowly, fewer frames.
    expect(ORB_FOR_MOOD.idle).toBe('searching')
    expect(orbSpeed('idle')).toBeLessThan(1)
    expect(orbFps('idle')).toBe(10)
    expect(orbFps('thinking')).toBe(24)
    expect(orbFps('working')).toBe(24)
    // Asleep it holds still: no frames at all.
    expect(orbFps('sleeping')).toBe(0)
  })
})

describe('painting an orb', () => {
  test('dots grouped by shade: one fill per group, back to front', () => {
    const dots = [
      { x: 0, y: 0, z: -1, r: 1, white: 0.52, a: 0.33 },
      { x: 1, y: 0, z: 0, r: 1, white: 0.5, a: 0.31 },
      { x: 2, y: 0, z: 1, r: 1, white: 0, a: 1 },
      { x: 3, y: 0, z: 2, r: 1, white: 0, a: 0.001 },
    ]
    const g = shadeGroups(dots)
    // The first two round to the same shade; the faint one isn't drawn.
    expect(g.map((x) => x.dots.length)).toEqual([2, 1])
    expect(g[0]).toMatchObject({ w: 0.5, a: 0.3 })
    expect(g[1]).toMatchObject({ w: 0, a: 1 })
  })

  test('ink: the tint, the dots at the back fading only partly into the glass', () => {
    expect(inkOf(0, 1)).toBe('rgba(255,255,255,1)')
    // Dark glass: the furthest dot keeps nearly half its brightness.
    expect(inkOf(1, 1, { r: 200, g: 100, b: 50 })).toBe('rgba(90,45,22,1)')
    // Light glass: it fades toward white, not all the way.
    expect(inkOf(1, 0.5, { r: 100, g: 100, b: 100 }, true)).toBe('rgba(170,170,170,0.5)')
    expect(inkOf(0, 1, undefined, true)).toBe('rgba(72,72,78,1)')
  })

  test('on light glass the ink is deeper, and plain orbs are grey, not white', () => {
    expect(orbInk('#ff8a65', false)).toEqual({ r: 255, g: 138, b: 101 })
    expect(orbInk('#ff8a65', true)).toEqual({ r: 189, g: 102, b: 75 })
    expect(orbInk(undefined, false)).toBeUndefined()
    expect(orbInk(undefined, true)).toEqual({ r: 72, g: 72, b: 78 })
  })
})
