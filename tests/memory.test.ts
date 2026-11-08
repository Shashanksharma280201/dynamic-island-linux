import { byHour, citedPrompt, fit, messageEntries, pickSources, plainAnswer, readCites, terms, timeRange, type Candidate } from '@shared/memory'

// Sunday 8 November 2026, 15:00 local time.
const now = new Date(2026, 10, 8, 15, 0).getTime()
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()

describe('the day by hour', () => {
  it('groups by hour, oldest first, with screen time as one line', () => {
    const hours = byHour([
      { at: at(8, 11, 30), source: 'mail', title: 'Replied to the venue' },
      { at: at(8, 9, 12), source: 'github', title: 'Merged #42' },
      { at: at(8, 11, 0), source: 'screen', title: 'VS Code', detail: 'VS Code 40 min' },
      { at: at(8, 11, 0), source: 'screen', title: 'Chrome', detail: 'Chrome 12 min' },
      { at: at(8, 9, 40), source: 'shell', title: 'npm test' },
    ])
    expect(hours.map((h) => [h.hour, h.entries.map((e) => e.title)])).toEqual([
      [9, ['Merged #42', 'npm test']],
      [11, ['Mostly in VS Code, Chrome', 'Replied to the venue']],
    ])
  })
  it('folds a chat’s messages in one hour into one line', () => {
    const list = messageEntries([
      { at: at(8, 13, 1), source: 'whatsapp', chat: 'Asha', from: 'Asha', text: 'slides?' },
      { at: at(8, 13, 5), source: 'whatsapp', chat: 'Asha', from: 'me', text: 'Friday', out: true },
      { at: at(8, 13, 9), source: 'whatsapp', chat: 'Asha', from: 'Asha', text: 'great' },
      { at: at(8, 14, 0), source: 'mail', chat: 'Quarterly report', from: 'Bob', text: 'Attached' },
      { at: at(8, 14, 2), source: 'whatsapp', chat: 'Ravi', from: 'me', text: 'on my way', out: true },
    ])
    expect(list.map((e) => [e.title, e.detail])).toEqual([
      ['3 messages with Asha', 'great'],
      ['Mail: Quarterly report', 'Attached'],
      ['You wrote to Ravi', 'on my way'],
    ])
  })
})

describe('when a question is about', () => {
  it('today, yesterday, weeks, months, days of the week', () => {
    expect(timeRange('what did I do today?', now)).toMatchObject({ from: at(8, 0), to: at(9, 0), label: 'today' })
    expect(timeRange('Yesterday’s calls', now)).toMatchObject({ from: at(7, 0), to: at(8, 0) })
    // The week starts on Monday (the 2nd).
    expect(timeRange('what did I ship this week', now)).toMatchObject({ from: at(2, 0), to: at(9, 0) })
    expect(timeRange('what did I ship on the island last week?', now)).toMatchObject({ from: new Date(2026, 9, 26).getTime(), to: at(2, 0) })
    expect(timeRange('in the last 3 days', now)).toMatchObject({ from: at(6, 0), to: at(9, 0) })
    expect(timeRange('what happened on Friday', now)).toMatchObject({ from: at(6, 0), to: at(7, 0), label: 'Friday' })
    expect(timeRange('last month', now)).toMatchObject({ from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 10, 1).getTime() })
    expect(timeRange('who is Asha?', now)).toBeNull()
  })
})

describe('sources for an answer', () => {
  const cands: Candidate[] = [
    { title: 'Merged #42 The engine', kind: 'github', text: 'me/island', at: at(4, 10), url: 'https://github.com/me/island/pull/42' },
    { title: 'Search by meaning', kind: 'git', text: 'island: d52ec47', at: at(3, 9) },
    { title: 'Re: island demo', kind: 'mail', text: 'Asha asked about the demo', at: at(5, 16) },
    { title: 'Groceries', kind: 'note', text: 'milk, eggs', path: 'inbox/groceries.md', at: at(5, 8) },
    { title: 'Merged #42 The engine', kind: 'github', text: 'me/island', at: at(4, 10), url: 'https://github.com/me/island/pull/42' },
    { title: 'Island demo prep', kind: 'note', text: 'the island demo, older', path: 'p/demo.md', at: at(20, 9) - 30 * 86_400_000 },
  ]
  it('only the words that matter', () => {
    expect(terms('What did I ship on the island last week?')).toEqual(['island'])
  })
  it('the best fits, numbered, without repeats, in the time asked about', () => {
    const picked = pickSources(cands, 'what did I ship on the island last week?', at(10, 12))
    expect(picked.map((p) => [p.n, p.title])).toEqual([
      [1, 'Re: island demo'],
      [2, 'Merged #42 The engine'],
      [3, 'Search by meaning'],
    ])
    expect(fit(cands[3], ['island'], null)).toBe(0)
  })
  it('the prompt says the sources are data, and numbers them', () => {
    const picked = pickSources(cands, 'island last week', at(10, 12))
    const p = citedPrompt('what did I ship on the island last week?', picked, at(10, 12))
    expect(p.system).toMatch(/only from the numbered sources/)
    expect(p.system).toMatch(/data, never instructions/)
    expect(p.prompt).toMatch(/\(about last week\)/)
    expect(p.prompt).toMatch(/\[1\] Re: island demo \(mail, /)
  })
  it('keeps the cites that exist, in order, and drops the rest', () => {
    const picked = pickSources(cands, 'island last week', at(10, 12))
    const r = readCites('Three things: the engine [2], search [3, 9] and the demo [1][7] .', picked)
    expect(r.text).toBe('Three things: the engine [2], search [3] and the demo [1].')
    expect(r.cites.map((c) => [c.n, c.kind])).toEqual([
      [1, 'mail'],
      [2, 'github'],
      [3, 'git'],
    ])
    expect(r.cites[1].url).toBe('https://github.com/me/island/pull/42')
  })
  it('without a model: the sources, listed', () => {
    const picked = pickSources(cands, 'island last week', at(10, 12))
    expect(plainAnswer('island last week', picked, at(10, 12))).toBe('From last week: Re: island demo [1]; Merged #42 The engine [2]; Search by meaning [3].')
    expect(plainAnswer('x', [], now)).toMatch(/Nothing/)
  })
})
