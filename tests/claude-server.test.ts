import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeServer } from '../electron/providers/claude'
import { encode, createDecoder } from '@shared/protocol'
import type { ToolRequest } from '@shared/types'

test('server receives request and returns decision to client', async () => {
  const sock = join(tmpdir(), `di-test-${process.pid}.sock`)
  const server = new ClaudeServer(sock)
  let got: ToolRequest | null = null
  server.onRequest((req) => {
    got = req
    server.resolve(req.id, 'allow')
  })
  await server.start()

  const decision = await new Promise<string>((resolvePromise) => {
    const c = net.createConnection(sock, () => {
      c.write(
        encode({
          type: 'request',
          request: { id: 'x1', toolName: 'Bash', inputSummary: 'ls' },
        }),
      )
    })
    const decode = createDecoder()
    c.on('data', (d) => {
      for (const m of decode(d) as any[]) {
        if (m.type === 'decision') resolvePromise(m.decision)
      }
    })
  })

  expect(got!.id).toBe('x1')
  expect(decision).toBe('allow')
  await server.stop()
})
