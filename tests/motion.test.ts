import { describe, expect, it } from 'vitest'
import { islandClose, islandOpen, morphSpring, sizeRank } from '../renderer/anim/spring'
import { FULL_MS, LEAVE_MS, PEEK_MS, nextStage } from '../renderer/island/useHoverIntent'
import { APPROVAL_KEYS, canAlways, frontApproval, keyLabel } from '../shared/approvalKeys'
import type { Activity, ToolRequest } from '@shared/types'
import { MOODS, MOOD_COLOR, gazeToward, ringKind } from '../shared/character'
import { addSteps, applyStreamEvent, newRun, TRAIL_MAX } from '../shared/claude'
import { partOfDay } from '../shared/format'
import { dayOf, greeting } from '../electron/config'
import { mayPlay, SOUND_GAP_MS, TONES } from '../renderer/sound'

describe('island springs', () => {
  it('ranks presentations from resting to the panel', () => {
    expect(sizeRank('idle')).toBe(0)
    expect(sizeRank('compact:media:m')).toBe(0)
    expect(sizeRank('minimal:media:m')).toBe(0)
    expect(sizeRank('peek:idle')).toBe(1)
    expect(sizeRank('expanded:approval:a1')).toBe(2)
    expect(sizeRank('drop')).toBe(2)
    expect(sizeRank('panel')).toBe(3)
  })
  it('opens with the bouncy spring and closes with the calm one', () => {
    expect(morphSpring('idle', 'peek:idle')).toBe(islandOpen)
    expect(morphSpring('peek:idle', 'expanded:media:m')).toBe(islandOpen)
    expect(morphSpring('panel', 'idle')).toBe(islandClose)
    expect(morphSpring('expanded:approval:a1', 'compact:media:m')).toBe(islandClose)
    // One card replacing another of the same size keeps the open spring.
    expect(morphSpring('expanded:approval:a1', 'expanded:approval:a2')).toBe(islandOpen)
    expect(islandClose.damping / (2 * Math.sqrt(islandClose.stiffness))).toBeGreaterThanOrEqual(1) // no overshoot
  })
})

describe('hover intent', () => {
  it('peeks, then opens, then folds after leaving', () => {
    expect(nextStage('none', true)).toEqual({ stage: 'peek', after: PEEK_MS })
    expect(nextStage('peek', true)).toEqual({ stage: 'full', after: FULL_MS })
    expect(nextStage('full', true)).toBeNull()
    expect(nextStage('full', false)).toEqual({ stage: 'none', after: LEAVE_MS })
    expect(nextStage('peek', false)).toEqual({ stage: 'none', after: LEAVE_MS })
    expect(nextStage('none', false)).toBeNull()
  })
})

const req = (id: string, extra: Partial<ToolRequest> = {}): ToolRequest => ({ id, toolName: 'Bash', inputSummary: 'npm test', ...extra })
const approval = (id: string, seq: number, extra: Partial<ToolRequest> = {}): Activity => ({ kind: 'approval', id, priority: 10, seq, request: req(id, extra) })

describe('approval keys', () => {
  it('answers the approval asked first', () => {
    const media: Activity = { kind: 'media', id: 'm', priority: 1, seq: 0, media: { title: 'S', artist: 'A', playing: true, canControl: true } }
    expect(frontApproval([media])).toBeNull()
    expect(frontApproval([media, approval('b', 5), approval('a', 2)])?.id).toBe('a')
  })
  it('offers Always only when Claude suggested a rule', () => {
    const rule = [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test:*' }], behavior: 'allow', destination: 'localSettings' }]
    expect(canAlways(req('x'))).toBe(false)
    expect(canAlways(req('x', { suggestions: rule }))).toBe(true)
    expect(canAlways(req('x', { suggestions: rule, ask: { app: 'Orbit', title: 't', body: 'b' } }))).toBe(false)
  })
  it('labels the keys for each platform', () => {
    expect(keyLabel(APPROVAL_KEYS.allow, false)).toBe('Ctrl+Alt+Y')
    expect(keyLabel(APPROVAL_KEYS.deny, true)).toBe('⌃⌥N')
  })
})

describe('characters', () => {
  it('give every mood with a ring a colour', () => {
    for (const m of MOODS) if (ringKind(m)) expect(MOOD_COLOR[m]).toMatch(/^#[0-9a-f]{6}$/)
    expect(ringKind('idle')).toBeNull()
    expect(ringKind('sleeping')).toBeNull()
    expect(ringKind('thinking')).toBe('busy')
    expect(ringKind('attention')).toBe('alert')
    expect(ringKind('done')).toBe('full')
  })
  it('look toward the pointer, softly', () => {
    expect(gazeToward(0, 0)).toEqual([0, 0])
    const [x, y] = gazeToward(3000, -3000)
    expect(x).toBeGreaterThan(0.99)
    expect(y).toBeLessThan(-0.99)
    expect(gazeToward(150, 0)[0]).toBeCloseTo(Math.tanh(0.5))
  })
})

describe('Claude step trail', () => {
  it('merges a burst of reads and keeps the newest steps', () => {
    expect(addSteps([], ['Reading a.ts', 'Reading b.ts', 'Reading c.ts', 'Running npm test'])).toEqual(['Reading 3 files', 'Running npm test'])
    expect(addSteps(['Reading a.ts'], ['Reading b.ts'])).toEqual(['Reading a.ts', 'Reading b.ts'])
    const many = addSteps([], Array.from({ length: 12 }, (_, i) => `Running step ${i}`))
    expect(many).toHaveLength(TRAIL_MAX)
    expect(many.at(-1)).toBe('Running step 11')
  })
  it('records tool calls from the stream', () => {
    const run = applyStreamEvent(newRun('r', 'p', '/x', 0), { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/a.ts' } }, { type: 'tool_use', name: 'Read', input: { file_path: '/x/b.ts' } }] } }, 1)
    expect(run.steps).toBe(2)
    expect(run.trail).toEqual(['Reading 2 files'])
  })
})

describe('hello', () => {
  it('greets once a day, never under automation', () => {
    expect(greeting('', '2026-10-07', false)).toEqual({ first: true })
    expect(greeting('2026-10-06', '2026-10-07', false)).toEqual({ first: false })
    expect(greeting('2026-10-07', '2026-10-07', false)).toBeNull()
    expect(greeting('', '2026-10-07', true)).toBeNull()
    expect(dayOf(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
  it('says the right part of the day', () => {
    expect(partOfDay(8)).toBe('Good morning')
    expect(partOfDay(14)).toBe('Good afternoon')
    expect(partOfDay(21)).toBe('Good evening')
    expect(partOfDay(2)).toBe('Good evening')
  })
})

describe('sounds', () => {
  it('play each kind at most once per gap', () => {
    expect(mayPlay(1000, undefined)).toBe(true)
    expect(mayPlay(1000 + SOUND_GAP_MS - 1, 1000)).toBe(false)
    expect(mayPlay(1000 + SOUND_GAP_MS, 1000)).toBe(true)
  })
  it('stay short', () => {
    for (const notes of Object.values(TONES)) for (const [, at, len] of notes) expect(at + len).toBeLessThanOrEqual(0.4)
  })
})
