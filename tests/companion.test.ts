import { companionMood, companionSpot, DOZE_MS } from '../shared/companion'
import type { Activity } from '../shared/types'
import type { AgentSession } from '../shared/sessions'

const day = new Date(2026, 9, 14, 15, 0)
const s = (over: Partial<AgentSession>): AgentSession => ({ id: 's', agent: 'claude-code', cwd: '/p', project: 'p', phase: 'working', steps: [], turnSteps: 0, added: 0, removed: 0, edits: 0, files: [], startedAt: 0, lastAt: 0, ...over })
const session = (over: Partial<AgentSession>): Activity => ({ kind: 'session', id: 'x', priority: 2, session: s(over) })

test('the companion follows what is going on', () => {
  const now = day.getTime()
  expect(companionMood([], now, day)).toBe('idle')
  expect(companionMood([], now - DOZE_MS - 1, day)).toBe('sleeping')
  expect(companionMood([session({ steps: [{ id: '1', tool: 'Read', label: 'Reading a', at: 0, done: false }] })], now, day)).toBe('searching')
  expect(companionMood([session({})], now, day)).toBe('thinking')
  expect(companionMood([session({ phase: 'waiting' })], now, day)).toBe('attention')
  expect(companionMood([session({ phase: 'done' })], now, day)).toBe('done')
  expect(companionMood([{ kind: 'media', id: 'm', priority: 1, media: { title: 't', artist: 'a', playing: true, canControl: true } }], now, day)).toBe('dancing')
  expect(companionMood([{ kind: 'approval', id: 'a', priority: 10, request: { id: 'a', toolName: 'Bash', inputSummary: '' } }, session({})], now, day)).toBe('attention')
})

test('it stays where you put it, if that spot is still on a screen', () => {
  const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }]
  expect(companionSpot({ x: 100, y: 200 }, screens, 120)).toEqual({ x: 100, y: 200 })
  expect(companionSpot({ x: 3000, y: 200 }, screens, 120)).toEqual({ x: 1760, y: 880 })
  expect(companionSpot(null, screens, 120)).toEqual({ x: 1760, y: 880 })
})
