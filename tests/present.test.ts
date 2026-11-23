import { isCard, present, turnTakers } from '../shared/present'
import type { Activity } from '@shared/types'

const media: Activity = {
  kind: 'media',
  id: 'media',
  priority: 1,
  media: { title: 'S', artist: 'A', playing: true, canControl: true },
}
const approval: Activity = {
  kind: 'approval',
  id: 'a1',
  priority: 10,
  request: { id: 'a1', toolName: 'Bash', inputSummary: 'x' },
}

test('idle when empty', () => {
  expect(present([], { expanded: false }).mode).toBe('idle')
})

test('single media compact, expands on hover', () => {
  expect(present([media], { expanded: false }).mode).toBe('compact')
  expect(present([media], { expanded: true }).mode).toBe('expanded')
})

test('approval forces expanded', () => {
  expect(present([approval, media], { expanded: false }).mode).toBe('expanded')
})

test('two ambient activities -> minimal with detached', () => {
  const other: Activity = { ...media, id: 'm2', priority: 2 }
  const p = present([media, other], { expanded: false })
  expect(p.mode).toBe('minimal')
  if (p.mode === 'minimal') {
    expect(p.primary.id).toBe('m2') // higher priority attached
    expect(p.detached.id).toBe('media')
  }
})

const notif = (id: string, seq: number): Activity => ({
  kind: 'notification',
  id,
  seq,
  priority: 5,
  notification: { app: 'a', summary: id, body: '' },
})

test('newest notification wins among equal priority', () => {
  const p = present([notif('old', 1), notif('new', 2)], { expanded: false })
  expect(p.mode === 'expanded' && p.primary.id).toBe('new')
  expect(p.mode === 'expanded' && p.queued).toBe(1)
})

test('approvals are answered first-come-first-served', () => {
  const a = (id: string, seq: number): Activity => ({ ...approval, id, seq })
  const p = present([a('second', 2), a('first', 1)], { expanded: false })
  expect(p.mode === 'expanded' && p.primary.id).toBe('first')
  expect(p.mode === 'expanded' && p.queued).toBe(1)
})

describe('taking turns', () => {
  const timer: Activity = { kind: 'timer', id: 'timer', priority: 1.8, timer: { phase: 'focus', endsAt: 1, left: null, done: 0, day: '2026-11-23', focusMin: 25, breakMin: 5 } }
  const claude: Activity = { kind: 'claude', id: 'claude-run', priority: 2, run: { id: 'r', prompt: 'p', cwd: '/x', phase: 'thinking', steps: 0, startedAt: 0 } as never }
  const call: Activity = { kind: 'call', id: 'call', priority: 4, call: { started: 0 } }
  const shown = (list: Activity[], turn: number, expanded = false) => {
    const p = present(list, { expanded, turn })
    return p.mode === 'minimal' ? `${p.primary.id}+${p.detached.id}` : p.mode === 'idle' ? 'idle' : `${p.mode}:${p.primary.id}`
  }

  it('with two quiet things both already show: nothing moves', () => {
    expect(turnTakers([media, timer])).toEqual([])
    expect(shown([media, timer], 0)).toBe('timer+media')
    expect(shown([media, timer], 1)).toBe('timer+media')
    expect(shown([media], 5)).toBe('compact:media')
  })

  it('with three, the capsule shows each in turn and the circle the one after', () => {
    const all = [media, timer, claude]
    expect(turnTakers(all).map((a) => a.id)).toEqual(['claude-run', 'timer', 'media'])
    expect(shown(all, 0)).toBe('claude-run+timer')
    expect(shown(all, 1)).toBe('timer+media')
    expect(shown(all, 2)).toBe('media+claude-run')
    expect(shown(all, 3)).toBe('claude-run+timer')
    // Without a turn it's as before: the most important, then the next.
    const p = present(all, { expanded: false })
    expect(p.mode === 'minimal' && `${p.primary.id}+${p.detached.id}`).toBe('claude-run+timer')
  })

  it('hovering opens the one that is showing', () => {
    expect(shown([media, timer, claude], 1, true)).toBe('expanded:timer')
    expect(shown([media, timer, claude], 2, true)).toBe('expanded:media')
  })

  it('a card comes first whatever the turn, and is not one of the takers', () => {
    const all = [media, timer, claude, notif('n', 9)]
    expect(turnTakers(all)).toEqual([])
    expect(shown(all, 2)).toBe('expanded:n')
    expect(isCard(notif('n', 1))).toBe(true)
    expect(isCard(claude)).toBe(false)
    expect(isCard({ ...claude, run: { ...(claude as { run: object }).run, phase: 'done' } } as Activity)).toBe(true)
  })

  it('a call being recorded keeps its place', () => {
    expect(turnTakers([media, timer, claude, call])).toEqual([])
    expect(shown([media, timer, claude, call], 2)).toBe('call+claude-run')
  })
})
