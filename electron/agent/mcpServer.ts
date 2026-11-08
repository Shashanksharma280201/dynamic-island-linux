import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { runTool, type AgentTool, type Approver } from './tools'

/** The name Claude Code knows the island by: its tools show up as mcp__island__<tool>. */
export const MCP_NAME = 'island'

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any }

export type McpOptions = {
  /** The name clients know it by (their tools show up as mcp__<name>__<tool>). */
  name?: string
  /** A fixed port (the next free one up to 9 above it if taken); 0 picks any. */
  port?: number
  /** A lasting token (other apps keep it in their config); random otherwise. */
  token?: string
  instructions?: string
}

const ISLAND_INSTRUCTIONS =
  'Tools of the Dynamic Island on this computer: the packages the user turned on (notes, chats, mail, music, documents, CRM…). Tools that act for the user ask them on the island first.'

/**
 * The island's tools as an MCP server (streamable HTTP, JSON responses), so
 * Claude Code can use them too. Listens on 127.0.0.1 only and needs a random
 * token that's handed to each Claude Code run, so other programs can't use it.
 */
export class IslandMcp {
  private server: Server | null = null
  private port = 0
  private readonly token: string
  private toolsFor: (client: string) => AgentTool[] = () => []
  private approve: Approver | undefined

  constructor(private readonly o: McpOptions = {}) {
    this.token = o.token ?? randomBytes(24).toString('hex')
  }

  /** The tools (and how to ask you) for the next run. */
  use(tools: AgentTool[], approve?: Approver): void {
    this.toolsFor = () => tools
    this.approve = approve
  }

  /** Tools per calling app (the `client` in its address, e.g. /mcp?client=codex). */
  serve(toolsFor: (client: string) => AgentTool[], approve?: Approver): void {
    this.toolsFor = toolsFor
    this.approve = approve
  }

  async start(): Promise<void> {
    if (this.server) return
    const first = this.o.port ?? 0
    for (let port = first; ; port++) {
      const server = createServer((req, res) => void this.handle(req, res))
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, '127.0.0.1', () => resolve())
        })
      } catch (e: any) {
        if (e?.code === 'EADDRINUSE' && first && port < first + 9) continue
        throw e
      }
      this.server = server
      break
    }
    const a = this.server.address()
    this.port = typeof a === 'object' && a ? a.port : 0
  }

  stop(): void {
    this.server?.close()
    this.server = null
    this.port = 0
  }

  /** The address other apps use, or null when not running. */
  url(): string | null {
    return this.server && this.port ? `http://127.0.0.1:${this.port}/mcp` : null
  }

  /** The header other apps send. */
  authorization(): string {
    return `Bearer ${this.token}`
  }

  /** The --mcp-config for a Claude Code run, or null when not running. */
  config(): string | null {
    const url = this.url()
    if (!url) return null
    return JSON.stringify({
      mcpServers: { [this.o.name ?? MCP_NAME]: { type: 'http', url, headers: { Authorization: this.authorization() } } },
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
    const at = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (at.pathname !== '/mcp') return send(404, { error: 'not found' })
    const client = (at.searchParams.get('client') ?? '').replace(/[^\w.-]/g, '').slice(0, 40)
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
    const replies = (await Promise.all(batch.map((m) => this.answer(m, client)))).filter((r) => r !== null)
    if (!replies.length) return send(202)
    send(200, Array.isArray(msg) ? replies : replies[0])
  }

  /** One JSON-RPC message; null for notifications. */
  async answer(m: Rpc, client = ''): Promise<object | null> {
    if (m.id === undefined || m.id === null) return null
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result })
    switch (m.method) {
      case 'initialize':
        return ok({
          protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.o.name ? `dynamic-island-${this.o.name}` : 'dynamic-island', version: '1.0.0' },
          instructions: this.o.instructions ?? ISLAND_INSTRUCTIONS,
        })
      case 'ping':
        return ok({})
      case 'tools/list':
        return ok({ tools: this.toolsFor(client).map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) })
      case 'tools/call': {
        const r = await runTool(this.toolsFor(client), String(m.params?.name ?? ''), m.params?.arguments ?? {}, this.approve)
        return ok({ content: [{ type: 'text', text: r.output }], isError: !r.ok })
      }
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } }
    }
  }
}
