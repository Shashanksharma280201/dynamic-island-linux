#!/usr/bin/env node
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const { buildDecision, summarize } = require(path.join(__dirname, 'decision.cjs'))

const SOCK =
  process.env.DYNAMIC_ISLAND_SOCK ||
  `${process.env.XDG_RUNTIME_DIR || '/tmp'}/dynamic-island.sock`

const DEBUG_LOG = process.env.DYNAMIC_ISLAND_DEBUG_LOG
function debug(m) {
  if (!DEBUG_LOG) return
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${m}\n`)
  } catch {}
}

function emit(behavior) {
  // 'allow' | 'deny' => print decision; anything else => no-op (print nothing).
  const obj = buildDecision(behavior)
  if (obj) process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  debug(`INVOKED stdin=${raw.slice(0, 400)}`)
  let hook
  try {
    hook = JSON.parse(raw || '{}')
  } catch {
    debug('bad input -> noop')
    return emit('noop')
  }

  const request = {
    id: `${process.pid}-${Date.now()}`,
    toolName: hook.tool_name || 'unknown',
    inputSummary: summarize(hook.tool_input),
    cwd: hook.cwd,
  }

  const timer = setTimeout(() => {
    debug('timeout -> noop')
    emit('noop')
  }, 45000)

  const client = net.createConnection(SOCK, () => {
    client.write(JSON.stringify({ type: 'request', request }) + '\n')
  })

  let buf = ''
  client.on('data', (d) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      if (!line.trim()) continue
      const m = JSON.parse(line)
      if (m.type === 'decision') {
        clearTimeout(timer)
        debug(`decision ${m.decision}`)
        emit(m.decision)
      }
    }
  })
  client.on('error', (e) => {
    clearTimeout(timer)
    debug(`unreachable ${e && e.message} -> noop`)
    emit('noop')
  })
})
