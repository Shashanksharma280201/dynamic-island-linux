import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appsText, buildEvening, dayKey, digestDue, eveningTitle, keepForDigest, parseDigestState, type DigestItem } from '../shared/digest'
import { ALERT_DEFAULTS, alertDecision } from '../shared/jarvis'
import { parseBuddyConfig } from '../shared/buddy'
import type { CenterEntry } from '../shared/notifCenter'
import { Digest } from '../electron/digest'
import { Announcer } from '../electron/announcer'

const at = (h: number, m = 0, day = 8) => new Date(2026, 10, day, h, m).getTime()
const entry = (o: Partial<CenterEntry> & { app: string; at: number }): CenterEntry => ({ id: `${o.app}-${o.at}`, source: 'notification', title: 't', count: 1, seen: false, ...o })
const item = (o: Partial<DigestItem> & { at: number }): DigestItem => ({ key: `k${o.at}`, kind: 'session-waiting', line: 'Claude Code in shop is waiting for you.', why: 'quiet-hours', ...o })

test('why something wasn’t said', () => {
  const base = { key: 'a', kind: 'session-waiting', config: ALERT_DEFAULTS, spoken: {}, dismissed: {} }
  expect(alertDecision({ ...base, priority: 'high', now: at(12) })).toEqual({ way: 'speak', why: null })
  expect(alertDecision({ ...base, priority: 'high', now: at(23) })).toEqual({ way: 'show', why: 'quiet-hours' })
  expect(alertDecision({ ...base, priority: 'high', now: at(12), config: { ...ALERT_DEFAULTS, speak: false } }).why).toBe('muted')
  expect(alertDecision({ ...base, priority: 'high', now: at(12), dismissed: { 'session-waiting': 3 } }).why).toBe('dismissed')
  expect(alertDecision({ ...base, priority: 'high', now: at(12), spoken: { a: at(9) } }).why).toBe('repeat')
  expect(alertDecision({ ...base, priority: 'high', now: at(12), key: 'b', spoken: { a: at(11, 30), c: at(11, 31), d: at(11, 32), e: at(11, 33) } }).why).toBe('limit')
  expect(alertDecision({ ...base, priority: 'low', now: at(12) })).toEqual({ way: 'digest', why: 'low' })
  // Quiet hours you set.
  expect(alertDecision({ ...base, priority: 'high', now: at(13), config: { ...ALERT_DEFAULTS, quietFrom: 12, quietTo: 14 } }).why).toBe('quiet-hours')
  expect(alertDecision({ ...base, priority: 'high', now: at(23), config: { ...ALERT_DEFAULTS, quietFrom: 0, quietTo: 0 } }).way).toBe('speak')
})

test('what goes in the digest', () => {
  expect(keepForDigest('session-waiting', 'quiet-hours')).toBe(true)
  expect(keepForDigest('task-done', 'limit')).toBe(true)
  expect(keepForDigest('job', 'low')).toBe(true)
  // Answered at the time, already said, or shown anyway.
  expect(keepForDigest('approval', 'quiet-hours')).toBe(false)
  expect(keepForDigest('task-done', 'repeat')).toBe(false)
  expect(keepForDigest('x', 'medium')).toBe(false)
  expect(keepForDigest('x', null)).toBe(false)
})

test('when it’s due', () => {
  expect(digestDue(at(17, 59), 18, 0)).toBe(false)
  expect(digestDue(at(18), 18, 0)).toBe(true)
  expect(digestDue(at(21), 18, 0)).toBe(true) // asleep at 18:00: as soon as it wakes
  expect(digestDue(at(21), 18, at(18, 5))).toBe(false) // shown today already
  expect(digestDue(at(18, 1), 18, at(18, 5, 7))).toBe(true) // yesterday's doesn't count
  expect(dayKey(at(9))).toBe('2026-11-08')
})

test('the card: what was kept, and the notifications you didn’t get to', () => {
  const since = at(18, 0, 7)
  const items = [
    item({ at: at(23, 10, 7), line: 'Claude Code in shop is waiting for you.' }),
    item({ at: at(9), key: 'job:Commits', kind: 'job', line: 'Commits: 4 commits filed.', why: 'low' }),
    item({ at: at(10), key: 'job:Commits', kind: 'job', line: 'Commits: 5 commits filed.', why: 'low' }),
    item({ at: at(17, 0, 7), line: 'Before the last digest' }),
  ]
  const entries = [
    entry({ app: 'Slack', at: at(11), count: 3 }),
    entry({ app: 'Mail', at: at(12) }),
    entry({ app: 'Slack', at: at(13) }),
    entry({ app: 'Seen', at: at(13), seen: true }),
    entry({ app: 'Old', at: at(12, 0, 7) }),
  ]
  const c = buildEvening({ now: at(18), since, items, entries })!
  expect(c.kept.map((k) => k.line)).toEqual(['Commits: 5 commits filed.', 'Claude Code in shop is waiting for you.'])
  expect(c.kept[1].why).toBe('quiet hours')
  expect(c.apps).toEqual([
    { app: 'Slack', count: 4 },
    { app: 'Mail', count: 1 },
  ])
  expect(c.notifications).toBe(5)
  expect(eveningTitle(c)).toBe('2 things kept quiet, 5 notifications')
  expect(appsText(c.apps)).toBe('Slack 4 and Mail 1')
  expect(appsText([{ app: 'A', count: 3 }, { app: 'B', count: 2 }, { app: 'C', count: 1 }, { app: 'D', count: 1 }, { app: 'E', count: 1 }])).toBe('A 3, B 2, C 1 and 2 more apps')
  // Nothing to tell: no card.
  expect(buildEvening({ now: at(18), since, items: [], entries: [] })).toBeNull()
  // Many: the newest five, and how many more.
  const lots = Array.from({ length: 8 }, (_, i) => item({ at: at(9 + i) }))
  const big = buildEvening({ now: at(18), since, items: lots, entries: [] })!
  expect(big.kept).toHaveLength(5)
  expect(big.more).toBe(3)
  expect(eveningTitle(big)).toBe('8 things kept quiet')
})

test('a saved state is checked, and old things dropped', () => {
  const now = at(18)
  const s = parseDigestState(
    {
      items: [item({ at: at(9) }), item({ at: at(9, 0, 5) }), { at: 'x' }, { ...item({ at: at(10) }), why: 'shouting' }],
      lastShown: at(18, 0, 7),
      card: { date: '2026-11-07', kept: [], apps: [], state: 'new' },
    },
    now,
  )
  expect(s.items).toHaveLength(1)
  expect(s.lastShown).toBe(at(18, 0, 7))
  expect(s.card).toBeNull() // yesterday's
  expect(parseDigestState(null, now)).toEqual({ items: [], lastShown: 0, card: null })
})

test('the digest keeps what wasn’t said and shows it once, at its hour', () => {
  const dir = mkdtempSync(join(tmpdir(), 'digest-'))
  let now = at(14)
  let entries: CenterEntry[] = []
  const cards: (string | null)[] = []
  const d = new Digest({ file: join(dir, 'digest.json'), config: () => ({ on: true, at: 18 }), entries: () => entries, onCard: (c) => cards.push(c ? c.date : null), now: () => now })
  const said: string[] = []
  const a = new Announcer({ config: () => ALERT_DEFAULTS, say: (l) => said.push(l), kept: (i) => d.add(i), now: () => now })
  // Said now: not kept.
  expect(a.event({ key: 'w1', kind: 'session-waiting', priority: 'high', line: 'Waiting.' })).toBe('speak')
  // Not urgent: kept.
  a.event({ key: 'job:Commits', kind: 'job', priority: 'low', line: 'Commits: 2 filed.' })
  // Early morning is quiet hours. An approval then is answered at the time, not kept.
  now = at(6)
  a.event({ key: 'ap', kind: 'approval', priority: 'high', line: 'Allow?' })
  a.event({ key: 'w2', kind: 'session-waiting', priority: 'high', line: 'Claude Code in api is waiting for you.' })
  expect(said).toEqual(['Waiting.'])
  entries = [entry({ app: 'Slack', at: at(15) })]
  now = at(17)
  d.tick()
  expect(cards).toEqual([])
  now = at(18, 1)
  d.tick()
  expect(cards).toEqual(['2026-11-08'])
  const c = d.card()!
  expect(c.kept.map((k) => k.line)).toEqual(['Commits: 2 filed.', 'Claude Code in api is waiting for you.'])
  expect(c.notifications).toBe(1)
  // Once a day.
  d.tick()
  expect(cards).toHaveLength(1)
  // Kept on disk: a restart brings back today's card until you read it.
  const again = new Digest({ file: join(dir, 'digest.json'), config: () => ({ on: true, at: 18 }), entries: () => entries, onCard: () => {}, now: () => now })
  expect(again.card()?.kept).toHaveLength(2)
  again.done()
  expect(again.card()).toBeNull()
  expect(JSON.parse(readFileSync(join(dir, 'digest.json'), 'utf8')).card.state).toBe('done')
  // Off: nothing shown.
  const off = new Digest({ file: join(dir, 'off.json'), config: () => ({ on: false, at: 18 }), entries: () => entries, onCard: (c) => cards.push(c ? 'off' : null), now: () => now })
  off.add(item({ at: at(17) }))
  expect(cards).toHaveLength(1)
})

test('quiet hours and the digest in the buddy’s settings', () => {
  const c = parseBuddyConfig({ quietFrom: 23, quietTo: 7, digest: false, digestAt: 20 })
  expect([c.quietFrom, c.quietTo, c.digest, c.digestAt]).toEqual([23, 7, false, 20])
  const d = parseBuddyConfig({ quietFrom: 24, quietTo: -1, digestAt: 1.5 })
  expect([d.quietFrom, d.quietTo, d.digest, d.digestAt]).toEqual([22, 8, true, 18])
})
