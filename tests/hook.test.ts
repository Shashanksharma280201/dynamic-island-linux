import net from 'node:net'
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
