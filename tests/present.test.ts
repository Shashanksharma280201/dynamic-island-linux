import { present } from '../shared/present'
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
