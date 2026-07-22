import { ActivityStore } from '../electron/store'
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

test('presented() returns highest priority activity', () => {
  const s = new ActivityStore()
  s.upsert(media)
  s.upsert(approval)
  expect(s.presented()?.id).toBe('a1')
  s.remove('a1')
  expect(s.presented()?.id).toBe('m1')
})

test('onChange fires on upsert and remove', () => {
  const s = new ActivityStore()
  let n = 0
  s.onChange(() => {
    n++
  })
  s.upsert(media)
  s.remove('m1')
  expect(n).toBe(2)
})

test('upsert replaces same id', () => {
  const s = new ActivityStore()
  s.upsert(media)
  s.upsert({ ...media, media: { ...media.media, title: 'New' } })
  expect(s.list().length).toBe(1)
  expect(s.list()[0].kind === 'media' && s.list()[0].media.title).toBe('New')
})
