import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { statSync } from 'node:fs'
import { ClaudeServer, parseRequest } from '../electron/providers/claude'
import { encode, createDecoder } from '@shared/protocol'
import type { ToolRequest } from '@shared/types'

const sockPath = () => join(tmpdir(), `di-test-${process.pid}-${Math.random()}.sock`)

function connect(sock: string, lines: string[]): { client: net.Socket; replies: Promise<any[]> } {
  const client = net.createConnection(sock, () => client.write(lines.join('')))
  const decode = createDecoder()
  const got: any[] = []
  const replies = new Promise<any[]>((resolve) => {
    client.on('data', (d) => got.push(...decode(d)))
    client.on('close', () => resolve(got))
  })
  return { client, replies }
}

test('server receives request and returns decision to client', async () => {
  const sock = sockPath()
  const server = new ClaudeServer(sock)
  let got: ToolRequest | null = null
  server.onRequest((req) => {
    got = req
    server.resolve({ id: req.id, decision: 'deny', message: 'nope' })
  })
  await server.start()
  expect(statSync(sock).mode & 0o777).toBe(0o600)

  const { replies } = connect(sock, [
    encode({ type: 'request', request: { id: 'x1', toolName: 'Bash', inputSummary: 'ls' } }),
  ])
  expect(await replies).toEqual([{ type: 'decision', id: 'x1', decision: 'deny', message: 'nope' }])
  expect(got!.id).toBe('x1')
  await server.stop()
})

test('hook hanging up cancels its pending request', async () => {
  const sock = sockPath()
  const server = new ClaudeServer(sock)
  const cancelled = new Promise<string>((r) => server.onCancel(r))
  server.onRequest(() => client.destroy())
  await server.start()
  const { client } = connect(sock, [
    encode({ type: 'request', request: { id: 'gone', toolName: 'Bash' } }),
  ])
  expect(await cancelled).toBe('gone')
  await server.stop()
})

test('malformed input does not crash the server', async () => {
  const sock = sockPath()
  const server = new ClaudeServer(sock)
  const seen: string[] = []
  server.onRequest((r) => {
    seen.push(r.id)
    server.resolve({ id: r.id, decision: 'allow' })
  })
  await server.start()
  const { replies } = connect(sock, [
    'garbage\n',
    encode({ type: 'request', request: { toolName: 'no id' } }),
    encode({ type: 'request', request: { id: 'ok', toolName: 'Read' } }),
  ])
  await replies
  expect(seen).toEqual(['ok'])
  await server.stop()
})

test('refuses to start when another island owns the socket', async () => {
  const sock = sockPath()
  const a = new ClaudeServer(sock)
  await a.start()
  await expect(new ClaudeServer(sock).start()).rejects.toThrow(/already listening/)
  await a.stop()
})

test('parseRequest validates untrusted fields', () => {
  expect(parseRequest(null)).toBeNull()
  expect(parseRequest({ id: 'a' })).toBeNull()
  expect(parseRequest({ id: 'a', toolName: 'Bash', toolInput: 'str', cwd: 3 })).toEqual({
    id: 'a',
    toolName: 'Bash',
    inputSummary: '',
    toolInput: undefined,
    cwd: undefined,
    suggestions: undefined,
  })
})
