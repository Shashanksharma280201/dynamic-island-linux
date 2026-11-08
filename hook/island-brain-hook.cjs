#!/usr/bin/env node
// The second brain's Claude Code hook (Settings → Brain → Claude Code).
// SessionStart: gives Claude this project's page, its last sessions and your
// open promises from the brain, as context. SessionEnd: leaves the finished
// session in the brain's queue, so the Dynamic Island files a note about it
// (now, or when it next runs). Reads only the brain folder, never 08-restricted.
// Never holds Claude up and never fails: it exits 0 whatever happens.
const fs = require('node:fs')
const path = require('node:path')

const quit = () => process.exit(0)
process.on('uncaughtException', quit)
setTimeout(quit, 4000).unref()

// Runs the island starts for its own work (like writing these notes).
if (process.env.DI_BRAIN_SKIP === '1') quit()

const argv = process.argv.slice(2)
const at = argv.indexOf('--vault')
const VAULT = (at >= 0 && argv[at + 1]) || process.env.DI_BRAIN_VAULT || ''

const MAX = 4000

/** Same as slugify() in shared/brain.ts: the brain's file names. */
function slugify(s, max = 60) {
  const out = String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return out || 'note'
}

/** Same as projectOf() in shared/brain.ts: the git root's name, else the folder's. */
function projectOf(cwd) {
  const clean = String(cwd).replace(/\/+$/, '') || '/'
  let dir = clean
  for (let i = 0; i < 40 && dir && dir !== '/'; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return slugify(path.basename(dir), 80)
    dir = path.dirname(dir)
  }
  return slugify(path.basename(clean) || 'home', 80)
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(VAULT, rel), 'utf8')
  } catch {
    return ''
  }
}

function body(text) {
  return text
    .replace(/^﻿/, '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function list(rel) {
  try {
    return fs.readdirSync(path.join(VAULT, rel)).filter((n) => n.endsWith('.md'))
  } catch {
    return []
  }
}

/** This project's page, last sessions and the open promises, for Claude. */
function context(cwd) {
  const name = projectOf(cwd)
  const dir = `02-projects/${name}`
  const parts = []
  const page = body(read(`${dir}/${name}.md`))
  if (page) parts.push(`## Project page (${dir}/${name}.md)\n\n${page.slice(0, 1600)}${page.length > 1600 ? '\n…' : ''}`)
  const sessions = [
    ...list(`${dir}/sessions`).map((n) => `${dir}/sessions/${n}`),
    ...list('01-inbox')
      .filter((n) => n.includes(`-session-${name}-`))
      .map((n) => `01-inbox/${n}`),
  ]
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)))
    .slice(0, 3)
  if (sessions.length) {
    const notes = sessions.map((rel) => {
      const b = body(read(rel))
      const title = (/^#\s+(.+)$/m.exec(b) || [])[1] || path.basename(rel, '.md')
      const lines = b.split('\n').filter((l) => /^- \w+:/.test(l))
      return `### ${title} (${path.basename(rel).slice(0, 10)})\n${lines.join('\n')}`
    })
    parts.push(`## Last sessions here\n\n${notes.join('\n\n')}`)
  }
  const promises = read('07-world-model/ledgers/promises.md')
    .split('\n')
    .filter((l) => l.startsWith('- [ ]'))
    .slice(-5)
  if (promises.length) parts.push(`## Open promises\n\n${promises.join('\n')}`)
  const head = parts.length
    ? `From my second brain (${VAULT}), for this project (${name}). Search it with the brain tools for more; add what you learn about me or this work to its inbox.`
    : `My second brain is at ${VAULT}, but it has nothing on this project (${name}) yet. If you learn something worth keeping about me or this work, add it to the brain's inbox with its capture tool.`
  const text = [head, ...parts].join('\n\n')
  return text.length > MAX ? text.slice(0, MAX - 1) + '…' : text
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
  if (!VAULT || !fs.existsSync(path.join(VAULT, '_system'))) return quit()
  const event = h.hook_event_name
  const cwd = typeof h.cwd === 'string' && h.cwd ? h.cwd : process.cwd()
  const inVault = cwd === VAULT || cwd.startsWith(VAULT.replace(/\/+$/, '') + '/')
  if (event === 'SessionEnd') {
    if (inVault || typeof h.transcript_path !== 'string' || typeof h.session_id !== 'string') return quit()
    const id = h.session_id.replace(/[^\w-]/g, '').slice(0, 80)
    if (!id) return quit()
    const dir = path.join(VAULT, '_system', 'queue')
    fs.mkdirSync(dir, { recursive: true })
    const job = { session_id: h.session_id, transcript_path: h.transcript_path, cwd, reason: h.reason, at: Date.now() }
    const tmp = path.join(dir, `.${id}.tmp`)
    fs.writeFileSync(tmp, JSON.stringify(job))
    fs.renameSync(tmp, path.join(dir, `${id}.json`))
    return quit()
  }
  if (event === 'SessionStart') {
    if (inVault) return quit()
    // Exit once it's written (pipes can be asynchronous).
    return void process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context(cwd) } }), quit)
  }
  quit()
})
