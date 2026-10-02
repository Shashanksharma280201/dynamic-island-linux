#!/usr/bin/env node
// Claude Code PermissionRequest hook: forwards the request to the Dynamic
// Island over a unix socket and prints the user's decision. Fails open: on any
// problem it prints nothing and exits 0, so Claude shows its normal prompt.
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const { buildDecision, allowSuggestions, summarize } = require(
  path.join(__dirname, 'decision.cjs'),
)

const SOCK =
  process.env.DYNAMIC_ISLAND_SOCK ||
  (process.platform === 'win32'
    ? `\\\\.\\pipe\\dynamic-island-${(process.env.USERNAME || 'user').replace(/[^\w.-]/g, '_')}`
    : process.env.XDG_RUNTIME_DIR
    ? `${process.env.XDG_RUNTIME_DIR}/dynamic-island.sock`
    : `/tmp/dynamic-island-${process.getuid ? process.getuid() : 'user'}.sock`)

const TIMEOUT_MS = (Number(process.env.DYNAMIC_ISLAND_TIMEOUT) || 45) * 1000

const DEBUG_LOG = process.env.DYNAMIC_ISLAND_DEBUG_LOG
function debug(m) {
  if (!DEBUG_LOG) return
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${m}\n`)
  } catch {}
}

let done = false
function emit(reply, suggestions) {
  if (done) return
  done = true
  const obj = buildDecision(reply, suggestions)
  if (obj) process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

process.on('uncaughtException', (e) => {
  debug(`error ${e && e.message} -> noop`)
  emit(null)
})

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  debug(`INVOKED stdin=${raw.slice(0, 400)}`)
  let hook
  try {
    hook = JSON.parse(raw || '{}')
  } catch {
    debug('bad input -> noop')
    return emit(null)
  }

  const suggestions = allowSuggestions(hook.permission_suggestions)
  const request = {
    id: `${process.pid}-${Date.now()}`,
    toolName: hook.tool_name || 'unknown',
    inputSummary: summarize(hook.tool_input),
    toolInput: hook.tool_input,
    cwd: hook.cwd,
    suggestions,
    // Started from the island (no terminal to answer in).
    fromIsland: process.env.DYNAMIC_ISLAND_RUN === '1' || undefined,
  }

  setTimeout(() => {
    debug('timeout -> noop')
    emit(null)
  }, TIMEOUT_MS).unref()

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
      let m
      try {
        m = JSON.parse(line)
      } catch {
        continue
      }
      if (m && m.type === 'decision') {
        debug(`decision ${m.decision}`)
        emit(m, suggestions)
      }
    }
  })
  // Island closed the connection without deciding (e.g. it quit).
  client.on('close', () => emit(null))
  client.on('error', (e) => {
    debug(`unreachable ${e && e.message} -> noop`)
    emit(null)
  })
})
