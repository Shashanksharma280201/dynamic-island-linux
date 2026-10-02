import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { runTool, type AgentTool, type Approver } from './tools'

/** The name Claude Code knows the island by: its tools show up as mcp__island__<tool>. */
export const MCP_NAME = 'island'

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any }

/**
 * The island's tools as an MCP server (streamable HTTP, JSON responses), so
 * Claude Code can use them too. Listens on 127.0.0.1 only and needs a random
 * token that's handed to each Claude Code run, so other programs can't use it.
 */
export class IslandMcp {
  private server: Server | null = null
  private port = 0
  private readonly token = randomBytes(24).toString('hex')
  private tools: AgentTool[] = []
  private approve: Approver | undefined

  /** The tools (and how to ask you) for the next run. */
  use(tools: AgentTool[], approve?: Approver): void {
    this.tools = tools
    this.approve = approve
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => resolve())
    })
    const a = this.server.address()
    this.port = typeof a === 'object' && a ? a.port : 0
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  /** The --mcp-config for a Claude Code run, or null when not running. */
  config(): string | null {
    if (!this.server || !this.port) return null
    return JSON.stringify({
      mcpServers: { [MCP_NAME]: { type: 'http', url: `http://127.0.0.1:${this.port}/mcp`, headers: { Authorization: `Bearer ${this.token}` } } },
    })
  }

  private authorized(req: IncomingMessage): boolean {
    const got = Buffer.from(String(req.headers.authorization ?? ''))
    const want = Buffer.from(`Bearer ${this.token}`)
    return got.length === want.length && timingSafeEqual(got, want)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' })
      res.end(body === undefined ? undefined : JSON.stringify(body))
    }
    if (!this.authorized(req)) return send(401, { error: 'unauthorized' })
    if (req.url !== '/mcp') return send(404, { error: 'not found' })
    // No server-sent stream: everything is answered in the POST.
    if (req.method !== 'POST') return send(405, { error: 'method not allowed' })
    let raw = ''
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > 5_000_000) return send(413, { error: 'too large' })
    }
    let msg: Rpc | Rpc[]
    try {
      msg = JSON.parse(raw)
    } catch {
      return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
    const batch = Array.isArray(msg) ? msg : [msg]
    const replies = (await Promise.all(batch.map((m) => this.answer(m)))).filter((r) => r !== null)
    if (!replies.length) return send(202)
    send(200, Array.isArray(msg) ? replies : replies[0])
  }

  /** One JSON-RPC message; null for notifications. */
  async answer(m: Rpc): Promise<object | null> {
    if (m.id === undefined || m.id === null) return null
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result })
    switch (m.method) {
      case 'initialize':
        return ok({
          protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'dynamic-island', version: '1.0.0' },
          instructions:
            'Tools of the Dynamic Island on this computer: the packages the user turned on (notes, chats, mail, music, documents, CRM…). Tools that act for the user ask them on the island first.',
        })
      case 'ping':
        return ok({})
      case 'tools/list':
        return ok({ tools: this.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) })
      case 'tools/call': {
        const r = await runTool(this.tools, String(m.params?.name ?? ''), m.params?.arguments ?? {}, this.approve)
        return ok({ content: [{ type: 'text', text: r.output }], isError: !r.ok })
      }
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } }
    }
  }
}
