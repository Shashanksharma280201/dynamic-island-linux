import { addAnswer, addTurn, hoursText, parseHistory, recapCard, recapDue, weekBefore, weekOf, weekRange, KEEP_WEEKS, type RecapHistory } from '../shared/recap'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

test('weeks start on Monday', () => {
  expect(weekOf(at(2026, 10, 14))).toBe('2026-10-12') // a Wednesday
  expect(weekOf(at(2026, 10, 12, 0))).toBe('2026-10-12')
  expect(weekOf(at(2026, 10, 18, 23))).toBe('2026-10-12') // Sunday night
  expect(weekBefore('2026-10-12')).toBe('2026-10-05')
  expect(weekRange('2026-09-28')).toBe('Sep 28 to Oct 4')
})

test('turns and answers add up per week', () => {
  let h: RecapHistory = []
  const turn = { session: 's1', agent: 'claude-code', project: 'shop', ms: 20 * 60_000, files: 2, added: 30, removed: 4, commands: 3 }
  h = addTurn(h, { ...turn, at: at(2026, 10, 13) }) // Tuesday
  h = addTurn(h, { ...turn, at: at(2026, 10, 13, 15), ms: 50 * 60_000, project: 'blog' })
  h = addTurn(h, { ...turn, at: at(2026, 10, 15), session: 's2', agent: 'codex', ms: 10 * 60_000 })
  h = addAnswer(h, at(2026, 10, 13), 'allow')
  h = addAnswer(h, at(2026, 10, 13), 'deny')
  h = addAnswer(h, at(2026, 10, 14), 'question')
  expect(h).toHaveLength(1)
  const w = h[0]
  expect([w.turns, w.sessions.length, w.codingMs, w.longestMs, w.files, w.added, w.commands]).toEqual([3, 2, 80 * 60_000, 50 * 60_000, 6, 90, 9])
  const card = recapCard(w, w.week, (a) => (a === 'claude-code' ? 'Claude Code' : a))
  expect(card.chips[0]).toEqual({ value: '1 h 20 min', label: 'with your agents' })
  expect(card.chips[3].value).toBe('+90 −12')
  expect(card.lines).toEqual([
    { label: 'Top agent', value: 'Claude Code' },
    { label: 'Top project', value: 'blog' },
    { label: 'Busiest day', value: 'Tuesday' },
    { label: 'Longest turn', value: '50 min' },
    { label: 'Permissions', value: '1 allowed, 1 denied' },
    { label: 'Questions answered', value: '1' },
  ])
  // Sharing without project names.
  expect(recapCard(w, w.week, (a) => a, true).lines.some((l) => l.label === 'Top project')).toBe(false)
  expect(recapCard(undefined, '2026-10-05', (a) => a).empty).toBe(true)
})

test('only 12 weeks are kept, and a saved file is checked', () => {
  let h: RecapHistory = []
  for (let i = 0; i < 20; i++) h = addAnswer(h, at(2026, 1, 5) + i * 7 * 86_400_000, 'allow')
  expect(h).toHaveLength(KEEP_WEEKS)
  expect(parseHistory([{ week: '2026-10-12', turns: 2, codingMs: -5, agents: { x: 3, y: 'no' }, days: [1, 2] }])[0]).toMatchObject({ turns: 2, codingMs: 0, agents: { x: 3 }, days: [0, 0, 0, 0, 0, 0, 0] })
  expect(parseHistory('nope')).toEqual([])
})

test('the recap shows itself once a week, from Monday 8 am', () => {
  expect(recapDue(at(2026, 10, 12, 7), '2026-10-05')).toBe(false) // too early
  expect(recapDue(at(2026, 10, 12, 9), '2026-10-05')).toBe(true)
  expect(recapDue(at(2026, 10, 12, 9), '2026-10-12')).toBe(false) // already shown
  expect(recapDue(at(2026, 10, 14, 9), '2026-10-05')).toBe(true) // the island wasn't running on Monday
  expect(hoursText(20_000)).toBe('under a minute')
})
