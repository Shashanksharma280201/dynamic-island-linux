import { describe, expect, it } from 'vitest'
import { orbForRun, orbForTool, orbForVoice } from '../shared/orbs'
import { orbBase, parseTint } from '../renderer/orb/Orb'

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
