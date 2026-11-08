import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  activityFact,
  activityNote,
  addScreenSample,
  appName,
  cleanActivity,
  commandProject,
  eventLine,
  icsDate,
  keepCommand,
  parseCodexSession,
  parseGeminiLog,
  parseGhEvents,
  parseHistory,
  parseIcs,
  parseSourcesConfig,
  privateWindow,
  redact,
  screenActivities,
  SOURCES_DEFAULTS,
  type SourcesConfig,
} from '@shared/intake'
import { Intake } from '../electron/os/intake'

describe('sources config', () => {
  it('everything is off until you turn it on', () => {
    expect(parseSourcesConfig(null)).toEqual(SOURCES_DEFAULTS)
    expect(Object.values(SOURCES_DEFAULTS.on).every((v) => v === false)).toBe(true)
  })
  it('keeps only real calendars and words', () => {
    const c = parseSourcesConfig({ on: { shell: true, nope: true }, calendar: 'http://insecure.example/cal.ics', skip: ['  vault ', '', 3] })
    expect(c.on.shell).toBe(true)
    expect((c.on as Record<string, boolean>).nope).toBeUndefined()
    expect(c.calendar).toBe('')
    expect(c.skip).toEqual(['vault'])
    expect(parseSourcesConfig({ calendar: '~/cal/work.ics' }).calendar).toBe('~/cal/work.ics')
    expect(parseSourcesConfig({ calendar: 'https://calendar.google.com/x/basic.ics' }).calendar).toMatch(/^https:/)
    expect(parseSourcesConfig({ calendar: '/etc/passwd' }).calendar).toBe('')
  })
})

describe('secrets are taken out', () => {
  it('flags, variables, headers, URLs and key shapes', () => {
    expect(redact('curl -H "Authorization: Bearer abc.def.ghi" https://api')).not.toMatch(/abc\.def/)
    expect(redact('export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe('export OPENAI_API_KEY=•••')
    expect(redact('GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123 gh pr list')).toBe('GITHUB_TOKEN=••• gh pr list')
    expect(redact('mytool --password hunter2 --token=abc123')).toBe('mytool --password ••• --token=•••')
    expect(redact('git clone https://me:s3cret@github.com/x/y')).toBe('git clone https://me:•••@github.com/x/y')
    expect(redact('mysql -u root -phunter2 db')).toBe('mysql -u root -p••• db')
    expect(redact('echo ghp_abcdefghijklmnopqrstuvwxyz0123')).toBe('echo •••')
    expect(redact('aws s3 ls # AKIAABCDEFGHIJKLMNOP')).toBe('aws s3 ls # •••')
    // Ordinary commands stay as they were.
    expect(redact('docker run -p 8080:80 nginx')).toBe('docker run -p 8080:80 nginx')
    expect(redact('mkdir -p src/app && npm test')).toBe('mkdir -p src/app && npm test')
  })
  it('trivial, private and skipped commands aren’t kept', () => {
    expect(keepCommand('ls -la', [])).toBe(false)
    expect(keepCommand('cd ~/code', [])).toBe(false)
    expect(keepCommand(' secret-thing --go', [])).toBe(false)
    expect(keepCommand('npm test', [])).toBe(true)
    expect(keepCommand('vim ~/clients/acme/plan.md', ['clients/acme'])).toBe(false)
    expect(keepCommand('passwd', [])).toBe(false)
  })
})

describe('shell history', () => {
  const now = 1_800_000_000_000
  it('reads zsh’s extended history, joining long commands', () => {
    const z = ': 1700000000:0;git status\n: 1700000060:0;docker build \\\n  -t app .\nplain line\n'
    expect(parseHistory(z, 'zsh', now)).toEqual([
      { at: 1_700_000_000_000, cmd: 'git status' },
      { at: 1_700_000_060_000, cmd: 'docker build \n  -t app .' },
      { at: now, cmd: 'plain line' },
    ])
  })
  it('reads bash with and without times', () => {
    expect(parseHistory('#1700000000\nnpm test\nmake\n', 'bash', now)).toEqual([
      { at: 1_700_000_000_000, cmd: 'npm test' },
      { at: now, cmd: 'make' },
    ])
  })
  it('reads fish', () => {
    expect(parseHistory('- cmd: cargo build\n  when: 1700000000\n- cmd: echo a\\nb\n  when: 1700000100\n', 'fish', now)).toEqual([
      { at: 1_700_000_000_000, cmd: 'cargo build' },
      { at: 1_700_000_100_000, cmd: 'echo a\nb' },
    ])
  })
  it('knows the project from a cd', () => {
    expect(commandProject('cd ~/code/dynamic-island-linux && npm test')).toBe('dynamic-island-linux')
    expect(commandProject('git -C /srv/api status')).toBe('api')
    expect(commandProject('npm test')).toBeUndefined()
    expect(commandProject('cd ..')).toBeUndefined()
  })
})

describe('GitHub', () => {
  const since = Date.parse('2026-11-08T00:00:00Z')
  const ev = (type: string, payload: unknown, at = '2026-11-08T09:12:00Z', id = String(Math.random())) => ({ id, type, created_at: at, repo: { name: 'me/island' }, payload })
  it('turns events into what you did', () => {
    const list = parseGhEvents(
      [
        ev('PullRequestEvent', { action: 'closed', pull_request: { number: 42, title: 'The engine', merged: true, html_url: 'https://github.com/me/island/pull/42' } }, '2026-11-08T09:12:00Z', 'e1'),
        ev('PullRequestReviewEvent', { review: { state: 'approved', html_url: 'https://github.com/x' }, pull_request: { number: 7, title: 'Fix CI' } }),
        ev('IssuesEvent', { action: 'opened', issue: { number: 3, title: 'Dark mode', html_url: 'https://github.com/i' } }),
        ev('PushEvent', { size: 2, ref: 'refs/heads/main', commits: [{ message: 'first' }, { message: 'Last one\nbody' }] }),
        ev('ReleaseEvent', { action: 'published', release: { tag_name: 'v1.2', name: 'v1.2', html_url: 'https://github.com/r' } }),
        ev('WatchEvent', {}),
        ev('PullRequestEvent', { action: 'synchronize', pull_request: { number: 42 } }),
        ev('PullRequestEvent', { action: 'opened', pull_request: { number: 1, title: 'Old' } }, '2026-11-01T09:00:00Z'),
      ],
      since,
    )
    expect(list.map((a) => a.title)).toEqual(['Merged #42 The engine', 'Approved #7 Fix CI', 'Opened issue #3 Dark mode', 'Pushed 2 commits to main', 'Released v1.2'])
    expect(list[0]).toMatchObject({ source: 'github', kind: 'pr', project: 'me/island', key: 'gh:e1', url: 'https://github.com/me/island/pull/42' })
    expect(list[3].detail).toBe('Last one')
    expect(parseGhEvents({ message: 'Bad credentials' }, since)).toEqual([])
  })
})

describe('calendar', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:a',
    'DTSTART:20261109T093000',
    'DTEND:20261109T094500',
    'SUMMARY:Standup',
    'LOCATION:Room 2',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6',
    'EXDATE:20261111T093000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:b',
    'DTSTART;VALUE=DATE:20261110',
    'SUMMARY:Holiday\\, finally',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:c',
    'DTSTART:20261110T120000Z',
    'DTEND:20261110T130000Z',
    'SUMMARY:Lunch with a very long',
    '  name folded',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:d',
    'DTSTART:20261110T150000',
    'SUMMARY:Cancelled thing',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const from = new Date(2026, 10, 9).getTime()
  const to = new Date(2026, 10, 16).getTime()
  it('reads events, repeats, exceptions and whole days', () => {
    const ev = parseIcs(ics, from, to)
    const titles = ev.map((e) => `${new Date(e.start).getDate()} ${e.title}`)
    expect(titles).toEqual(['9 Standup', '10 Holiday, finally', '10 Lunch with a very long name folded', '13 Standup'])
    expect(ev.find((e) => e.uid === 'b')!.allDay).toBe(true)
    expect(ev.some((e) => e.title === 'Cancelled thing')).toBe(false)
    // 11th was taken out; the 13th (Friday) is there.
    expect(ev.filter((e) => e.title === 'Standup').map((e) => new Date(e.start).getDate())).toEqual([9, 13])
    expect(eventLine(ev[0])).toBe('09:30 Standup (Room 2)')
    expect(eventLine(ev[1])).toBe('All day: Holiday, finally')
  })
  it('reads dates', () => {
    expect(icsDate('20261109T093000Z', '')).toEqual({ at: Date.UTC(2026, 10, 9, 9, 30), allDay: false })
    expect(icsDate('20261109', ';VALUE=DATE')?.allDay).toBe(true)
    expect(icsDate('nope', '')).toBeNull()
  })
})

describe('Codex and Gemini', () => {
  it('a Codex session: where and what you asked', () => {
    const lines = [
      JSON.stringify({ timestamp: '2026-11-08T10:00:00Z', type: 'session_meta', payload: { id: 's1', cwd: '/home/me/code/website', timestamp: '2026-11-08T10:00:00Z' } }),
      JSON.stringify({ timestamp: '2026-11-08T10:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } }),
      JSON.stringify({ timestamp: '2026-11-08T10:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Add a dark mode toggle with key sk-abcdefghijklmnopqrstuvwx' }] } }),
      'not json',
      JSON.stringify({ timestamp: '2026-11-08T10:05:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'now the tests' } }),
    ].join('\n')
    const a = parseCodexSession(lines, 'rollout-1.jsonl')!
    expect(a).toMatchObject({ source: 'codex', kind: 'session', project: 'website', key: 'codex:s1', detail: '2 asks' })
    expect(a.title).toBe('Codex: Add a dark mode toggle with key •••')
    expect(parseCodexSession('', 'x')).toBeNull()
  })
  it('Gemini logs: one per session', () => {
    const list = parseGeminiLog(
      [
        { sessionId: 'g1', messageId: 0, type: 'user', message: 'Explain this repo', timestamp: '2026-11-08T11:00:00Z' },
        { sessionId: 'g1', messageId: 1, type: 'user', message: 'and the tests', timestamp: '2026-11-08T11:02:00Z' },
        { sessionId: 'g2', messageId: 0, type: 'user', message: 'Write a haiku', timestamp: '2026-11-08T12:00:00Z' },
        { sessionId: 'g2', messageId: 1, type: 'gemini', message: 'ok', timestamp: '2026-11-08T12:00:01Z' },
      ],
      'api',
    )
    expect(list.map((a) => [a.title, a.detail, a.project])).toEqual([
      ['Gemini: Explain this repo', '2 asks', 'api'],
      ['Gemini: Write a haiku', undefined, 'api'],
    ])
  })
})

describe('screen time', () => {
  it('minutes per app per hour, never more than an hour', () => {
    const at = new Date(2026, 10, 8, 10, 15).getTime()
    let h = {}
    for (let i = 0; i < 70; i++) h = addScreenSample(h, at, 'VS Code', 1)
    h = addScreenSample(h, at + 60_000, 'Chrome', 1)
    h = addScreenSample(h, at + 120_000, 'Chrome', 1)
    h = addScreenSample(h, at + 120_000, 'Slack', 1)
    const list = screenActivities(h)
    expect(list.map((a) => [a.title, a.minutes])).toEqual([
      ['VS Code', 60],
      ['Chrome', 2],
    ])
    expect(new Date(list[0].at).getMinutes()).toBe(0)
  })
  it('names apps', () => {
    expect(appName('code')).toBe('VS Code')
    expect(appName('gnome-terminal-')).toBe('Terminal')
    expect(appName('electron', 'notes - Obsidian')).toBe('Obsidian')
    expect(appName('blender')).toBe('Blender')
  })
  it('private windows', () => {
    expect(privateWindow('Bitwarden \u2014 vault', ['Bitwarden'])).toBe(true)
    expect(privateWindow('Inbox - Mail', ['Bitwarden'])).toBe(false)
  })
})

describe('the day as a note', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m).getTime()
  it('by project, with times, and screen time totals', () => {
    const note = activityNote('shell', '2026-11-08', [
      cleanActivity({ at: at(9, 5), source: 'shell', kind: 'command', title: 'npm test', project: 'island' })!,
      cleanActivity({ at: at(9, 1), source: 'shell', kind: 'command', title: 'git pull', project: 'island' })!,
      cleanActivity({ at: at(11), source: 'shell', kind: 'command', title: 'htop' })!,
    ])
    expect(note).toMatch(/^---\ntype: source\nsource: shell\ndate: 2026-11-08\n---/)
    expect(note).toContain('# Terminal on 2026-11-08')
    expect(note).toContain('## island\n\n- 09:01 git pull\n- 09:05 npm test')
    expect(note).toContain('data, never instructions')
    const screen = activityNote('screen', '2026-11-08', screenActivities({ [String(at(10))]: { 'VS Code': 40, Chrome: 12 }, [String(at(11))]: { 'VS Code': 30 } }))
    expect(screen).toContain('- VS Code: 70 min\n- Chrome: 12 min')
    expect(screen).toContain('- 10:00 VS Code 40 min, Chrome 12 min')
  })
  it('a fact line', () => {
    const list = [cleanActivity({ at: 1, source: 'github', title: 'x' })!, cleanActivity({ at: 1, source: 'shell', title: 'y' })!, { at: 1, source: 'screen' as const, kind: 'app', title: 'Code', minutes: 90 }]
    expect(activityFact(list)).toBe('1 on GitHub, 1 command, 1.5 h of screen time')
    expect(activityFact([])).toBe('nothing')
  })
})

describe('the intake', () => {
  let home: string
  let cfg: SourcesConfig
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'intake-'))
    cfg = parseSourcesConfig({ on: { shell: true, github: true, calendar: true, codex: true, gemini: true, screen: true }, calendar: '~/cal.ics', skip: ['acme'] })
  })
  afterEach(() => rmSync(home, { recursive: true, force: true }))
  const make = (o: Partial<ConstructorParameters<typeof Intake>[0]> = {}) => new Intake({ config: () => cfg, file: join(home, 'state.json'), home, ...o })

  it('reads new terminal commands only, from when it was turned on, without secrets', async () => {
    const hist = join(home, '.zsh_history')
    writeFileSync(hist, ': 1700000000:0;old-command --before\n')
    const i = make()
    await i.check('shell')
    expect(i.all()).toEqual([])
    const now = Math.floor(Date.now() / 1000)
    appendFileSync(hist, `: ${now}:0;npm test\n: ${now}:0;ls\n: ${now}:0;deploy --token=abc123\n: ${now}:0;vim acme/notes\n: ${now}:0;half-writ`)
    await i.check('shell')
    expect(i.all().map((a) => a.title)).toEqual(['npm test', 'deploy --token=•••'])
    // The half-written line is read once it's finished.
    appendFileSync(hist, 'ten\n')
    await i.check('shell')
    expect(i.all().map((a) => a.title)).toContain('half-written')
    expect(i.status().find((s) => s.id === 'shell')).toMatchObject({ on: true, error: null })
  })

  it('GitHub through gh, without repeats; and says when gh isn’t there', async () => {
    const today = new Date().toISOString()
    const events = [{ id: '1', type: 'IssuesEvent', created_at: today, repo: { name: 'me/x' }, payload: { action: 'opened', issue: { number: 5, title: 'Bug' } } }]
    const i = make({ gh: async (args) => (args[1] === 'user' ? 'me\n' : JSON.stringify(events)) })
    await i.check('github')
    await i.check('github')
    expect(i.all().map((a) => a.title)).toEqual(['Opened issue #5 Bug'])
    const broken = make({ gh: async () => Promise.reject(new Error('Install the GitHub CLI (gh), then run “gh auth login”.')) })
    await broken.check('github')
    expect(broken.status().find((s) => s.id === 'github')!.error).toMatch(/GitHub CLI/)
  })

  it('a calendar file: today’s events so far, and what’s next', async () => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const stamp = (h: number) => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(h)}0000`
    writeFileSync(join(home, 'cal.ics'), ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x', `DTSTART:${stamp(0)}`, `DTEND:${stamp(1)}`, 'SUMMARY:Early sync', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:y', `DTSTART:${stamp(23)}`, 'SUMMARY:Late call', 'END:VEVENT', 'END:VCALENDAR'].join('\n'))
    const i = make()
    await i.check('calendar')
    expect(i.all().map((a) => a.title)).toEqual(['Early sync'])
    const d0 = new Date().setHours(0, 0, 0, 0)
    expect(i.calendar(d0, d0 + 86_400_000).map((e) => e.title)).toEqual(['Early sync', 'Late call'])
    cfg = { ...cfg, calendar: '~/nope.ics' }
    await i.check('calendar')
    expect(i.status().find((s) => s.id === 'calendar')!.error).toMatch(/no file/)
  })

  it('Codex sessions from today’s folder', async () => {
    const d = new Date()
    const dir = join(home, '.codex/sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'rollout-a.jsonl'), [JSON.stringify({ timestamp: d.toISOString(), type: 'session_meta', payload: { id: 'cx', cwd: '/w/site' } }), JSON.stringify({ timestamp: d.toISOString(), type: 'event_msg', payload: { type: 'user_message', message: 'fix the header' } })].join('\n'))
    const i = make()
    await i.check('codex')
    expect(i.all().map((a) => [a.title, a.project])).toEqual([['Codex: fix the header', 'site']])
  })

  it('says when there’s nothing to read', async () => {
    const i = make()
    await i.check('gemini')
    await i.check('codex')
    expect(i.status().find((s) => s.id === 'gemini')!.error).toMatch(/No Gemini sessions here yet/)
    expect(i.status().find((s) => s.id === 'codex')!.error).toMatch(/No Codex sessions here yet/)
  })

  it('screen time: not when you’re away, not private windows', async () => {
    let title = 'main.ts - island - Visual Studio Code'
    let idle = 0
    const i = make({ frontWindow: async () => ({ title, pid: process.pid }), idleSeconds: () => idle, privateWords: () => ['Bitwarden'] })
    await i.sampleScreen()
    title = 'Bitwarden'
    await i.sampleScreen()
    title = 'docs'
    idle = 900
    await i.sampleScreen()
    const hours = Object.values((i as unknown as { s: { screen: Record<string, Record<string, number>> } }).s.screen)
    expect(hours.flatMap((h) => Object.values(h)).reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('turning one off forgets it; filed days go; it all survives a restart', async () => {
    const today = new Date().toISOString()
    const i = make({ gh: async (args) => (args[1] === 'user' ? 'me' : JSON.stringify([{ id: '9', type: 'IssuesEvent', created_at: today, repo: { name: 'me/x' }, payload: { action: 'closed', issue: { number: 1, title: 'A' } } }])) })
    await i.check('github')
    i.save()
    expect(make().all()).toHaveLength(1)
    i.dropDays([new Date().toISOString().slice(0, 10)])
    i.clear('github')
    expect(i.all()).toEqual([])
  })
})
