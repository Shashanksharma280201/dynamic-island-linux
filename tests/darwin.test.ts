import { vi } from 'vitest'
vi.mock('electron', () => ({ screen: { getCursorScreenPoint: () => ({ x: 1, y: 2 }) } }))
import { mediaScript, parseAirportPower, parseBrightnessList, parseNowPlaying, parseVolumeSettings, wifiDevice } from '../electron/platform/darwin'

test('macOS: what Spotify and Music are playing, a playing one first', () => {
  const out =
    'Music\tpaused\tClair de Lune\tDebussy\t300,5\t12,25\t\tfalse\toff\n' +
    'Spotify\tplaying\tTidal\tBlue Hour\t215.4\t42.1\thttps://i.scdn.co/image/x\ttrue\ttrue\n'
  const s = parseNowPlaying(out, 1000)!
  expect(s).toMatchObject({ player: 'Spotify', title: 'Tidal', artist: 'Blue Hour', playing: true, length: 215.4, position: 42.1, positionAt: 1000, artUrl: 'https://i.scdn.co/image/x', shuffle: true, loop: 'Playlist' })
  const music = parseNowPlaying(out.split('\n')[0])!
  expect(music).toMatchObject({ player: 'Music', playing: false, length: 300.5, position: 12.25, loop: 'None', shuffle: false })
  expect(music.artUrl).toBeUndefined()
  expect(parseNowPlaying('')).toBeNull()
})

test('macOS: media buttons as AppleScript', () => {
  expect(mediaScript('Spotify', 'playpause')).toBe('tell application "Spotify" to playpause')
  expect(mediaScript('Music', 'next')).toBe('tell application "Music" to next track')
  expect(mediaScript('Spotify', { type: 'seek', position: 61.7 })).toBe('tell application "Spotify" to set player position to 62')
  expect(mediaScript('Music', 'loop', { loop: 'None' } as any)).toBe('tell application "Music" to set song repeat to all')
  expect(mediaScript('Music', 'loop', { loop: 'Playlist' } as any)).toBe('tell application "Music" to set song repeat to one')
  expect(mediaScript('Spotify', 'shuffle')).toBe('tell application "Spotify" to set shuffling to not shuffling')
})

test('macOS: volume, Wi-Fi and brightness readings', () => {
  expect(parseVolumeSettings('62,false\n')).toEqual({ volume: 62, muted: false })
  expect(parseVolumeSettings('missing value,missing value')).toBeNull()
  expect(wifiDevice('Hardware Port: Ethernet\nDevice: en1\n\nHardware Port: Wi-Fi\nDevice: en0\nEthernet Address: x')).toBe('en0')
  expect(parseAirportPower('Wi-Fi Power (en0): On\n')).toBe(true)
  expect(parseAirportPower('Wi-Fi Power (en0): Off')).toBe(false)
  expect(parseBrightnessList('display 0: main, active, awake, online, built-in, ID 0x1\ndisplay 0: brightness 0.750000\n')).toBe(75)
})
