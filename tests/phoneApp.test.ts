import { helloUrls, mergeUrls, neighbours, routeName, routeOf } from '../mobile/src/protocol'
import { linkMode, linkReadout, linkStatus } from '../mobile/src/linkStatus'
import { CORAL, DARK, LIGHT, cleanColor, luminance, mix, paletteFor, seen, withAccent } from '../mobile/src/ui/palette'
import { FONT, fitSize, fontOf } from '../mobile/src/ui/font'
import { TABS, TAB_SIZE, tabCenterX } from '../mobile/src/ui/tabs'
import { DAY_ROWS, dayColumns, dayPeaks } from '../mobile/src/dayChart'
import { arcOf, arcPath, arcPoint, arcValue } from '../mobile/src/dial'
import { cleanPrefs } from '../mobile/src/prefsShape'
import { answerLine, clock, money } from '../mobile/src/words'
import { metaText, moneyText } from '@shared/engine'
import { clockTime } from '@shared/format'
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
    expect(cleanPrefs({ background: false, computerNotes: true, theme: 'light' })).toEqual({ background: false, computerNotes: true, theme: 'light', accent: null })
    expect(cleanPrefs({ theme: 'purple' }).theme).toBe('system')
    expect(cleanPrefs(null)).toEqual({ background: true, computerNotes: false, theme: 'system', accent: null })
    // The orb's colour as last seen: kept when it's a colour, dropped when it isn't.
    expect(cleanPrefs({ accent: '#4DA3FF' }).accent).toBe('#4da3ff')
    expect(cleanPrefs({ accent: 'blue' }).accent).toBeNull()
    expect(cleanPrefs({ accent: '#fff' }).accent).toBeNull()
  })
})

describe('the app says times and costs as the island does', () => {
  test('its own copies match the island’s', () => {
    for (const usd of [null, 0, 0.00001, 0.004, 0.012, 0.31, 2]) expect(money(usd)).toBe(moneyText(usd))
    for (const at of [0, Date.UTC(2026, 10, 8, 9, 5), Date.UTC(2026, 10, 8, 23, 59)]) expect(clock(at)).toBe(clockTime(at))
    const meta = { where: 'local' as const, label: 'llama3.2', model: 'llama3.2', ms: 1420, usage: null, cost: 0 }
    expect(answerLine(meta)).toBe(metaText(meta))
    const cloud = { ...meta, where: 'cloud' as const, label: 'Claude', ms: 300, cost: 0.004 }
    expect(answerLine(cloud)).toBe(metaText(cloud))
  })
})

describe('the look: one accent, one typeface', () => {
  test('the accent is coral until the orb has another colour, then that colour and its lighter steps', () => {
    // Nothing known yet, Orbit's own colour, or coral itself: the palette as it is.
    expect(withAccent(LIGHT, null)).toBe(LIGHT)
    expect(withAccent(LIGHT, '#ff8a65')).toBe(LIGHT)
    expect(withAccent(DARK, CORAL)).toBe(DARK)
    expect(withAccent(LIGHT, 'not a colour')).toBe(LIGHT)
    expect(LIGHT.accent).toBe(CORAL)
    expect(DARK.primary).toBe(CORAL)
    // Bolt's blue: the accent, the strongest button, and two steps toward the page.
    const blue = withAccent(LIGHT, '#4da3ff')
    expect(blue.accent).toBe('#4da3ff')
    expect(blue.primary).toBe('#4da3ff')
    expect(blue.onPrimary).toBe('#ffffff')
    expect(luminance(blue.accentMid)).toBeGreaterThan(luminance(blue.accent))
    expect(luminance(blue.accentPale)).toBeGreaterThan(luminance(blue.accentMid))
    expect(blue.bg).toBe(LIGHT.bg)
    // On a dark page the steps go down toward it, not up.
    const night = withAccent(DARK, '#4da3ff')
    expect(luminance(night.accentPale)).toBeLessThan(luminance(night.accentMid))
    expect(luminance(night.accentMid)).toBeLessThan(luminance(night.accent))
    // The same colour gives the same palette object (styles are made once for it).
    expect(withAccent(LIGHT, '#4DA3FF')).toBe(blue)
    expect(withAccent(DARK, '#4da3ff')).not.toBe(blue)
  })
  test('a colour too pale or too dark to see is brought back, and written on in what shows', () => {
    // White on a light page, black on a dark one: still an accent you can see.
    expect(luminance(withAccent(LIGHT, '#ffffff').accent)).toBeLessThan(0.63)
    expect(luminance(withAccent(DARK, '#000000').accent)).toBeGreaterThan(0.15)
    // A colour that's fine is left alone.
    expect(seen('#fa7455', false)).toBe('#fa7455')
    expect(seen('#fa7455', true)).toBe('#fa7455')
    // A light accent takes dark words, a deep one white.
    expect(withAccent(LIGHT, '#ffd60a').onPrimary).toBe('#1d1d1d')
    expect(withAccent(LIGHT, '#5e5ce6').onPrimary).toBe('#ffffff')
  })
  test('mixing and cleaning colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(cleanColor('#ABCDEF')).toBe('#abcdef')
    expect(cleanColor('#abc')).toBeNull()
    expect(cleanColor(12)).toBeNull()
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
    expect(luminance('#000000')).toBe(0)
  })
  test('a weight becomes a family, a step lighter than written', () => {
    expect(fontOf(undefined)).toBe(FONT.regular)
    expect(fontOf('400')).toBe(FONT.regular)
    expect(fontOf('normal')).toBe(FONT.regular)
    expect(fontOf('500')).toBe(FONT.medium)
    expect(fontOf('600')).toBe(FONT.medium)
    expect(fontOf(700)).toBe(FONT.semibold)
    expect(fontOf('bold')).toBe(FONT.semibold)
    expect(fontOf('800')).toBe(FONT.semibold)
    expect(fontOf('odd')).toBe(FONT.regular)
  })
  test('a long figure is set smaller, never below the least', () => {
    expect(fitSize('+₹1,240', 135, 30)).toBe(30)
    expect(fitSize('+₹12,41,240.50', 135, 30)).toBeLessThan(20)
    expect(fitSize('+₹12,41,240.50', 135, 30)).toBeGreaterThanOrEqual(14)
    expect(fitSize('1'.repeat(60), 135, 30)).toBe(14)
    // Not measured yet: the size it would like.
    expect(fitSize('+₹1,240', 0, 30)).toBe(30)
  })
  test('the tabs sit side by side in the middle of the screen', () => {
    expect(TABS).toEqual(['island', 'claude', 'files', 'inbox', 'more'])
    expect(tabCenterX(400, 'files')).toBe(200)
    expect(tabCenterX(400, 'island')).toBe(200 - 2 * TAB_SIZE)
    expect(tabCenterX(400, 'more')).toBe(200 + 2 * TAB_SIZE)
    expect(tabCenterX(360, 'inbox') - tabCenterX(360, 'files')).toBe(TAB_SIZE)
  })
})

describe('the day by the hour', () => {
  test('a column for each hour of the working day, taller for busier hours', () => {
    const cols = dayColumns([{ hour: 10, count: 2 }, { hour: 14, count: 5 }], 15)
    expect(cols[0].hour).toBe(9)
    expect(cols[cols.length - 1].hour).toBe(18)
    expect(cols.find((c) => c.hour === 10)).toEqual({ hour: 10, count: 2, cells: 2 })
    expect(cols.find((c) => c.hour === 14)).toEqual({ hour: 14, count: 5, cells: 5 })
    expect(cols.find((c) => c.hour === 11)).toEqual({ hour: 11, count: 0, cells: 0 })
  })
  test('an early start or a late night widens it, and it never stops short of now', () => {
    const cols = dayColumns([{ hour: 6, count: 1 }, { hour: 22, count: 1 }], 12)
    expect(cols[0].hour).toBe(6)
    expect(cols[cols.length - 1].hour).toBe(22)
    expect(dayColumns([], 23).at(-1)!.hour).toBe(23)
    expect(dayColumns([], 3)[0].hour).toBe(3)
    // Hours that can't be are left out; the same hour twice is added up.
    const odd = dayColumns([{ hour: 30, count: 4 }, { hour: -1, count: 4 }, { hour: 10, count: 1 }, { hour: 10, count: 2 }], 12)
    expect(odd.reduce((n, c) => n + c.count, 0)).toBe(3)
  })
  test('on a full day each square stands for a few things, and no column is taller than the chart', () => {
    const cols = dayColumns([{ hour: 10, count: 23 }, { hour: 11, count: 2 }, { hour: 12, count: 1 }], 15)
    expect(Math.max(...cols.map((c) => c.cells))).toBeLessThanOrEqual(DAY_ROWS)
    // Something happened: at least one square, however small beside the busiest hour.
    expect(cols.find((c) => c.hour === 12)!.cells).toBe(1)
    expect(cols.find((c) => c.hour === 10)!.count).toBe(23)
  })
  test('the busiest hours are named: clear of taller neighbours, and of each other', () => {
    const cols = dayColumns(
      [9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour, i) => ({ hour, count: [2, 1, 3, 5, 4, 2, 5, 6, 3][i] })),
      17,
    )
    const peaks = dayPeaks(cols, 2)
    expect(peaks.map((i) => cols[i].hour)).toEqual([12, 16])
    for (const i of peaks) for (const o of cols.slice(Math.max(0, i - 2), i + 3)) expect(o.cells).toBeLessThanOrEqual(cols[i].cells)
    // Never more than three, never an empty hour, in the day's order.
    const many = dayColumns(Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour % 4 === 0 ? 5 : 1 })), 23)
    const named = dayPeaks(many, 1)
    expect(named.length).toBe(3)
    expect([...named].sort((a, b) => a - b)).toEqual(named)
    expect(dayPeaks(dayColumns([], 12), 2)).toEqual([])
  })
})

describe('the volume dial', () => {
  const arc = arcOf(300, 14, 44, 30)
  test('a shallow bow across the card: its ends level, its top in the middle', () => {
    const left = arcPoint(arc, 0)
    const right = arcPoint(arc, 1)
    const top = arcPoint(arc, 0.5)
    expect(left.x).toBeCloseTo(14, 3)
    expect(right.x).toBeCloseTo(286, 3)
    expect(left.y).toBeCloseTo(right.y, 6)
    expect(top.x).toBeCloseTo(150, 6)
    expect(top.y).toBeCloseTo(30, 6)
    // It rises as much as it was asked to.
    expect(left.y - top.y).toBeCloseTo(44, 3)
    // A tick sits beyond the bow, on the same line out from its middle.
    const out = arcPoint(arc, 0.5, 10)
    expect(out.y).toBeCloseTo(20, 6)
  })
  test('a finger along it gives the level, held at the ends', () => {
    for (const t of [0, 0.1, 0.37, 0.5, 0.8, 1]) expect(arcValue(arc, arcPoint(arc, t).x)).toBeCloseTo(t, 6)
    expect(arcValue(arc, -50)).toBe(0)
    expect(arcValue(arc, 900)).toBe(1)
    // Levels outside 0 to 1 are drawn at the ends.
    expect(arcPoint(arc, -1)).toEqual(arcPoint(arc, 0))
    expect(arcPoint(arc, 2)).toEqual(arcPoint(arc, 1))
  })
  test('the bow as a path, and a space too small to draw one in', () => {
    expect(arcPath(arc, 0, 1)).toMatch(/^M14 74A[\d.]+ [\d.]+ 0 0 1 286 74$/)
    const tiny = arcOf(1, 14, 44, 30)
    expect(Number.isFinite(tiny.r)).toBe(true)
    expect(Number.isFinite(arcPoint(tiny, 0.5).y)).toBe(true)
    expect(Number.isFinite(arcValue(tiny, 0))).toBe(true)
  })
})
