import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatNote } from '../shared/brain'
import { JOBS, cardShowing, dailyPlain, isDue, lastDue, morningPlain, nextDue, parseMorning, triagePlan, weeklyPlain } from '../shared/loop'
import { Loop } from '../electron/brain/loop'
import { Vault } from '../electron/brain/vault'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime() // November 2026
const daily = { hour: 21, minute: 0 }
const sunday = { hour: 21, minute: 30, weekday: 0 }

test('when jobs come round, and missed ones', () => {
  expect(lastDue(daily, at(8, 22))).toBe(at(8, 21))
  expect(lastDue(daily, at(8, 20))).toBe(at(7, 21))
  expect(nextDue(daily, at(8, 20))).toBe(at(8, 21))
  expect(nextDue(daily, at(8, 22))).toBe(at(9, 21))
  // 8 November 2026 is a Sunday.
  expect(lastDue(sunday, at(10, 9))).toBe(at(8, 21, 30))
  expect(nextDue(sunday, at(10, 9))).toBe(at(15, 21, 30))
  expect(isDue(daily, at(7, 21, 5), at(8, 22))).toBe(true) // slept through it: catch up
  expect(isDue(daily, at(8, 21, 5), at(8, 22))).toBe(false)
  expect(JOBS.map((j) => j.id)).toEqual(['commits', 'messages', 'activity', 'triage', 'daily', 'weekly', 'morning'])
})

test('the evening filing: where each inbox note goes', () => {
  const moves = triagePlan(
    [
      { path: '01-inbox/2026-11-08-asha.md', title: 'Asha Rao', type: 'person', about: [] },
      { path: '01-inbox/2026-11-08-ros.md', title: 'ROS bridge idea', type: 'note', about: ['[[robot-arm]]'] },
      { path: '01-inbox/2026-11-08-tabs.md', title: 'Tabs over spaces', type: 'preference', about: [] },
      { path: '01-inbox/2026-11-08-asked.md', title: 'Asked Sparky: where is settings', type: 'note', about: [] },
      { path: '01-inbox/2026-11-08-idea.md', title: 'A drone', type: 'idea', about: [] },
      { path: '01-inbox/2026-11-08-robot-arm.md', title: 'robot-arm', type: 'project', about: [] },
    ],
    ['robot-arm', 'dynamic-island-linux'],
  )
  expect(moves).toEqual([
    { from: '01-inbox/2026-11-08-asha.md', to: '07-world-model/people/asha-rao.md', why: 'a person' },
    { from: '01-inbox/2026-11-08-ros.md', to: '02-projects/robot-arm/notes/2026-11-08-ros.md', why: 'about robot-arm' },
    { from: '01-inbox/2026-11-08-tabs.md', to: '06-brain/life/2026-11-08-tabs.md', why: 'a preference' },
    { from: '01-inbox/2026-11-08-asked.md', to: '04-resources/asked/2026-11-08-asked.md', why: 'a question you asked' },
    { from: '01-inbox/2026-11-08-idea.md', to: '06-brain/ideas/2026-11-08-idea.md', why: 'an idea' },
  ])
})

test('the day and week in plain words, and the morning card', () => {
  const day = { date: '2026-11-08', sessions: [{ project: 'robot-arm', title: 'IK solver' }], commits: [{ repo: 'robot-arm', count: 3, lines: [] }], captures: 2 }
  expect(dailyPlain(day)).toMatch(/^- Shipped: 3 commits in robot-arm/)
  expect(dailyPlain(day).split('\n')).toHaveLength(5)
  expect(weeklyPlain([day, { ...day, date: '2026-11-07', sessions: [] }])).toMatch(/1 Claude Code sessions and 6 commits/)
  const card = parseMorning('One: Reply to Priya about the API contract\nWhy: She asked twice and it blocks her launch.\nTo: Priya, by mail\nDraft: Hi Priya,\nThe contract looks good.\nShashank', '2026-11-09')
  expect(card).toEqual({ date: '2026-11-09', one: 'Reply to Priya about the API contract', why: 'She asked twice and it blocks her launch.', to: 'Priya, by mail', draft: 'Hi Priya,\nThe contract looks good.\nShashank', state: 'new' })
  expect(parseMorning('One: Ship the release\nWhy: It’s ready.\nTo: none\nDraft:', 'x')?.to).toBe('')
  expect(parseMorning('nothing useful', 'x')).toBeNull()
  // On one line, as some models answer.
  expect(parseMorning('One: Send Asha the deck Why: You promised it. To: Asha, by mail Draft: Hi Asha, here it is.', 'x')).toMatchObject({ one: 'Send Asha the deck', why: 'You promised it.', to: 'Asha, by mail', draft: 'Hi Asha, here it is.' })
  expect(morningPlain({ date: 'x', promises: ['- [ ] Send Asha the deck'], projects: [] })?.one).toBe('Send Asha the deck')
  expect(cardShowing({ ...card!, state: 'held', holdUntil: 100 }, 50)).toBe(false)
  expect(cardShowing({ ...card!, state: 'held', holdUntil: 100 }, 150)).toBe(true)
  expect(cardShowing({ ...card!, state: 'done' }, 150)).toBe(false)
})

function vaultWith(): { v: Vault; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'loop-'))
  const v = new Vault(root, { git: false })
  v.create(at(1, 9))
  return { v, root }
}

test('Loop: runs what’s due, says how it went, and files only when you apply', async () => {
  const { v } = vaultWith()
  let now = at(8, 20)
  const cards: unknown[] = []
  const asked: string[] = []
  v.write('01-inbox/2026-11-08-asha.md', formatNote({ type: 'person', date: '2026-11-08' }, '# Asha Rao\n\nRuns Globex.\n'), 'test')
  v.write('07-world-model/ledgers/promises.md', '- [ ] Send Asha the deck\n', 'test')
  const loop = new Loop({
    vault: () => v,
    writer: () => ({
      ask: async (prompt, purpose) => {
        asked.push(purpose ?? '')
        if (/chief of staff/.test(prompt)) return 'One: Send Asha the deck\nWhy: You promised it.\nTo: Asha, by mail\nDraft: Hi Asha, here it is.'
        return '- Shipped: x\n- Decided: y\n- Promised: z\n- Number: 1\n- Next: n'
      },
    }),
    git: async () => '',
    brief: () => 'Shashank, robotics.',
    onCard: (c) => cards.push(c),
    onChange: () => {},
    now: () => now,
  })
  loop.start()
  loop.stop()
  // A new vault starts its clock now: nothing runs yet.
  expect(loop.view().jobs.every((j) => j.ok === null)).toBe(true)
  now = at(8, 22)
  await loop.tick()
  const jobs = Object.fromEntries(loop.view().jobs.map((j) => [j.id, j]))
  expect(jobs.commits).toMatchObject({ ok: true, note: 'No commits today.' })
  expect(jobs.triage).toMatchObject({ ok: true, note: expect.stringMatching(/^1 note to file/) })
  expect(jobs.daily).toMatchObject({ ok: true, note: 'Written.' })
  expect(jobs.morning.ok).toBeNull() // its time hasn't come
  expect(v.read('06-brain/signals/daily/2026-11-08.md')).toMatch(/- Shipped: x/)
  // The filing waits for you.
  expect(v.has('01-inbox/2026-11-08-asha.md')).toBe(true)
  expect(loop.applyFiling()).toBe(1)
  expect(v.has('07-world-model/people/asha-rao.md')).toBe(true)
  expect(loop.undoFiling()).toBe(1)
  expect(v.has('01-inbox/2026-11-08-asha.md')).toBe(true)
  // The morning: the card, from the AI.
  now = at(9, 7)
  await loop.tick()
  expect(cards.at(-1)).toMatchObject({ one: 'Send Asha the deck', to: 'Asha, by mail', state: 'new' })
  expect(asked).toContain('your brief, open promises and yesterday’s signal, for the morning card')
  loop.act('hold')
  expect(loop.card()?.state).toBe('held')
  // A job that fails says so, and isn't shown as fine.
  const broken = new Loop({ vault: () => v, writer: () => null, git: async () => Promise.reject(new Error('no git')), brief: () => '', onCard: () => {}, onChange: () => {}, now: () => now })
  mkdirSync(join(v.root, '02-projects/robot-arm'), { recursive: true })
  v.write('02-projects/robot-arm/robot-arm.md', formatNote({ type: 'project', folder: v.root }, '# robot-arm\n'), 'test')
  mkdirSync(join(v.root, '.git'), { recursive: true })
  await broken.run('commits')
  expect(broken.view().jobs.find((j) => j.id === 'commits')).toMatchObject({ ok: false, note: 'Failed: Couldn’t read robot-arm (no git)' })
  await broken.run('daily')
  expect(broken.view().jobs.find((j) => j.id === 'daily')?.note).toMatch(/without an AI|Nothing happened/)
})

test('Loop: your activity is kept as one note per source and day, and the morning card sees the calendar', async () => {
  const { v } = vaultWith()
  const now = at(8, 21)
  let dropped: string[] = []
  const prompts: string[] = []
  const acts = [
    { at: at(7, 10), source: 'shell' as const, kind: 'command', title: 'npm test', project: 'island' },
    { at: at(8, 9), source: 'github' as const, kind: 'pr', title: 'Merged #42 The engine', project: 'me/island', url: 'https://github.com/me/island/pull/42' },
    { at: at(8, 10), source: 'shell' as const, kind: 'command', title: 'make' },
  ]
  const loop = new Loop({
    vault: () => v,
    writer: () => ({
      ask: async (prompt) => {
        prompts.push(prompt)
        return 'One: Prepare the standup\nWhy: It is at 09:30.\nTo: none\nDraft:'
      },
    }),
    git: async () => '',
    brief: () => '',
    onCard: () => {},
    onChange: () => {},
    activity: () => ({ on: true, all: () => acts, dropDays: (d) => (dropped = d), today: () => ['09:30 Standup (Room 2)'] }),
    now: () => now,
  })
  await loop.run('activity')
  expect(loop.view().jobs.find((j) => j.id === 'activity')).toMatchObject({ ok: true, note: 'Today: 1 on GitHub, 1 command.' })
  expect(v.read('09-sources/shell/2026-11-07.md')).toContain('npm test')
  expect(v.read('09-sources/shell/2026-11-08.md')).toContain('- 10:00 make')
  expect(v.read('09-sources/github/2026-11-08.md')).toContain('Merged #42 The engine (https://github.com/me/island/pull/42)')
  // Yesterday is complete: its waiting copy goes; today's stays until tonight's run.
  expect(dropped).toEqual(['2026-11-07'])
  await loop.run('morning')
  expect(prompts.at(-1)).toContain('Today’s calendar:\n09:30 Standup (Room 2)')
  // Off: it says so.
  const off = new Loop({ vault: () => v, writer: () => null, git: async () => '', brief: () => '', onCard: () => {}, onChange: () => {}, activity: () => ({ on: false, all: () => [], dropDays: () => {}, today: () => [] }), now: () => now })
  await off.run('activity')
  expect(off.view().jobs.find((j) => j.id === 'activity')?.note).toMatch(/Off: turn on a source/)
})
