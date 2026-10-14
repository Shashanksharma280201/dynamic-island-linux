import {
  applyEvent,
  diffForEdit,
  durationText,
  lineDiff,
  mergeFile,
  parseEvent,
  pruneSessions,
  sessionStatus,
  sortSessions,
  agentName,
  type AgentEvent,
  type AgentSession,
} from '../shared/sessions'
import { SessionTracker } from '../electron/sessions'

const ev = (event: AgentEvent['event'], at: number, more: Partial<AgentEvent> = {}): AgentEvent => ({
  event,
  agent: 'claude-code',
  sessionId: 's1',
  at,
  cwd: '/home/me/shop',
  ...more,
})

const run = (events: AgentEvent[]) => events.reduce<Record<string, AgentSession>>((all, e) => applyEvent(all, e), {})

test('parseEvent keeps known events and cleans the rest', () => {
  expect(parseEvent({ event: 'Nope', sessionId: 'a' })).toBeNull()
  expect(parseEvent({ event: 'Stop' })).toBeNull()
  const e = parseEvent({ event: 'PreToolUse', sessionId: 'a', agent: 'Codex!', tool: 'Bash', input: { command: 'ls' }, pid: 1, at: 5 }, 9)!
  expect(e.agent).toBe('codex')
  expect(e.pid).toBeUndefined() // init is never the agent
  expect(e.at).toBe(5)
  expect(e.input).toEqual({ command: 'ls' })
  expect(parseEvent({ event: 'Stop', sessionId: 'a', patch: [{ oldStart: 1, newStart: 1, lines: ['+x', 3] }] })!.patch).toEqual([{ oldStart: 1, newStart: 1, lines: ['+x'] }])
})

test('a turn: prompt, steps with an edit, then done', () => {
  const all = run([
    ev('SessionStart', 1, { pid: 4242 }),
    ev('UserPromptSubmit', 2, { prompt: 'fix the cart total' }),
    ev('PreToolUse', 3, { tool: 'Read', input: { file_path: '/home/me/shop/cart.ts' } }),
    ev('PreToolUse', 4, { tool: 'Edit', input: { file_path: '/home/me/shop/cart.ts' } }),
    ev('PostToolUse', 5, { tool: 'Edit', input: { file_path: '/home/me/shop/cart.ts' }, patch: [{ oldStart: 3, newStart: 3, lines: [' a', '-b', '+c', '+d'] }] }),
  ])
  let s = all.s1
  expect(s.project).toBe('shop')
  expect(s.pid).toBe(4242)
  expect(s.phase).toBe('working')
  expect(s.steps.map((x) => [x.label, x.done])).toEqual([
    ['Reading cart.ts', true],
    ['Editing cart.ts', true],
  ])
  expect(s.steps[1].stat).toEqual({ added: 2, removed: 1 })
  expect([s.added, s.removed, s.edits]).toEqual([2, 1, 1])
  expect(s.files[0].file).toBe('/home/me/shop/cart.ts')
  s = applyEvent(all, ev('Stop', 65_000, { final: 'Fixed: totals now include tax.' })).s1
  expect(s.phase).toBe('done')
  expect(s.final).toBe('Fixed: totals now include tax.')
  expect(sessionStatus(s, 70_000)).toBe('Done in 1 min 5 s · 2 steps')
  // The next prompt starts a fresh turn.
  s = applyEvent({ s1: s }, ev('UserPromptSubmit', 70_000, { prompt: 'and add a test' })).s1
  expect([s.phase, s.steps.length, s.added, s.files.length, s.final]).toEqual(['working', 0, 0, 0, undefined])
})

test('stuck on a permission prompt until it moves on', () => {
  let all = run([ev('UserPromptSubmit', 1, { prompt: 'deploy' }), ev('PreToolUse', 2, { tool: 'Bash', input: { command: 'npm run deploy' } })])
  all = applyEvent(all, ev('Notification', 3, { message: 'Claude needs your permission to use Bash' }))
  expect(all.s1.phase).toBe('waiting')
  expect(sessionStatus(all.s1, 4)).toBe('Claude needs your permission to use Bash')
  all = applyEvent(all, ev('PostToolUse', 9, { tool: 'Bash' }))
  expect(all.s1.phase).toBe('waiting') // only a new step or the end clears it
  all = applyEvent(all, ev('PreToolUse', 10, { tool: 'Read', input: { file_path: '/x/a.md' } }))
  expect(all.s1.phase).toBe('working')
  expect(all.s1.message).toBeUndefined()
})

test('idle at the prompt counts as done; SessionEnd forgets it', () => {
  let all = run([ev('UserPromptSubmit', 1, { prompt: 'hi' })])
  all = applyEvent(all, ev('Notification', 5, { message: 'Claude is waiting for your input' }))
  expect(all.s1.phase).toBe('done')
  expect(applyEvent(all, ev('SessionEnd', 6)).s1).toBeUndefined()
})

test('sessions that went quiet are pruned; ones that need you sort first', () => {
  const all = run([ev('UserPromptSubmit', 1), { ...ev('UserPromptSubmit', 50), sessionId: 's2' }, { ...ev('Notification', 60, { message: 'needs your permission' }), sessionId: 's3' }])
  expect(Object.keys(pruneSessions(all, 100, 60))).toEqual(['s2', 's3'])
  expect(sortSessions(Object.values(all)).map((s) => s.id)).toEqual(['s3', 's2', 's1'])
})

test('lineDiff: hunks with context and counts', () => {
  const a = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].join('\n')
  const b = ['1', '2', '3', '4', 'five', '6', '7', '8', '9', '10', '11'].join('\n')
  const d = lineDiff(a, b)
  expect([d.added, d.removed]).toEqual([2, 1])
  expect(d.hunks).toHaveLength(1)
  expect(d.hunks[0].lines).toEqual([' 2', ' 3', ' 4', '-5', '+five', ' 6', ' 7', ' 8', ' 9', ' 10', '+11'])
  expect(d.hunks[0].oldStart).toBe(2)
  expect(lineDiff('', 'a\nb').added).toBe(2)
})

test('diffForEdit from the input when Claude sent no patch', () => {
  expect(diffForEdit('Edit', { file_path: '/a.ts', old_string: 'x = 1', new_string: 'x = 2\ny = 3' })).toMatchObject({ file: '/a.ts', added: 2, removed: 1 })
  expect(diffForEdit('Write', { file_path: '/n.md', content: 'a\nb\nc\n' }, undefined, true)).toMatchObject({ added: 3, removed: 0 })
  expect(diffForEdit('MultiEdit', { file_path: '/m.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: '' }] })).toMatchObject({ added: 1, removed: 2 })
  expect(diffForEdit('Edit', {})).toBeUndefined()
})

test('mergeFile keeps one entry per file, latest first', () => {
  const one = { file: '/a', added: 1, removed: 0, hunks: [{ oldStart: 1, newStart: 1, lines: ['+x'] }] }
  const two = { file: '/b', added: 2, removed: 2, hunks: [] }
  const out = mergeFile(mergeFile(mergeFile([], one), two), { ...one, added: 3 })
  expect(out.map((f) => [f.file, f.added])).toEqual([
    ['/a', 4],
    ['/b', 2],
  ])
  expect(out[0].hunks).toHaveLength(2)
})

test('names and durations', () => {
  expect(agentName('claude-code')).toBe('Claude Code')
  expect(agentName('my-agent')).toBe('My Agent')
  expect(durationText(45_000)).toBe('45 s')
  expect(durationText(120_000)).toBe('2 min')
  expect(durationText(3_780_000)).toBe('1 h 3 min')
})

test('SessionTracker reports a finished turn and a stuck session once', () => {
  const finished: string[] = []
  const waiting: string[] = []
  const lists: number[] = []
  const t = new SessionTracker({ onChange: (l) => lists.push(l.length), onFinished: (s) => finished.push(s.id), onWaiting: (s) => waiting.push(s.id), alive: (pid) => pid !== 99, now: () => 100 })
  t.event(ev('SessionStart', 1)) // a session that hasn't been asked anything yet...
  t.event(ev('Stop', 2)) // ...ending its (empty) turn says nothing
  t.event(ev('UserPromptSubmit', 3, { prompt: 'go', pid: 99 }))
  t.event(ev('Notification', 4, { message: 'Claude needs your permission to use Bash' }))
  t.event(ev('Notification', 5, { message: 'Claude needs your permission to use Bash' }))
  t.event(ev('Stop', 6))
  t.event(ev('Stop', 7))
  expect(finished).toEqual(['s1'])
  expect(waiting).toEqual(['s1'])
  // Its process quit: forgotten.
  t.prune()
  expect(t.list()).toEqual([])
  expect(lists.at(-1)).toBe(0)
})
