import { ALERT_DEFAULTS, alertWay, approvalWord, inQuietHours, interruptKind, parseActions, parseRoutine, statusLine, wakeMatch } from '../shared/jarvis'

test('interrupting a running task', () => {
  expect(interruptKind('how far is it?')).toBe('status')
  expect(interruptKind("what's it doing")).toBe('status')
  expect(interruptKind('Stop!')).toBe('cancel')
  expect(interruptKind('never mind')).toBe('cancel')
  expect(interruptKind('use the other branch')).toBe('steer')
})

test('yes, no and always', () => {
  expect(approvalWord('Yes.')).toBe('allow')
  expect(approvalWord('go ahead')).toBe('allow')
  expect(approvalWord("don't")).toBe('deny')
  expect(approvalWord('no thanks I will')).toBeNull()
  expect(approvalWord('always allow')).toBe('always')
  expect(approvalWord('yes but first check the tests')).toBeNull()
})

test('the tags an answer can carry', () => {
  const r = parseActions('On it. [DO: run the e2e suite and fix what fails] [REMEMBER: prefers pnpm over npm] Click here. [CLICK: 120, 40: Save] [TYPE: hello world]')
  expect(r.speech).toBe('On it. Click here.')
  expect(r.actions).toEqual([
    { t: 'do', task: 'run the e2e suite and fix what fails' },
    { t: 'remember', fact: 'prefers pnpm over npm' },
    { t: 'click', x: 120, y: 40, label: 'Save' },
    { t: 'type', text: 'hello world' },
  ])
  expect(parseActions('[CLICK: nowhere]').actions).toEqual([])
})

test('what it says when asked how it’s going', () => {
  expect(statusLine(null, 0, 0)).toBe('Nothing’s running.')
  expect(statusLine({ phase: 'tool', tool: 'Running npm test…', steps: 3 }, 0, 4 * 60_000)).toBe('Running npm test. 4 minutes in, 3 steps done.')
  expect(statusLine({ phase: 'thinking' }, 0, 10_000)).toBe('Thinking. Just started.')
})

test('speaking up, sparingly', () => {
  const at = (h: number) => new Date(2026, 10, 9, h).getTime()
  const base = { key: 'session:1', kind: 'session-waiting', config: ALERT_DEFAULTS, spoken: {}, dismissed: {} }
  expect(inQuietHours(23, ALERT_DEFAULTS)).toBe(true)
  expect(inQuietHours(7, ALERT_DEFAULTS)).toBe(true)
  expect(inQuietHours(12, ALERT_DEFAULTS)).toBe(false)
  expect(alertWay({ ...base, priority: 'high', now: at(12) })).toBe('speak')
  expect(alertWay({ ...base, priority: 'high', now: at(23) })).toBe('show') // quiet hours
  expect(alertWay({ ...base, priority: 'medium', now: at(12) })).toBe('show')
  expect(alertWay({ ...base, priority: 'low', now: at(12) })).toBe('digest')
  expect(alertWay({ ...base, priority: 'high', now: at(12), spoken: { 'session:1': at(10) } })).toBe('show') // said already
  expect(alertWay({ ...base, priority: 'high', now: at(12), dismissed: { 'session-waiting': 3 } })).toBe('show') // you keep dismissing it
  const busy = { a: at(12) - 1000, b: at(12) - 2000, c: at(12) - 3000, d: at(12) - 4000 }
  expect(alertWay({ ...base, priority: 'high', now: at(12), spoken: busy })).toBe('show') // four this hour
})

test('the wake word', () => {
  expect(wakeMatch('Hey Sparky, where is the wallpaper setting?', 'Sparky')).toBe('where is the wallpaper setting?')
  expect(wakeMatch('hey sparky', 'Sparky')).toBe('')
  expect(wakeMatch('Sparky what time is it', 'Sparky')).toBe('what time is it')
  expect(wakeMatch('Sparky is a good name for a dog', 'Sparky')).toBe('is a good name for a dog')
  expect(wakeMatch('my sparky toaster broke', 'Sparky')).toBeNull()
  expect(wakeMatch('Sparkles everywhere', 'Sparky')).toBeNull()
})

test('routines are checked', () => {
  expect(parseRoutine({ name: 'Wrap', ask: 'Wrap up my day', when: { hour: 18, minute: 30 } })).toMatchObject({ name: 'Wrap', on: true, when: { hour: 18, minute: 30 } })
  expect(parseRoutine({ name: 'Wrap', ask: '', when: { hour: 18, minute: 30 } })).toBeNull()
  expect(parseRoutine({ name: 'Wrap', ask: 'x', when: { hour: 25, minute: 0 } })).toBeNull()
  expect(parseRoutine({ name: 'Fri', ask: 'x', when: { hour: 17, minute: 0, weekday: 5 } })?.when.weekday).toBe(5)
})

test('Routines: run at their time (or on waking), one at a time, retried when busy', async () => {
  const { Routines } = await import('../electron/routines')
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()
  let now = at(9, 12)
  let list: any[] = []
  const asked: string[] = []
  let busy = false
  const started: string[] = []
  const r = new Routines({
    routines: () => list,
    save: (l) => (list = l),
    ask: (p) => {
      if (busy) throw new Error('busy')
      asked.push(p)
    },
    started: (x) => started.push(x.name),
    now: () => now,
  })
  expect(r.upsert({ name: 'Wrap', ask: 'Wrap up my day', when: { hour: 18, minute: 30 } })).toBeNull()
  expect(r.upsert({ name: '', ask: 'x', when: { hour: 1, minute: 0 } })).toMatch(/needs a name/)
  expect(r.tick()).toBeNull() // not yet
  now = at(9, 19)
  busy = true
  expect(r.tick()).toBeNull() // the assistant is busy: later
  busy = false
  expect(r.tick()?.name).toBe('Wrap')
  expect(asked[0]).toMatch(/^Wrap up my day\n\n\(This is your routine “Wrap”\. Ask before sending/)
  expect(r.tick()).toBeNull() // once per time it comes round
  now = at(11, 8) // slept through the 10th: runs on waking
  expect(r.tick()?.name).toBe('Wrap')
  expect(started).toEqual(['Wrap', 'Wrap'])
  r.remove(list[0].id)
  expect(list).toEqual([])
})

test('Announcer: says what’s urgent once, learns from dismissals', async () => {
  const { Announcer } = await import('../electron/announcer')
  const said: string[] = []
  let now = new Date(2026, 10, 9, 12).getTime()
  const a = new Announcer({ config: () => ALERT_DEFAULTS, say: (l) => said.push(l), now: () => now })
  const ev = (key: string) => a.event({ key, kind: 'session-waiting', priority: 'high', line: `${key} needs you` })
  expect(ev('robot-arm')).toBe('speak')
  expect(ev('robot-arm')).toBe('show') // not twice
  now += 73 * 3_600_000
  expect(ev('robot-arm')).toBe('speak') // three days later, again (at 13:00)
  a.dismissed('session-waiting')
  a.dismissed('session-waiting')
  a.dismissed('session-waiting')
  expect(ev('island')).toBe('show')
  a.acted('session-waiting')
  expect(ev('island')).toBe('speak')
  expect(said).toEqual(['robot-arm needs you', 'robot-arm needs you', 'island needs you'])
})
