import {
  parseVolume,
  parseMuted,
  parseWifi,
  parseBluetooth,
  parseBrightness,
  parseBrightnessctl,
  clampPct,
  CommandQueue,
} from '../electron/providers/system'
import type { SysCmd } from '@shared/types'

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
  expect(parseWifi('enabled\n')).toBe(true)
  expect(parseWifi('disabled\n')).toBe(false)
  expect(parseWifi('Error: NetworkManager is not running.')).toBeNull()
})

test('parseBluetooth reads Powered, null without a controller', () => {
  expect(parseBluetooth('\tPowered: yes')).toBe(true)
  expect(parseBluetooth('\tPowered: no')).toBe(false)
  expect(parseBluetooth('No default controller available')).toBeNull()
})

test('parseBrightness reads gdbus variant, -1 means unsupported', () => {
  expect(parseBrightness('(<35>,)')).toBe(35)
  expect(parseBrightness('(<-1>,)')).toBeNull()
  expect(parseBrightness('nope')).toBeNull()
})

test('parseBrightnessctl reads machine output', () => {
  expect(parseBrightnessctl('intel_backlight,backlight,480,40%,1200\n')).toBe(40)
  expect(parseBrightnessctl('')).toBeNull()
})

test('clampPct', () => {
  expect(clampPct(150)).toBe(100)
  expect(clampPct(-3)).toBe(0)
  expect(clampPct(0, 1)).toBe(1)
  expect(clampPct(NaN)).toBe(0)
})

test('CommandQueue runs one at a time and keeps only the latest per type', async () => {
  const ran: SysCmd[] = []
  let release!: () => void
  let idle = 0
  const q = new CommandQueue(
    (c) => {
      ran.push(c)
      return ran.length === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve()
    },
    () => idle++,
  )
  q.push({ type: 'volume', value: 10 })
  q.push({ type: 'volume', value: 20 })
  q.push({ type: 'volume', value: 30 })
  q.push({ type: 'wifi', value: false })
  release()
  await new Promise((r) => setTimeout(r, 0))
  expect(ran).toEqual([
    { type: 'volume', value: 10 },
    { type: 'volume', value: 30 },
    { type: 'wifi', value: false },
  ])
  expect(idle).toBe(1)
})
