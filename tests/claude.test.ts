import {
  applyStreamEvent,
  newRun,
  toolDetail,
  usageFromRateLimitEvent,
  parseUsage,
  currentWindow,
  usageAlerts,
} from '../shared/claude'

const feed = (events: any[]) => events.reduce((r, e, i) => applyStreamEvent(r, e, 1000 + i), newRun('r1', 'fix the tests', '/p', 1))

test('a run follows Claude through thinking, tools, writing and the result', () => {
  let r = newRun('r1', 'fix the tests', '/p', 1)
  expect(r.phase).toBe('starting')
  r = applyStreamEvent(r, { type: 'system', subtype: 'init', session_id: 's-1' }, 2)
  expect([r.phase, r.sessionId]).toEqual(['thinking', 's-1'])
  r = applyStreamEvent(r, { type: 'assistant', message: { content: [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } }, 3)
  expect([r.phase, r.tool, r.steps, r.reply]).toEqual(['tool', { name: 'Bash', detail: 'Running npm test' }, 1, 'Let me look.'])
  r = applyStreamEvent(r, { type: 'user', message: { content: [{ type: 'tool_result' }] } }, 4)
  expect(r.phase).toBe('thinking')
  r = applyStreamEvent(r, { type: 'stream_event', event: { type: 'message_start' } }, 5)
  r = applyStreamEvent(r, { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'All ' } } }, 6)
  r = applyStreamEvent(r, { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'green.' } } }, 7)
  expect([r.phase, r.reply]).toEqual(['writing', 'All green.'])
  r = applyStreamEvent(r, { type: 'result', subtype: 'success', is_error: false, result: 'All 12 tests pass.', session_id: 's-1', total_cost_usd: 0.02 }, 8)
  expect([r.phase, r.reply, r.finishedAt, r.costUsd]).toEqual(['done', 'All 12 tests pass.', 8, 0.02])
})

test('errors, subagents, junk and stopped runs', () => {
  const err = feed([{ type: 'result', subtype: 'error_max_turns', is_error: true }])
  expect([err.phase, err.error]).toEqual(['error', 'Claude stopped: it reached the turn limit.'])
  const auth = feed([{ type: 'result', is_error: true, result: 'Invalid API key · Please run /login' }])
  expect(auth.error).toBe('Invalid API key · Please run /login')
  // A subagent's messages don't replace the main reply
  const sub = feed([
    { type: 'assistant', message: { content: [{ type: 'text', text: 'main' }] } },
    { type: 'assistant', parent_tool_use_id: 't1', message: { content: [{ type: 'text', text: 'sub' }] } },
  ])
  expect(sub.reply).toBe('main')
  expect(feed([null, 42, { type: 'nope' }, { type: 'assistant' }]).phase).toBe('starting')
  const stopped = { ...newRun('r', 'p', '/', 1), phase: 'stopped' as const }
  expect(applyStreamEvent(stopped, { type: 'result', result: 'x' }, 2)).toBe(stopped)
})

test('tool lines', () => {
  expect(toolDetail('Read', { file_path: '/a/b/app.ts' })).toBe('Reading app.ts')
  expect(toolDetail('Edit', { file_path: 'x/README.md' })).toBe('Editing README.md')
  expect(toolDetail('Bash', { command: 'git status\ngit diff', description: '' })).toBe('Running git status')
  expect(toolDetail('WebFetch', { url: 'https://docs.example.com/x' })).toBe('Reading docs.example.com')
  expect(toolDetail('mcp__github__create_issue', {})).toBe('Using github')
})

test('plan usage from the stream, the status line and resets', () => {
  let u = usageFromRateLimitEvent(undefined, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.42, resetsAt: 2000 } }, 10)
  expect(u).toEqual({ fiveHour: { pct: 42, resetsAt: 2_000_000, limited: undefined }, updatedAt: 10 })
  u = usageFromRateLimitEvent(u, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'seven_day', resetsAt: 9000 } }, 11)
  expect(u?.sevenDay).toEqual({ pct: 100, resetsAt: 9_000_000, limited: true })
  expect(u?.fiveHour?.pct).toBe(42)
  expect(usageFromRateLimitEvent(u, { type: 'rate_limit_event', rate_limit_info: { rateLimitType: 'overage' } }, 12)).toBe(u)

  expect(parseUsage({ fiveHour: { pct: 150, resetsAt: 5 }, model: 'Opus', updatedAt: 99 }, 50)).toEqual({ fiveHour: { pct: 100, resetsAt: 5 }, sevenDay: undefined, model: 'Opus', updatedAt: 50 })
  expect(parseUsage({ fiveHour: { pct: 'x' } }, 1)).toBeNull()
  expect(currentWindow({ pct: 70, resetsAt: 100 }, 200)).toEqual({ pct: 0 })
  expect(currentWindow({ pct: 70, resetsAt: 300 }, 200)).toEqual({ pct: 70, resetsAt: 300 })
})

test('heads-up cards at 80% and 95%, once per window', () => {
  const seen = new Set<string>()
  const usage = { fiveHour: { pct: 83, resetsAt: 5000 }, sevenDay: { pct: 40, resetsAt: 9000 }, updatedAt: 1 }
  const a = usageAlerts(usage, seen, 100)
  expect(a.map((x) => [x.window, x.threshold])).toEqual([['fiveHour', 80]])
  a.forEach((x) => seen.add(x.key))
  expect(usageAlerts(usage, seen, 100)).toEqual([])
  expect(usageAlerts({ ...usage, fiveHour: { pct: 97, resetsAt: 5000 } }, seen, 100).map((x) => x.threshold)).toEqual([95])
  // After the reset it starts over
  expect(usageAlerts(usage, seen, 6000)).toEqual([])
})
