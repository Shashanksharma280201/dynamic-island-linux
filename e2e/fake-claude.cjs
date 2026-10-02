#!/usr/bin/env node
// Stand-in for the `claude` command in tests: speaks the same
// `-p --output-format stream-json` protocol. Behaviour follows the prompt:
//   "...fail..."      exits with an error on stderr, no result
//   "...approval..."  asks the PermissionRequest hook from --settings first
//   "...slow..."      takes a few seconds (to test Stop)
//   "use island tool <name> <json>"  calls that tool on the island's MCP
//                     server from --mcp-config (like a real MCP client)
// Arguments are appended to $DI_FAKE_CLAUDE_LOG as JSON lines.
const fs = require('node:fs')
const { spawn } = require('node:child_process')

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
if (process.env.DI_FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.DI_FAKE_CLAUDE_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\n')

const prompt = opt('-p') || ''
const resume = opt('--resume')
const session = resume || 'fake-session-' + process.pid
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const step = /slow/i.test(prompt) ? 1500 : 250

function askHook() {
  const settings = JSON.parse(opt('--settings') || '{}')
  const cmd = settings.hooks?.PermissionRequest?.[0]?.hooks?.[0]?.command
  if (!cmd) return Promise.resolve('no-hook')
  return new Promise((resolve) => {
    const p = spawn('sh', ['-c', cmd], { stdio: ['pipe', 'pipe', 'inherit'] })
    let o = ''
    p.stdout.on('data', (d) => (o += d))
    p.on('close', () => {
      try {
        resolve(JSON.parse(o).hookSpecificOutput.decision.behavior)
      } catch {
        resolve('no-decision')
      }
    })
    p.stdin.end(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, cwd: process.cwd(), permission_suggestions: [] }))
  })
}

process.on('SIGINT', () => process.exit(130))

;(async () => {
  if (/fail/i.test(prompt)) {
    process.stderr.write('Error: something broke in the fake\n')
    process.exit(1)
  }
  out({ type: 'system', subtype: 'init', session_id: session, cwd: process.cwd(), tools: ['Read', 'Bash'] })
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.37, resetsAt: Math.floor(Date.now() / 1000) + 3600 }, session_id: session })
  await sleep(step)
  out({ type: 'assistant', session_id: session, message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: process.cwd() + '/README.md' } }] } })
  await sleep(step)
  out({ type: 'user', session_id: session, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })
  // The island's tools, over MCP (streamable HTTP), like Claude Code does.
  const island = /^use island tool (\w+) (\{.*\})$/s.exec(prompt)
  if (island) {
    const cfg = JSON.parse(opt('--mcp-config') || '{}').mcpServers?.island
    let id = 0
    const rpc = async (method, params) => {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { ...cfg.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      })
      return (await r.json()).result
    }
    let text
    if (!cfg) text = 'no island tools'
    else {
      await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-claude', version: '1' } })
      const names = (await rpc('tools/list')).tools.map((t) => t.name)
      out({ type: 'assistant', session_id: session, message: { content: [{ type: 'tool_use', id: 'm1', name: `mcp__island__${island[1]}`, input: JSON.parse(island[2]) }] } })
      const r = names.includes(island[1]) ? await rpc('tools/call', { name: island[1], arguments: JSON.parse(island[2]) }) : { content: [{ text: 'no such tool' }] }
      text = r.content[0].text
      out({ type: 'user', session_id: session, message: { content: [{ type: 'tool_result', tool_use_id: 'm1', content: text }] } })
    }
    const reply = `Island said: ${text}`
    out({ type: 'assistant', session_id: session, message: { content: [{ type: 'text', text: reply }] } })
    out({ type: 'result', subtype: 'success', is_error: false, result: reply, session_id: session, total_cost_usd: 0.01 })
    return
  }
  let decision = null
  if (/approval/i.test(prompt)) {
    out({ type: 'assistant', session_id: session, message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'rm -rf build' } }] } })
    decision = await askHook()
    out({ type: 'user', session_id: session, message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: decision }] } })
  }
  await sleep(step)
  const reply = `${decision ? `Bash was ${decision}. ` : ''}Done: ${prompt}${resume ? ` (continuing ${resume})` : ''}`
  out({ type: 'stream_event', session_id: session, event: { type: 'message_start' } })
  for (const word of reply.split(/(?<= )/)) {
    out({ type: 'stream_event', session_id: session, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: word } } })
    await sleep(40)
  }
  out({ type: 'assistant', session_id: session, message: { content: [{ type: 'text', text: reply }] } })
  out({ type: 'result', subtype: 'success', is_error: false, result: reply, session_id: session, total_cost_usd: 0.0123 })
})()
