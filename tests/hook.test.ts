import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { encode, createDecoder } from '@shared/protocol'

function runHook(sock: string, input: object): Promise<any> {
  return new Promise((resolve) => {
    const p = spawn('node', ['hook/claude-island-hook.cjs'], {
      env: { ...process.env, DYNAMIC_ISLAND_SOCK: sock },
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => resolve(JSON.parse(out)))
    p.stdin.end(JSON.stringify(input))
  })
}

function runHookRaw(sock: string, input: object): Promise<{ stdout: string }> {
  return new Promise((resolve) => {
    const p = spawn('node', ['hook/claude-island-hook.cjs'], {
      env: { ...process.env, DYNAMIC_ISLAND_SOCK: sock },
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => resolve({ stdout: out }))
    p.stdin.end(JSON.stringify(input))
  })
}

test('hook relays island allow as a PermissionRequest decision', async () => {
  const sock = join(tmpdir(), `di-hook-${process.pid}.sock`)
  const server = net.createServer((socket) => {
    const decode = createDecoder()
    socket.on('data', (c) => {
      for (const m of decode(c) as any[]) {
        if (m.type === 'request')
          socket.write(encode({ type: 'decision', id: m.request.id, decision: 'allow' }))
      }
    })
  })
  await new Promise<void>((r) => server.listen(sock, r))

  const res = await runHook(sock, {
    tool_name: 'Bash',
    tool_input: { command: 'echo hi' },
  })
  expect(res.hookSpecificOutput.hookEventName).toBe('PermissionRequest')
  expect(res.hookSpecificOutput.decision.behavior).toBe('allow')
  await new Promise<void>((r) => server.close(() => r()))
})

test('hook no-ops (empty stdout) when socket missing', async () => {
  const res = await runHookRaw(join(tmpdir(), 'nonexistent.sock'), {
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
  })
  expect(res.stdout.trim()).toBe('') // no JSON => Claude's own prompt takes over
})
