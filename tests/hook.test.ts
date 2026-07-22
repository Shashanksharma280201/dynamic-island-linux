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

test('hook relays server decision', async () => {
  const sock = join(tmpdir(), `di-hook-${process.pid}.sock`)
  const server = net.createServer((socket) => {
    const decode = createDecoder()
    socket.on('data', (c) => {
      for (const m of decode(c) as any[]) {
        if (m.type === 'request')
          socket.write(encode({ type: 'decision', id: m.request.id, decision: 'deny' }))
      }
    })
  })
  await new Promise<void>((r) => server.listen(sock, r))

  const res = await runHook(sock, {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /' },
  })
  expect(res.hookSpecificOutput.permissionDecision).toBe('deny')
  await new Promise<void>((r) => server.close(() => r()))
})

test('hook falls back to ask when socket missing', async () => {
  const res = await runHook(join(tmpdir(), 'nonexistent.sock'), {
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
  })
  expect(res.hookSpecificOutput.permissionDecision).toBe('ask')
})
