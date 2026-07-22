import net from 'node:net'
import { unlink } from 'node:fs/promises'
import { encode, createDecoder } from '@shared/protocol'
import type { ToolRequest, Decision } from '@shared/types'

export class ClaudeServer {
  private server: net.Server | null = null
  private pending = new Map<string, net.Socket>()
  private cb: ((req: ToolRequest) => void) | null = null

  constructor(private socketPath: string) {}

  onRequest(cb: (req: ToolRequest) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    await unlink(this.socketPath).catch(() => {})
    this.server = net.createServer((socket) => {
      const decode = createDecoder()
      socket.on('data', (chunk) => {
        for (const m of decode(chunk) as any[]) {
          if (m.type === 'request' && m.request) {
            this.pending.set(m.request.id, socket)
            this.cb?.(m.request as ToolRequest)
          }
        }
      })
      socket.on('error', () => {})
    })
    await new Promise<void>((res) => this.server!.listen(this.socketPath, res))
  }

  resolve(id: string, decision: Decision): void {
    const socket = this.pending.get(id)
    if (!socket) return
    socket.write(encode({ type: 'decision', id, decision }))
    socket.end()
    this.pending.delete(id)
  }

  async stop(): Promise<void> {
    for (const s of this.pending.values()) s.destroy()
    this.pending.clear()
    await new Promise<void>((res) => this.server?.close(() => res()))
    await unlink(this.socketPath).catch(() => {})
  }
}
