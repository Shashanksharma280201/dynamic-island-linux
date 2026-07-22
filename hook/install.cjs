#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * Pure transform: return a new settings object with the island hook registered
 * on PermissionRequest and any prior island entries (old broken PreToolUse "*"
 * wiring included) removed. Idempotent; preserves unrelated hooks.
 */
function applyInstall(settings, hookCmd) {
  const s = JSON.parse(JSON.stringify(settings || {}))
  s.hooks = s.hooks || {}
  const stripIsland = (arr) =>
    (arr || []).filter((e) => !JSON.stringify(e).includes('claude-island-hook'))

  // Remove any island entry from the old (broken) PreToolUse wiring.
  const pre = stripIsland(s.hooks.PreToolUse)
  if (pre.length > 0) s.hooks.PreToolUse = pre
  else delete s.hooks.PreToolUse

  // Register on PermissionRequest (fires only when Claude needs permission).
  s.hooks.PermissionRequest = stripIsland(s.hooks.PermissionRequest)
  s.hooks.PermissionRequest.push({
    matcher: '.*',
    hooks: [{ type: 'command', command: hookCmd, timeout: 60 }],
  })
  return s
}

function main() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  const hookCmd = `node ${path.resolve(__dirname, 'claude-island-hook.cjs')}`
  const current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  fs.writeFileSync(settingsPath + '.bak', JSON.stringify(current, null, 2))
  const next = applyInstall(current, hookCmd)
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2))
  console.log('Installed island hook on PermissionRequest (matcher ".*") ->', hookCmd)
  console.log('Backup at', settingsPath + '.bak')
}

module.exports = { applyInstall }

if (require.main === module) main()
