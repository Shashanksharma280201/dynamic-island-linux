#!/usr/bin/env node
// Claude Code session hook (SessionStart, UserPromptSubmit, Pre/PostToolUse,
// Notification, Stop, SessionEnd): tells the Dynamic Island what the session
// is doing so it can show it live. Fire and forget: it never blocks or
// changes anything Claude does, prints nothing and always exits 0.
const net = require('node:net')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const SOCK =
  process.env.DYNAMIC_ISLAND_SOCK ||
  (process.env.XDG_RUNTIME_DIR
    ? `${process.env.XDG_RUNTIME_DIR}/dynamic-island.sock`
    : `/tmp/dynamic-island-${process.getuid ? process.getuid() : 'user'}.sock`)

const quit = () => process.exit(0)
process.on('uncaughtException', quit)
// Never hold Claude up, whatever happens.
setTimeout(quit, 1500).unref()

// Runs the island started itself show in its own Claude panel already.
if (process.env.DYNAMIC_ISLAND_RUN === '1') quit()

/** Long strings cut short, so a big Write doesn't travel twice. */
function trim(v, depth = 0) {
  if (typeof v === 'string') return v.length > 16000 ? v.slice(0, 16000) : v
  if (Array.isArray(v)) return depth > 3 ? [] : v.slice(0, 50).map((x) => trim(x, depth + 1))
  if (v && typeof v === 'object') {
    if (depth > 3) return {}
    const out = {}
    for (const [k, x] of Object.entries(v)) out[k] = trim(x, depth + 1)
    return out
  }
  return v
}

/** Claude's own process (the hook runs under a shell it started). */
function agentPid() {
  const parent = process.ppid
  try {
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${parent}/stat`, 'utf8')
      const comm = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'))
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
      return /^(sh|bash|dash|zsh|fish)$/.test(comm) && ppid > 1 ? ppid : parent
    }
    if (process.platform === 'darwin') {
      const [ppid, comm] = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(parent)], { encoding: 'utf8', timeout: 500 }).trim().split(/\s+/)
      return /(^|\/)-?(sh|bash|dash|zsh|fish)$/.test(comm) && Number(ppid) > 1 ? Number(ppid) : parent
    }
  } catch {}
  return undefined
}

/** The last thing Claude said, from the end of the transcript. */
function lastReply(transcript) {
  try {
    const fd = fs.openSync(transcript, 'r')
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, 256 * 1024)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    fs.closeSync(fd)
    const lines = buf.toString('utf8').split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      let m
      try {
        m = JSON.parse(lines[i])
      } catch {
        continue
      }
      if (m.type !== 'assistant' || !m.message) continue
      const content = m.message.content
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n') : ''
      if (text.trim()) return text.trim().slice(0, 4000)
    }
  } catch {}
  return undefined
}

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  let h
  try {
    h = JSON.parse(raw || '{}')
  } catch {
    return quit()
  }
  const event = h.hook_event_name
  const msg = {
    type: 'event',
    event: {
      event,
      agent: process.env.DI_AGENT || 'claude-code',
      sessionId: h.session_id,
      cwd: h.cwd,
      at: Date.now(),
    },
  }
  const e = msg.event
  if (event === 'UserPromptSubmit') e.prompt = typeof h.prompt === 'string' ? h.prompt.slice(0, 2000) : undefined
  if (event === 'PreToolUse' || event === 'PostToolUse') {
    e.tool = h.tool_name
    const res = h.tool_response && typeof h.tool_response === 'object' ? h.tool_response : {}
    if (event === 'PostToolUse' && Array.isArray(res.structuredPatch)) {
      // Claude's own diff: the inputs' old and new text aren't needed then.
      e.patch = trim(res.structuredPatch)
      e.created = res.type === 'create' || undefined
      const { content, old_string, new_string, edits, ...rest } = h.tool_input || {}
      e.input = trim(rest)
    } else {
      e.input = trim(h.tool_input)
    }
  }
  if (event === 'Notification') e.message = h.message
  if (event === 'Stop') e.final = (typeof h.last_assistant_message === 'string' && h.last_assistant_message) || lastReply(h.transcript_path)
  if (event === 'SessionStart' || event === 'UserPromptSubmit' || event === 'Stop') e.pid = agentPid()

  const client = net.createConnection(SOCK, () => client.end(JSON.stringify(msg) + '\n'))
  client.on('close', quit)
  client.on('error', quit)
})
