#!/usr/bin/env node
// Claude Code status line bridge. Claude Code runs this with session data as
// JSON on stdin (see https://code.claude.com/docs/en/statusline). It forwards
// your plan usage (5-hour and weekly limits) to the Dynamic Island, then shows
// the status line you had before, or a short one of its own.
// Never fails loudly: the status line must always print something quickly.
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { usageFromStatus, ownStatusLine } = require(path.join(__dirname, 'statusline.cjs'))

const SOCK =
  process.env.DYNAMIC_ISLAND_SOCK ||
  (process.env.XDG_RUNTIME_DIR
    ? `${process.env.XDG_RUNTIME_DIR}/dynamic-island.sock`
    : `/tmp/dynamic-island-${process.getuid ? process.getuid() : 'user'}.sock`)
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const PREVIOUS = path.join(CONFIG_DIR, 'dynamic-island-statusline.json')

function forward(usage) {
  return new Promise((resolve) => {
    if (!usage) return resolve()
    const c = net.createConnection(SOCK, () => c.end(JSON.stringify({ type: 'usage', usage }) + '\n'))
    c.on('close', resolve)
    c.on('error', resolve)
    setTimeout(() => (c.destroy(), resolve()), 400).unref()
  })
}

/** Run the status line command you had before, feeding it the same input. */
function previous(raw) {
  let prev
  try {
    prev = JSON.parse(fs.readFileSync(PREVIOUS, 'utf8')).previous
  } catch {
    return Promise.resolve(null)
  }
  if (!prev || typeof prev.command !== 'string' || !prev.command) return Promise.resolve(null)
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('sh', ['-c', prev.command], { stdio: ['pipe', 'pipe', 'ignore'] })
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => resolve(out))
    p.on('error', () => resolve(null))
    p.stdin.on('error', () => {})
    p.stdin.end(raw)
    setTimeout(() => (p.kill(), resolve(out)), 5000).unref()
  })
}

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', async () => {
  let data = {}
  try {
    data = JSON.parse(raw || '{}')
  } catch {}
  const [, prevOut] = await Promise.all([forward(usageFromStatus(data, Date.now())), previous(raw)])
  process.stdout.write(prevOut !== null ? prevOut : ownStatusLine(data) + '\n')
  process.exit(0)
})
