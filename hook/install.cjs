#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MARK = 'claude-island-hook'

function stripIsland(arr) {
  return (arr || []).filter((e) => !JSON.stringify(e).includes(MARK))
}

/** Drop an event list entirely when it ends up empty. */
function setOrDelete(hooks, event, arr) {
  if (arr.length > 0) hooks[event] = arr
  else delete hooks[event]
}

/**
 * Pure transform: return a new settings object with every island hook entry
 * removed (old broken PreToolUse "*" wiring included). Preserves unrelated hooks.
 */
function applyUninstall(settings) {
  const s = JSON.parse(JSON.stringify(settings || {}))
  if (!s.hooks) return s
  for (const event of Object.keys(s.hooks)) {
    if (Array.isArray(s.hooks[event])) setOrDelete(s.hooks, event, stripIsland(s.hooks[event]))
  }
  if (Object.keys(s.hooks).length === 0) delete s.hooks
  return s
}

/**
 * Pure transform: return a new settings object with the island hook registered
 * on PermissionRequest and any prior island entries removed. Idempotent;
 * preserves unrelated hooks.
 */
function applyInstall(settings, hookCmd) {
  const s = applyUninstall(settings)
  s.hooks = s.hooks || {}
  s.hooks.PermissionRequest = s.hooks.PermissionRequest || []
  s.hooks.PermissionRequest.push({
    matcher: '.*',
    hooks: [{ type: 'command', command: hookCmd, timeout: 60 }],
  })
  return s
}

/** Shell command that runs the hook; the path is quoted so spaces are safe. */
function hookCommand(hookPath) {
  return `node ${JSON.stringify(hookPath)}`
}

function main() {
  const uninstall = process.argv.includes('--uninstall')
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const settingsPath = path.join(dir, 'settings.json')

  let current = {}
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    try {
      current = raw.trim() ? JSON.parse(raw) : {}
    } catch (e) {
      console.error(`Refusing to modify ${settingsPath}: it is not valid JSON (${e.message}).`)
      process.exit(1)
    }
    fs.writeFileSync(settingsPath + '.bak', raw)
    console.log('Backup at', settingsPath + '.bak')
  } else if (uninstall) {
    console.log(`Nothing to do: ${settingsPath} does not exist.`)
    return
  } else {
    fs.mkdirSync(dir, { recursive: true })
  }

  const hookCmd = hookCommand(path.resolve(__dirname, 'claude-island-hook.cjs'))
  const next = uninstall ? applyUninstall(current) : applyInstall(current, hookCmd)
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2) + '\n')
  console.log(
    uninstall
      ? `Removed the island hook from ${settingsPath}`
      : `Installed island hook on PermissionRequest (matcher ".*") -> ${hookCmd}`,
  )
}

module.exports = { applyInstall, applyUninstall, hookCommand }

if (require.main === module) main()
