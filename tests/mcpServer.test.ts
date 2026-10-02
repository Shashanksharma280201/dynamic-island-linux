import { IslandMcp } from '../electron/agent/mcpServer'
import { schema, str, type AgentTool } from '../electron/agent/tools'
import { claudeArgs } from '../electron/claudeCode'
import { toolDetail } from '../shared/claude'

const tools: AgentTool[] = [
  { name: 'notes_search', description: 'Find notes', input_schema: schema({ query: { type: 'string' } }), label: () => '', run: async (i) => `found ${str(i.query)}` },
  {
    name: 'chats_send',
    description: 'Send',
    input_schema: schema({ text: { type: 'string' } }, ['text']),
    label: () => '',
    asks: async (i) => ({ title: 'Send it?', body: str(i.text) }),
    run: async (i) => `Sent ${str(i.text)}`,
  },
]

test('the island’s tools as an MCP server for Claude Code', async () => {
  const mcp = new IslandMcp()
  expect(mcp.config()).toBeNull()
  await mcp.start()
  const asked: string[] = []
  let allow = false
  mcp.use(tools, async (t, input) => (asked.push(`${t.name}:${str(input.text)}`), allow))
  const cfg = JSON.parse(mcp.config()!).mcpServers.island
  expect(cfg).toMatchObject({ type: 'http' })
  expect(cfg.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
  const call = (body: unknown, auth = cfg.headers.Authorization) =>
    fetch(cfg.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: auth }, body: JSON.stringify(body) })

  // Without the run's token: nothing.
  expect((await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer nope')).status).toBe(401)

  const init = await (await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json()
  expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'dynamic-island' } })
  expect((await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)

  const list = await (await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
  expect(list.result.tools.map((t: any) => t.name)).toEqual(['notes_search', 'chats_send'])
  expect(list.result.tools[1].inputSchema.required).toEqual(['text'])

  const found = await (await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'notes_search', arguments: { query: 'rent' } } })).json()
  expect(found.result).toEqual({ content: [{ type: 'text', text: 'found rent' }], isError: false })

  // Acting for you asks on the island first.
  const no = await (await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'chats_send', arguments: { text: 'hi' } } })).json()
  expect(no.result.isError).toBe(true)
  expect(no.result.content[0].text).toContain('did not allow')
  allow = true
  const yes = await (await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'chats_send', arguments: { text: 'hi' } } })).json()
  expect(yes.result.content[0].text).toBe('Sent hi')
  expect(asked).toEqual(['chats_send:hi', 'chats_send:hi'])

  const bad = await (await call({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'chats_send', arguments: {} } })).json()
  expect(bad.result).toMatchObject({ isError: true, content: [{ text: 'Invalid input: Missing "text".' }] })
  expect((await (await call({ jsonrpc: '2.0', id: 7, method: 'resources/list' })).json()).error.code).toBe(-32601)
  mcp.stop()
})

test('Claude Code gets the island’s tools, allowed, with a note about them', () => {
  const a = claudeArgs({ prompt: 'x', permissionMode: 'default', mcpConfig: '{"mcpServers":{}}' })
  expect(a.slice(-4)).toEqual(['--allowedTools', 'mcp__island', '--mcp-config', '{"mcpServers":{}}'])
  expect(a[a.indexOf('--append-system-prompt') + 1]).toContain('mcp__island__')
  expect(claudeArgs({ prompt: 'x', permissionMode: 'default' })).not.toContain('--mcp-config')
  expect(toolDetail('mcp__island__crm_find', {})).toBe('Find people')
  expect(toolDetail('mcp__island__new_thing', {})).toBe('Using new thing')
  expect(toolDetail('mcp__github__x', {})).toBe('Using github')
})
