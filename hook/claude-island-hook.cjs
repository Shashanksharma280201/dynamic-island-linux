#!/usr/bin/env node
const net = require('node:net')

const SOCK =
  process.env.DYNAMIC_ISLAND_SOCK ||
  `${process.env.XDG_RUNTIME_DIR || '/tmp'}/dynamic-island.sock`

function output(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

function summarize(input) {
  if (!input) return ''
  if (typeof input.command === 'string') return input.command
  if (typeof input.file_path === 'string') return input.file_path
  return JSON.stringify(input).slice(0, 200)
}

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  let hook
  try {
    hook = JSON.parse(raw || '{}')
  } catch {
    return output('ask', 'bad input')
  }

  const request = {
    id: `${process.pid}-${Date.now()}`,
    toolName: hook.tool_name || 'unknown',
    inputSummary: summarize(hook.tool_input),
    cwd: hook.cwd,
  }

  const timer = setTimeout(() => output('ask', 'island timeout'), 30000)
  const client = net.createConnection(SOCK, () => {
    client.write(JSON.stringify({ type: 'request', request }) + '\n')
  })

  let buf = ''
  client.on('data', (d) => {
    buf += d.toString()
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (!line.trim()) continue
      const m = JSON.parse(line)
      if (m.type === 'decision') {
        clearTimeout(timer)
        output(m.decision, 'via dynamic island')
      }
    }
  })
  client.on('error', () => {
    clearTimeout(timer)
    output('ask', 'island unreachable')
  })
})
