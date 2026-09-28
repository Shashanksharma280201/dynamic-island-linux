import { mapTrack, mapPlaylist, mapAlbum, mapPlayer, pickImage, recentContexts, progressNow, msText, greeting, LIKED } from '../shared/spotify'

const img = (w: number) => ({ url: `u${w}`, width: w, height: w })
const TRACK = {
  uri: 'spotify:track:1',
  name: 'Blinding Lights',
  artists: [{ name: 'The Weeknd' }],
  album: { name: 'After Hours', uri: 'spotify:album:a1', images: [img(640), img(300), img(64)] },
  duration_ms: 200040,
  explicit: false,
}

test('tracks, playlists, albums', () => {
  expect(mapTrack(TRACK)).toEqual({ uri: 'spotify:track:1', name: 'Blinding Lights', artists: 'The Weeknd', album: 'After Hours', albumUri: 'spotify:album:a1', image: 'u64', art: 'u300', durationMs: 200040, explicit: undefined })
  expect(mapTrack({ uri: 'x' })).toBeNull()
  expect(mapTrack(null)).toBeNull()
  // Feb 2026 renamed playlist "tracks" to "items"; old shape still read
  const mine = mapPlaylist({ uri: 'spotify:playlist:p1', name: 'Mix', owner: { id: 'me', display_name: 'Me' }, items: { total: 12 }, images: [img(640)] }, 'me')
  expect(mine).toMatchObject({ kind: 'playlist', subtitle: 'Playlist · Me', listable: true, total: 12, image: 'u640' })
  const followed = mapPlaylist({ uri: 'spotify:playlist:p2', name: 'Top 50', owner: { id: 'spotify', display_name: 'Spotify' }, tracks: { total: 50 } }, 'me')
  expect(followed).toMatchObject({ listable: false, total: 50 })
  expect(mapAlbum({ uri: 'spotify:album:a1', name: 'After Hours', album_type: 'album', artists: [{ name: 'The Weeknd' }] })?.subtitle).toBe('Album · The Weeknd')
})

test('images: smallest that is big enough', () => {
  expect(pickImage([img(640), img(300), img(64)])).toBe('u300')
  expect(pickImage([img(640), img(300), img(64)], 64)).toBe('u64')
  expect(pickImage([img(100)])).toBe('u100')
  expect(pickImage([{ url: 'x' }])).toBe('x')
  expect(pickImage([])).toBeUndefined()
})

test('player state and progress', () => {
  const p = mapPlayer({ is_playing: true, item: TRACK, progress_ms: 1000, shuffle_state: true, repeat_state: 'context', device: { name: 'Laptop', type: 'Computer', volume_percent: 60 }, context: { uri: 'spotify:playlist:p1' } }, 5000)!
  expect(p).toMatchObject({ isPlaying: true, shuffle: true, repeat: 'context', device: { name: 'Laptop', volume: 60 }, contextUri: 'spotify:playlist:p1' })
  expect(progressNow(p, 8000)).toBe(4000)
  expect(progressNow({ ...p, isPlaying: false }, 8000)).toBe(1000)
  expect(progressNow(p, 10_000_000)).toBe(200040)
  expect(mapPlayer(null, 1)).toBeNull()
  expect(msText(187000)).toBe('3:07')
})

test('jump back in: recent playlists and albums, no repeats', () => {
  const mix = mapPlaylist({ uri: 'spotify:playlist:p1', name: 'Mix', owner: { id: 'me' } }, 'me')!
  const items = [
    { track: TRACK, context: { uri: 'spotify:playlist:p1' } },
    { track: TRACK, context: { uri: 'spotify:playlist:p1' } },
    { track: TRACK, context: null },
    { track: TRACK, context: { uri: 'spotify:playlist:gone' } },
  ]
  const r = recentContexts(items, new Map([[mix.uri, mix]]))
  expect(r.map((c) => c.uri)).toEqual(['spotify:playlist:p1', 'spotify:album:a1'])
  expect(LIKED.kind).toBe('liked')
})

test('greeting', () => {
  expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning')
  expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon')
  expect(greeting(new Date(2026, 0, 1, 21))).toBe('Good evening')
})
