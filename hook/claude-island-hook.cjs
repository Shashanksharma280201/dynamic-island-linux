#!/usr/bin/env node
const net = require('node:net')
const fs = require('node:fs')

const SOCK =
  process.env.DYNAMIC_ISLAND_SOCK ||
  `${process.env.XDG_RUNTIME_DIR || '/tmp'}/dynamic-island.sock`

const DEBUG_LOG = process.env.DYNAMIC_ISLAND_DEBUG_LOG
function debug(msg) {
  if (!DEBUG_LOG) return
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

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
  debug(`INVOKED sock=${SOCK} stdin=${raw.slice(0, 500)}`)
  let hook
  try {
    hook = JSON.parse(raw || '{}')
  } catch {
    debug('bad input -> ask')
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
        debug(`decision from island: ${m.decision}`)
        output(m.decision, 'via dynamic island')
      }
    }
  })
  client.on('error', (e) => {
    clearTimeout(timer)
    debug(`island unreachable: ${e && e.message} -> ask`)
    output('ask', 'island unreachable')
  })
})
