import { parseMprisMetadata, pickActivePlayer, usToSec, mediaKey, nextLoop, parseLoop } from '../electron/providers/media'

test('pickActivePlayer prefers a Playing player', () => {
  expect(
    pickActivePlayer([
      { name: 'org.mpris.MediaPlayer2.vlc', status: 'Paused' },
      { name: 'org.mpris.MediaPlayer2.chromium.instance1', status: 'Playing' },
    ]),
  ).toBe('org.mpris.MediaPlayer2.chromium.instance1')
})

test('pickActivePlayer falls back to Paused, then any', () => {
  expect(
    pickActivePlayer([{ name: 'org.mpris.MediaPlayer2.vlc', status: 'Paused' }]),
  ).toBe('org.mpris.MediaPlayer2.vlc')
  expect(
    pickActivePlayer([{ name: 'org.mpris.MediaPlayer2.x', status: 'Stopped' }]),
  ).toBe('org.mpris.MediaPlayer2.x')
})

test('pickActivePlayer skips playerctld and returns null when empty', () => {
  expect(pickActivePlayer([])).toBeNull()
  expect(
    pickActivePlayer([
      { name: 'org.mpris.MediaPlayer2.playerctld', status: 'Playing' },
      { name: 'org.mpris.MediaPlayer2.vlc', status: 'Paused' },
    ]),
  ).toBe('org.mpris.MediaPlayer2.vlc')
})

test('parses MPRIS metadata variant map', () => {
  const meta = {
    'xesam:title': { value: 'Bohemian Rhapsody' },
    'xesam:artist': { value: ['Queen'] },
    'mpris:artUrl': { value: 'file:///art.png' },
  }
  const s = parseMprisMetadata(meta as any, 'Playing', true)
  expect(s).toEqual({
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    artUrl: 'file:///art.png',
    playing: true,
    canControl: true,
  })
})

test('handles missing fields and paused status', () => {
  const s = parseMprisMetadata({} as any, 'Paused', false)
  expect(s.title).toBe('Unknown')
  expect(s.artist).toBe('')
  expect(s.playing).toBe(false)
})

test('parses mpris:length (bigint microseconds) into seconds', () => {
  const s = parseMprisMetadata({ 'mpris:length': { value: 215_000_000n } } as any, 'Playing', true)
  expect(s.length).toBe(215)
})

test('usToSec ignores invalid values', () => {
  expect(usToSec(undefined)).toBeUndefined()
  expect(usToSec(0)).toBeUndefined()
  expect(usToSec(1_500_000)).toBe(1.5)
})

test('mediaKey ignores position but tracks play state', () => {
  const a = parseMprisMetadata({} as any, 'Playing', true)
  expect(mediaKey({ ...a, position: 1 })).toBe(mediaKey({ ...a, position: 99 }))
  expect(mediaKey(a)).not.toBe(mediaKey({ ...a, playing: false }))
  expect(mediaKey(null)).toBe('null')
})

test('parses mpris:trackid', () => {
  const s = parseMprisMetadata({ 'mpris:trackid': { value: '/org/x/1' } } as any, 'Playing', true)
  expect(s.trackId).toBe('/org/x/1')
})

test('nextLoop cycles off → all → one → off', () => {
  expect(nextLoop(undefined)).toBe('Playlist')
  expect(nextLoop('None')).toBe('Playlist')
  expect(nextLoop('Playlist')).toBe('Track')
  expect(nextLoop('Track')).toBe('None')
  expect(parseLoop('Track')).toBe('Track')
  expect(parseLoop('bogus')).toBeUndefined()
})
