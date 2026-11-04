import { describe, expect, it } from 'vitest'
import { orbForRun, orbForTool, orbForVoice } from '../shared/orbs'
import { orbBase, pace, parseTint } from '../renderer/orb/Orb'

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
