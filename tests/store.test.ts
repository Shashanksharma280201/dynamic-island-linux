import { ActivityStore } from '../electron/store'
import { present } from '../shared/present'
import type { Activity } from '@shared/types'

const media: Activity = {
  kind: 'media',
  id: 'm1',
  priority: 1,
  media: { title: 'Song', artist: 'Artist', playing: true, canControl: true },
}
const approval: Activity = {
  kind: 'approval',
  id: 'a1',
  priority: 10,
  request: { id: 'a1', toolName: 'Bash', inputSummary: 'rm -rf' },
}

const shown = (s: ActivityStore) => {
  const p = present(s.list(), { expanded: false })
  return p.mode === 'idle' ? null : p.primary.id
}

test('highest priority activity is presented', () => {
  const s = new ActivityStore()
  s.upsert(media)
  s.upsert(approval)
  expect(shown(s)).toBe('a1')
  s.remove('a1')
  expect(shown(s)).toBe('m1')
})

test('onChange fires on upsert and remove', () => {
  const s = new ActivityStore()
  let n = 0
  s.onChange(() => {
    n++
  })
  s.upsert(media)
  s.remove('m1')
  s.remove('missing') // no-op, no event
  expect(n).toBe(2)
})

test('upsert replaces same id and keeps its place in line', () => {
  const s = new ActivityStore()
  s.upsert(media)
  s.upsert({ ...media, id: 'm2' })
  s.upsert({ ...media, media: { ...media.media, title: 'New' } })
  expect(s.list().length).toBe(2)
  const first = s.list()[0]
  expect(first.kind === 'media' && first.media.title).toBe('New')
  expect(first.seq).toBeLessThan(s.list()[1].seq!)
  expect(shown(s)).toBe('m2') // newest ambient activity wins the tie
})
