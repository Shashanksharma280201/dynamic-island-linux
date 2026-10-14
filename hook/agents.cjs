#!/usr/bin/env node
// Show other coding agents' sessions on the island (Codex, Gemini CLI, Cursor
// Agent): registers the island's session hook in each one's own hook file.
//   node agents.cjs <codex|gemini|cursor>               install
//   node agents.cjs <codex|gemini|cursor> --uninstall   remove
// Like install.cjs: backs the file up, refuses one that isn't valid JSON, and
// only ever touches the island's own entries.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SCRIPT = 'claude-island-hook-events.cjs'

/**
 * Each agent's hook file and events. `groups` agents take Claude-style
 * `{ matcher?, hooks: [{ type, command, timeout }] }` entries; `flat` ones a
 * plain `{ command }`. `as` is the event the island reports when the agent
 * doesn't say it in its input.
 */
const AGENTS = {
  codex: {
    name: 'Codex',
    file: (home) => path.join(home, '.codex', 'hooks.json'),
    style: 'groups',
    events: [
      { event: 'SessionStart', timeout: 10 },
      { event: 'UserPromptSubmit', timeout: 10 },
      { event: 'PreToolUse', timeout: 10 },
      { event: 'PostToolUse', timeout: 10 },
      { event: 'Stop', timeout: 10 },
      { event: 'SessionEnd', timeout: 3 },
    ],
    note: 'Codex runs new hooks once you trust them: start Codex and review them with /hooks.',
  },
  gemini: {
    name: 'Gemini CLI',
    file: (home) => path.join(home, '.gemini', 'settings.json'),
    style: 'groups',
    matcher: '*',
    events: [
      { event: 'SessionStart', as: 'SessionStart', timeout: 10000 },
      { event: 'SessionEnd', as: 'SessionEnd', timeout: 10000 },
      { event: 'BeforeAgent', as: 'UserPromptSubmit', timeout: 5000 },
      { event: 'BeforeTool', as: 'PreToolUse', timeout: 5000 },
      { event: 'AfterTool', as: 'PostToolUse', timeout: 5000 },
      { event: 'AfterAgent', as: 'Stop', timeout: 5000 },
    ],
    note: 'Start a new Gemini CLI session to pick the hooks up.',
  },
  cursor: {
    name: 'Cursor Agent',
    file: (home) => path.join(home, '.cursor', 'hooks.json'),
    style: 'flat',
    events: ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt', 'preToolUse', 'postToolUse', 'stop'].map((event) => ({ event })),
    note: 'Start a new Cursor Agent session to pick the hooks up.',
  },
}

/** The command an agent runs for one event. */
function agentCommand(id, runner, hookPath, as) {
  return `${runner || 'node'} ${JSON.stringify(hookPath)} --agent ${id}${as ? ` ${as}` : ''}`
}

const ours = (command, id) => typeof command === 'string' && command.includes(SCRIPT) && command.includes(`--agent ${id}`)

/** Entries for `id` taken out of one event's list (a group left empty goes). Pure. */
function withoutOurs(list, id) {
  return (Array.isArray(list) ? list : []).flatMap((g) => {
    if (!g || typeof g !== 'object') return [g]
    if (ours(g.command, id)) return []
    if (!Array.isArray(g.hooks)) return [g]
    const kept = g.hooks.filter((h) => !ours(h && h.command, id))
    if (kept.length === g.hooks.length) return [g]
    return kept.length ? [{ ...g, hooks: kept }] : []
  })
}

/** Pure: settings without the island's entries for `id`; empty lists and `hooks` go. */
function applyAgentUninstall(id, settings) {
  const s = JSON.parse(JSON.stringify(settings || {}))
  if (!s.hooks || typeof s.hooks !== 'object') return s
  for (const event of Object.keys(s.hooks)) {
    if (!Array.isArray(s.hooks[event])) continue
    const kept = withoutOurs(s.hooks[event], id)
    if (kept.length) s.hooks[event] = kept
    else delete s.hooks[event]
  }
  if (!Object.keys(s.hooks).length) delete s.hooks
  return s
}

/** Pure: settings with the island's session hook registered for `id`. Idempotent. */
function applyAgentInstall(id, settings, runner, hookPath) {
  const a = AGENTS[id]
  if (!a) throw new Error(`unknown agent ${id}`)
  const s = applyAgentUninstall(id, settings)
  if (s.hooks !== undefined && (typeof s.hooks !== 'object' || Array.isArray(s.hooks))) throw new Error('"hooks" is not an object')
  s.hooks = s.hooks || {}
  for (const e of a.events) {
    const command = agentCommand(id, runner, hookPath, e.as)
    const entry =
      a.style === 'flat'
        ? { command }
        : { ...(a.matcher ? { matcher: a.matcher } : {}), hooks: [{ type: 'command', command, timeout: e.timeout }] }
    s.hooks[e.event] = [...(Array.isArray(s.hooks[e.event]) ? s.hooks[e.event] : []), entry]
  }
  if (a.style === 'flat' && s.version === undefined) s.version = 1
  return s
}

/** Whether the island's hook is registered for `id` in these settings. Pure. */
function agentInstalled(id, settings) {
  const hooks = settings && settings.hooks
  if (!hooks || typeof hooks !== 'object') return false
  return Object.values(hooks).some(
    (list) => Array.isArray(list) && list.some((g) => g && (ours(g.command, id) || (Array.isArray(g.hooks) && g.hooks.some((h) => ours(h && h.command, id))))),
  )
}

function main() {
  const id = process.argv[2]
  const uninstall = process.argv.includes('--uninstall')
  const a = AGENTS[id]
  if (!a) {
    console.error(`Usage: agents.cjs <${Object.keys(AGENTS).join('|')}> [--uninstall]`)
    process.exit(2)
  }
  const file = a.file(process.env.DI_HOME || os.homedir())
  let current = {}
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
    try {
      current = raw.trim() ? JSON.parse(raw) : {}
    } catch (e) {
      console.error(`Refusing to modify ${file}: it is not valid JSON (${e.message}).`)
      process.exit(1)
    }
    fs.writeFileSync(file + '.bak', raw)
  } else if (uninstall) {
    console.log(`Nothing to do: ${file} does not exist.`)
    return
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }
  const next = uninstall ? applyAgentUninstall(id, current) : applyAgentInstall(id, current, process.env.DI_NODE_RUNNER, path.resolve(__dirname, SCRIPT))
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
  console.log(uninstall ? `Removed the island's ${a.name} hooks from ${file}` : `Installed the island's ${a.name} hooks in ${file}. ${a.note}`)
}

module.exports = { AGENTS, agentCommand, applyAgentInstall, applyAgentUninstall, agentInstalled }

if (require.main === module) main()
