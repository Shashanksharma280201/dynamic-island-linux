import { parseMprisMetadata, pickActivePlayer } from '../electron/providers/media'

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
