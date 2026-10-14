import net from 'node:net'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { encode, createDecoder } from '@shared/protocol'

function runHook(sock: string, input: object): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn('node', ['hook/claude-island-hook.cjs'], {
      env: { ...process.env, DYNAMIC_ISLAND_SOCK: sock },
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => resolve(out))
    p.stdin.end(JSON.stringify(input))
  })
}

/** Fake island: answers each request with `reply(request)` (raw line). */
async function fakeIsland(reply: (req: any, socket: net.Socket) => void) {
  const sock = join(tmpdir(), `di-hook-${process.pid}-${Math.random()}.sock`)
  const server = net.createServer((socket) => {
    const decode = createDecoder()
    socket.on('data', (c) => {
      for (const m of decode(c) as any[]) if (m.type === 'request') reply(m.request, socket)
    })
  })
  await new Promise<void>((r) => server.listen(sock, r))
  return { sock, close: () => new Promise<void>((r) => server.close(() => r())) }
}

const INPUT = {
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
  permission_suggestions: [
    {
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'npm test' }],
      behavior: 'allow',
      destination: 'localSettings',
    },
  ],
}

test('hook relays island allow as a PermissionRequest decision', async () => {
  let seen: any
  const island = await fakeIsland((req, s) => {
    seen = req
    s.end(encode({ type: 'decision', id: req.id, decision: 'allow' }))
  })
  const res = JSON.parse(await runHook(island.sock, INPUT))
  expect(res.hookSpecificOutput.hookEventName).toBe('PermissionRequest')
  expect(res.hookSpecificOutput.decision).toEqual({ behavior: 'allow' })
  expect(seen.suggestions).toHaveLength(1)
  await island.close()
})

test('hook relays deny reason and always-allow', async () => {
  const deny = await fakeIsland((req, s) =>
    s.end(encode({ type: 'decision', id: req.id, decision: 'deny', message: 'no' })),
  )
  expect(JSON.parse(await runHook(deny.sock, INPUT)).hookSpecificOutput.decision).toEqual({
    behavior: 'deny',
    message: 'no',
  })
  await deny.close()

  const always = await fakeIsland((req, s) =>
    s.end(encode({ type: 'decision', id: req.id, decision: 'allow', always: true })),
  )
  const out = JSON.parse(await runHook(always.sock, INPUT))
  expect(out.hookSpecificOutput.decision.updatedPermissions).toEqual(INPUT.permission_suggestions)
  await always.close()
})

test('hook no-ops when the island answers "ask", sends garbage, or hangs up', async () => {
  const ask = await fakeIsland((req, s) =>
    s.end(encode({ type: 'decision', id: req.id, decision: 'ask' })),
  )
  expect((await runHook(ask.sock, INPUT)).trim()).toBe('')
  await ask.close()

  const garbage = await fakeIsland((_req, s) => s.end('not json\n'))
  expect((await runHook(garbage.sock, INPUT)).trim()).toBe('')
  await garbage.close()
})

test('hook no-ops (empty stdout) when socket missing', async () => {
  const out = await runHook(join(tmpdir(), 'nonexistent.sock'), INPUT)
  expect(out.trim()).toBe('') // no JSON => Claude's own prompt takes over
})

test('hook answers a Claude question with the island\'s answers', async () => {
  const QUESTION = { tool_name: 'AskUserQuestion', session_id: 'sess-1', tool_input: { questions: [{ question: 'Ship it?', header: 'Ship', multiSelect: false, options: [{ label: 'Yes', description: '' }, { label: 'No', description: '' }] }] } }
  let seen: any
  const island = await fakeIsland((req, s) => {
    seen = req
    s.end(encode({ type: 'decision', id: req.id, decision: 'allow', answers: { 'Ship it?': 'Yes' } }))
  })
  const out = JSON.parse(await runHook(island.sock, QUESTION))
  expect(seen.sessionId).toBe('sess-1')
  expect(out.hookSpecificOutput.decision).toEqual({ behavior: 'allow', updatedInput: { ...QUESTION.tool_input, answers: { 'Ship it?': 'Yes' } } })
  await island.close()
})

/** Run the session hook with `input` on stdin; resolves to [what it printed, what the island got]. */
async function runEvents(input: object, env: Record<string, string> = {}): Promise<[string, any[]]> {
  const got: any[] = []
  const sock = join(tmpdir(), `di-ev-${process.pid}-${Math.random()}.sock`)
  const server = net.createServer((socket) => {
    const decode = createDecoder()
    socket.on('data', (c) => got.push(...(decode(c) as any[])))
  })
  await new Promise<void>((r) => server.listen(sock, r))
  const out = await new Promise<string>((resolve) => {
    const p = spawn('node', ['hook/claude-island-hook-events.cjs'], { env: { ...process.env, DYNAMIC_ISLAND_SOCK: sock, ...env } })
    let o = ''
    p.stdout.on('data', (d) => (o += d))
    p.on('close', (code) => resolve(`${o}${code ? `exit ${code}` : ''}`))
    p.stdin.end(JSON.stringify(input))
  })
  await new Promise((r) => setTimeout(r, 50))
  await new Promise<void>((r) => server.close(() => r()))
  return [out, got]
}

test('session hook sends the event and prints nothing', async () => {
  const [out, got] = await runEvents({ hook_event_name: 'PreToolUse', session_id: 's9', cwd: '/w/app', tool_name: 'Bash', tool_input: { command: 'ls' } })
  expect(out).toBe('')
  expect(got).toHaveLength(1)
  expect(got[0]).toMatchObject({ type: 'event', event: { event: 'PreToolUse', sessionId: 's9', cwd: '/w/app', tool: 'Bash', input: { command: 'ls' }, agent: 'claude-code' } })
})

test('session hook sends Claude\'s diff without the file text, and the last reply on Stop', async () => {
  const [, got] = await runEvents({
    hook_event_name: 'PostToolUse',
    session_id: 's9',
    tool_name: 'Write',
    tool_input: { file_path: '/w/a.md', content: 'x'.repeat(50_000) },
    tool_response: { type: 'create', structuredPatch: [{ oldStart: 0, newStart: 1, lines: ['+x'] }] },
  })
  expect(got[0].event.input).toEqual({ file_path: '/w/a.md' })
  expect(got[0].event.patch).toEqual([{ oldStart: 0, newStart: 1, lines: ['+x'] }])
  expect(got[0].event.created).toBe(true)

  const dir = mkdtempSync(join(tmpdir(), 'di-tr-'))
  const transcript = join(dir, 't.jsonl')
  writeFileSync(
    transcript,
    [
      { type: 'user', message: { role: 'user', content: 'hi' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'All done: 3 files changed.' }] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'x' }] } },
    ]
      .map((l) => JSON.stringify(l))
      .join('\n') + '\n',
  )
  const [, stop] = await runEvents({ hook_event_name: 'Stop', session_id: 's9', transcript_path: transcript })
  expect(stop[0].event.final).toBe('All done: 3 files changed.')
})

test('session hook stays out of runs the island started, and of a missing island', async () => {
  const [out, got] = await runEvents({ hook_event_name: 'Stop', session_id: 's9' }, { DYNAMIC_ISLAND_RUN: '1' })
  expect([out, got.length]).toEqual(['', 0])
  const missing = await new Promise<string>((resolve) => {
    const p = spawn('node', ['hook/claude-island-hook-events.cjs'], { env: { ...process.env, DYNAMIC_ISLAND_SOCK: join(tmpdir(), 'none.sock') } })
    let o = ''
    p.stdout.on('data', (d) => (o += d))
    p.on('close', (code) => resolve(`${o}${code}`))
    p.stdin.end('{"hook_event_name":"Stop","session_id":"x"}')
  })
  expect(missing).toBe('0')
})
