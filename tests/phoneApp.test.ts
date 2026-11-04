import { helloUrls, mergeUrls, neighbours, routeName, routeOf } from '../mobile/src/protocol'
import { linkMode, linkReadout, linkStatus } from '../mobile/src/linkStatus'
import { DARK, LIGHT, paletteFor } from '../mobile/src/ui/palette'
import { cleanPrefs } from '../mobile/src/prefsShape'
import { GAUGE_SCALE, P, VIEW, backParts, capsuleParts, frontParts, needleAngle, needlePath } from '../mobile/src/iso/linkGeometry'


describe('finding the computer', () => {
  test('how an address is reached', () => {
    expect(routeOf('http://192.168.1.20:8790')).toBe('wifi')
    expect(routeOf('http://10.0.0.7:8790')).toBe('wifi')
    expect(routeOf('http://172.20.1.2:8790')).toBe('wifi')
    expect(routeOf('http://100.101.102.103:8790')).toBe('tailscale')
    expect(routeOf('http://laptop.tail1234.ts.net:8790')).toBe('tailscale')
    expect(routeOf('http://203.0.113.7:8790')).toBe('internet')
    expect(routeOf('http://shashank-laptop.local:8790')).toBe('wifi')
    expect(routeName('tailscale')).toBe('Tailscale')
  })

  test('the rest of this Wi-Fi, nearest first, never itself or outside it', () => {
    const n = neighbours('192.168.1.37')
    expect(n.slice(0, 4)).toEqual(['192.168.1.36', '192.168.1.38', '192.168.1.35', '192.168.1.39'])
    expect(n.length).toBe(253)
    expect(n).not.toContain('192.168.1.37')
    expect(n.every((h) => /^192\.168\.1\.(\d+)$/.test(h) && +h.split('.')[3] >= 1 && +h.split('.')[3] <= 254)).toBe(true)
    // Not on a home network (mobile data, Tailscale): nothing to look through.
    expect(neighbours('100.101.102.103')).toEqual([])
    expect(neighbours('not an ip')).toEqual([])
  })

  test('the addresses a computer says it has, kept with the known ones', () => {
    expect(helloUrls({ urls: ['http://192.168.1.21:8790', 'javascript:alert(1)', 5, 'http://100.1.2.3:8790'] })).toEqual(['http://192.168.1.21:8790', 'http://100.1.2.3:8790'])
    expect(helloUrls({})).toEqual([])
    expect(mergeUrls(['http://b', 'http://a'], ['http://a', 'http://c'])).toEqual(['http://b', 'http://a', 'http://c'])
    expect(mergeUrls(Array.from({ length: 12 }, (_, i) => `http://h${i}`), []).length).toBe(8)
  })
})

describe('what the link figure shows', () => {
  const ready = { phase: 'ready' as const, url: 'http://192.168.1.20:8790', route: 'wifi' as const, ms: 14 }
  const live = { phase: 'live' as const, seenAt: 0 }
  test('its mode', () => {
    expect(linkMode(ready, live, null)).toBe('live')
    expect(linkMode({ phase: 'finding' }, { phase: 'off' }, null)).toBe('searching')
    expect(linkMode({ phase: 'offline' }, { phase: 'offline' }, null)).toBe('offline')
    expect(linkMode(ready, { phase: 'connecting' }, null)).toBe('searching')
    expect(linkMode(ready, live, { kind: 'sending', label: 'a.jpg', progress: 0.4 })).toBe('sending')
    expect(linkMode({ phase: 'offline' }, live, { kind: 'receiving', label: 'b', progress: 0 })).toBe('receiving')
  })
  test('its readout and the status line', () => {
    expect(linkReadout('live', ready, live, null)).toBe('Wi-Fi · 14 ms')
    expect(linkReadout('live', { ...ready, route: 'tailscale', ms: 120 }, live, null)).toBe('Tailscale · 120 ms')
    expect(linkReadout('searching', { phase: 'finding', scanning: true }, live, null)).toBe('Searching this Wi-Fi…')
    expect(linkReadout('offline', { phase: 'offline' }, { phase: 'offline', seenAt: 1000 }, null, 1000 + 3 * 60_000)).toBe('Offline · seen 3m')
    expect(linkReadout('sending', ready, live, { kind: 'sending', label: 'Holiday · 3 files', progress: 0.42 })).toBe('Holiday · 3 files · 42%')
    expect(linkReadout('receiving', ready, live, { kind: 'receiving', label: 'A very long folder name indeed', progress: 1 })).toBe('A very long folder na… · 100%')
    expect(linkStatus('live')).toBe('Connected')
    expect(linkStatus('offline')).toBe('Can’t reach it')
  })
})

describe('the link figure', () => {
  test('the gauge reads 0 to 300 ms over its sweep, and no further', () => {
    expect(needleAngle(0)).toBeCloseTo(GAUGE_SCALE.from)
    expect(needleAngle(300)).toBeCloseTo(GAUGE_SCALE.from + GAUGE_SCALE.sweep)
    expect(needleAngle(10_000)).toBeCloseTo(needleAngle(300))
    expect(needleAngle(-5)).toBeCloseTo(needleAngle(0))
    expect(needlePath(0, [10, 10], [1, 0], [0, 1], 5, 2)).toBe('M8.00 10.00L15.00 10.00')
  })

  test('everything it draws fits in its box', () => {
    const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    const all: string[] = []
    for (const p of [...backParts(), ...frontParts(), ...capsuleParts().body]) {
      if (p.kind === 'solid') all.push(p.paths.fill, p.paths.top, p.paths.outline)
      else if (p.kind === 'line' || p.kind === 'fill') all.push(p.d)
    }
    const xs: number[] = []
    const ys: number[] = []
    for (const d of all) numbers(d).forEach((n, i) => (i % 2 ? ys : xs).push(n))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(VIEW.width)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(VIEW.height)
    expect(P.scale).toBeGreaterThan(0.5)
  })
})

describe('light and dark', () => {
  test('the choice, and the phone’s own setting for System', () => {
    expect(paletteFor('light', 'dark')).toBe(LIGHT)
    expect(paletteFor('dark', 'light')).toBe(DARK)
    expect(paletteFor('system', 'light')).toBe(LIGHT)
    expect(paletteFor('system', 'dark')).toBe(DARK)
    expect(paletteFor('system', null)).toBe(DARK)
  })
  test('both palettes have every colour', () => {
    expect(Object.keys(LIGHT).sort()).toEqual(Object.keys(DARK).sort())
    expect(Object.keys(LIGHT.iso).sort()).toEqual(Object.keys(DARK.iso).sort())
  })
  test('a saved choice is kept, anything odd goes back to System', () => {
    expect(cleanPrefs({ background: false, computerNotes: true, theme: 'light' })).toEqual({ background: false, computerNotes: true, theme: 'light' })
    expect(cleanPrefs({ theme: 'purple' }).theme).toBe('system')
    expect(cleanPrefs(null)).toEqual({ background: true, computerNotes: false, theme: 'system' })
  })
})
