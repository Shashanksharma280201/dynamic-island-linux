import { vi } from 'vitest'
import { ActivityStore } from '../electron/store'
import { TransientCards } from '../electron/transient'
import type { Activity } from '@shared/types'

const card = (id: string): Activity => ({
  kind: 'notification',
  id,
  priority: 5,
  notification: { app: 'a', summary: id, body: '' },
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('cards expire, holds pause them, release gives a grace period', () => {
  const store = new ActivityStore()
  const t = new TransientCards(store, 6, 1000)
  const gone: string[] = []
  t.onDismiss((id) => gone.push(id))
  t.show(card('a'), 5000)
  t.show(card('b'), 5000)
  t.hold('a', true)
  vi.advanceTimersByTime(6000)
  expect(store.list().map((x) => x.id)).toEqual(['a'])
  t.hold('a', false)
  vi.advanceTimersByTime(999)
  expect(store.has('a')).toBe(true)
  vi.advanceTimersByTime(1)
  expect(store.has('a')).toBe(false)
  expect(gone).toEqual(['b', 'a'])
})

test('re-showing restarts the timer; dismissIn overrides it', () => {
  const store = new ActivityStore()
  const t = new TransientCards(store)
  t.show(card('a'), 5000)
  vi.advanceTimersByTime(4000)
  t.show(card('a'), 5000)
  vi.advanceTimersByTime(4000)
  expect(store.has('a')).toBe(true)
  t.hold('a', true)
  t.dismissIn('a', 500)
  vi.advanceTimersByTime(500)
  expect(store.has('a')).toBe(false)
})

test('queue is capped, oldest unheld cards dropped first', () => {
  const store = new ActivityStore()
  const t = new TransientCards(store, 2)
  t.show(card('a'), 5000)
  t.hold('a', true)
  t.show(card('b'), 5000)
  t.show(card('c'), 5000)
  expect(store.list().map((x) => x.id)).toEqual(['a', 'c'])
})

test('a closing card cannot be held open again (e.g. re-hovered after "Sent")', () => {
  const store = new ActivityStore()
  const t = new TransientCards(store)
  t.show(card('a'), 5000)
  t.hold('a', true)
  t.dismissIn('a', 1500)
  t.hold('a', false)
  t.hold('a', true) // pointer comes back over it
  vi.advanceTimersByTime(1500)
  expect(store.has('a')).toBe(false)
})
