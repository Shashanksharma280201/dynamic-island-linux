import {
  parseVolume,
  parseMuted,
  parseWifi,
  parseBluetooth,
  parseBrightness,
} from '../electron/providers/system'

test('parseVolume reads first percentage', () => {
  const out = 'Volume: front-left: 20972 /  32% / -30.30 dB,  front-right: 20972 / 32%'
  expect(parseVolume(out)).toBe(32)
  expect(parseVolume('garbage')).toBeNull()
})

test('parseMuted', () => {
  expect(parseMuted('Mute: yes')).toBe(true)
  expect(parseMuted('Mute: no')).toBe(false)
})

test('parseWifi', () => {
  expect(parseWifi('enabled')).toBe(true)
  expect(parseWifi('disabled')).toBe(false)
})

test('parseBluetooth reads Powered', () => {
  expect(parseBluetooth('\tPowered: yes')).toBe(true)
  expect(parseBluetooth('\tPowered: no')).toBe(false)
})

test('parseBrightness reads gdbus variant', () => {
  expect(parseBrightness('(<35>,)')).toBe(35)
  expect(parseBrightness('nope')).toBeNull()
})
