import net from 'node:net'
import { chmod, unlink } from 'node:fs/promises'
import { encode, createDecoder } from '@shared/protocol'
import type { ToolRequest, DecisionMsg } from '@shared/types'
import { parseUsage, type ClaudeUsage } from '@shared/claude'

/** Validate an untrusted request from the socket. Pure. */
export function parseRequest(raw: any): ToolRequest | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.toolName !== 'string') return null
  return {
    id: raw.id,
    toolName: raw.toolName,
    inputSummary: typeof raw.inputSummary === 'string' ? raw.inputSummary : '',
    toolInput:
      raw.toolInput && typeof raw.toolInput === 'object' ? raw.toolInput : undefined,
    cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : undefined,
    fromIsland: raw.fromIsland === true || undefined,
  }
}

/** True if something is already accepting connections on `path`. */
function isListening(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const c = net.createConnection(path)
    c.once('connect', () => {
      c.destroy()
      resolve(true)
    })
    c.once('error', () => resolve(false))
  })
}

/**
 * Unix-socket server the Claude hook talks to. One connection per permission
 * request; the reply is written back on the same connection. If the hook goes
 * away first (timeout, Claude cancelled, answered in the terminal) the request
 * is reported via onCancel so its card can be dropped.
 */
export class ClaudeServer {
  private server: net.Server | null = null
  private pending = new Map<string, net.Socket>()
  private reqCb: ((req: ToolRequest) => void) | null = null
  private cancelCb: ((id: string) => void) | null = null
  private usageCb: ((u: ClaudeUsage) => void) | null = null

  constructor(private socketPath: string) {}

  onRequest(cb: (req: ToolRequest) => void): void {
    this.reqCb = cb
  }

  onCancel(cb: (id: string) => void): void {
    this.cancelCb = cb
  }

  /** Plan usage reported by the status line bridge. */
  onUsage(cb: (u: ClaudeUsage) => void): void {
    this.usageCb = cb
  }

  async start(): Promise<void> {
    if (await isListening(this.socketPath)) {
      throw new Error(`another island is already listening on ${this.socketPath}`)
    }
    await unlink(this.socketPath).catch(() => {})
    this.server = net.createServer((socket) => {
      const decode = createDecoder()
      const ids = new Set<string>()
      socket.on('data', (chunk) => {
        for (const m of decode(chunk) as any[]) {
          if (m.type === 'usage') {
            const u = parseUsage(m.usage, Date.now())
            if (u) this.usageCb?.(u)
            continue
          }
          if (m.type !== 'request') continue
          const req = parseRequest(m.request)
          if (!req) continue
          ids.add(req.id)
          this.pending.set(req.id, socket)
          this.reqCb?.(req)
        }
      })
      socket.on('close', () => {
        for (const id of ids) {
          if (this.pending.get(id) !== socket) continue
          this.pending.delete(id)
          this.cancelCb?.(id)
        }
      })
      socket.on('error', () => {})
    })
    await new Promise<void>((res, rej) => {
      this.server!.once('error', rej)
      this.server!.listen(this.socketPath, () => {
        this.server!.off('error', rej)
        res()
      })
    })
    // Only the owning user may submit approvals.
    await chmod(this.socketPath, 0o600).catch(() => {})
  }

  /** Send the user's decision back to the waiting hook. */
  resolve(msg: DecisionMsg): void {
    const socket = this.pending.get(msg.id)
    if (!socket) return
    this.pending.delete(msg.id)
    socket.end(encode({ type: 'decision', ...msg }))
  }

  async stop(): Promise<void> {
    for (const s of this.pending.values()) s.destroy()
    this.pending.clear()
    if (this.server) await new Promise<void>((res) => this.server!.close(() => res()))
    this.server = null
    await unlink(this.socketPath).catch(() => {})
  }
}
