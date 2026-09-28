#!/usr/bin/env node
// Install / remove the island's status line bridge in Claude Code's settings.
// A status line you already have keeps working: it is saved and run by the
// bridge, and restored when you remove the bridge.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MARK = 'claude-island-status'

const isOurs = (sl) => !!sl && JSON.stringify(sl).includes(MARK)

/**
 * Pure: the island's view of Claude Code status line data, or null when it
 * carries no plan limits (API-key users, or before the first reply).
 */
function usageFromStatus(data, now) {
  const rl = data && data.rate_limits
  if (!rl || typeof rl !== 'object') return null
  const win = (w) =>
    w && typeof w.used_percentage === 'number'
      ? {
          pct: Math.max(0, Math.min(100, w.used_percentage)),
          resetsAt: typeof w.resets_at === 'number' ? w.resets_at * 1000 : undefined,
        }
      : undefined
  const fiveHour = win(rl.five_hour)
  const sevenDay = win(rl.seven_day)
  if (!fiveHour && !sevenDay) return null
  return {
    fiveHour,
    sevenDay,
    model: (data.model && data.model.display_name) || undefined,
    updatedAt: now,
  }
}

/** Pure: the short status line shown when you had none before. */
function ownStatusLine(data) {
  const parts = []
  if (data && data.model && data.model.display_name) parts.push(data.model.display_name)
  const rl = (data && data.rate_limits) || {}
  if (rl.five_hour && typeof rl.five_hour.used_percentage === 'number')
    parts.push(`session ${Math.round(rl.five_hour.used_percentage)}%`)
  if (rl.seven_day && typeof rl.seven_day.used_percentage === 'number')
    parts.push(`week ${Math.round(rl.seven_day.used_percentage)}%`)
  return parts.join(' · ')
}

/**
 * Pure: settings with the bridge as the status line. Returns the new settings
 * and the status line to keep running (the one you had, if any). Idempotent.
 */
function applyInstall(settings, command, saved) {
  const s = JSON.parse(JSON.stringify(settings || {}))
  const current = s.statusLine
  const previous = isOurs(current) ? (saved || null) : current || null
  s.statusLine = { type: 'command', command }
  if (previous && typeof previous.padding === 'number') s.statusLine.padding = previous.padding
  return { settings: s, previous }
}

/** Pure: settings with the bridge removed and your old status line put back. */
function applyUninstall(settings, previous) {
  const s = JSON.parse(JSON.stringify(settings || {}))
  if (!isOurs(s.statusLine)) return s
  if (previous) s.statusLine = previous
  else delete s.statusLine
  return s
}

function isInstalled(settings) {
  return isOurs(settings && settings.statusLine)
}

/** Shell command running a script with `runner` (node, or Electron as node). */
function scriptCommand(scriptPath, runner) {
  return `${runner || 'node'} ${JSON.stringify(scriptPath)}`
}

function main() {
  const uninstall = process.argv.includes('--uninstall')
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const settingsPath = path.join(dir, 'settings.json')
  const savedPath = path.join(dir, 'dynamic-island-statusline.json')

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
  } else if (uninstall) {
    return
  } else {
    fs.mkdirSync(dir, { recursive: true })
  }
  let saved = null
  try {
    saved = JSON.parse(fs.readFileSync(savedPath, 'utf8')).previous || null
  } catch {}

  if (uninstall) {
    fs.writeFileSync(settingsPath, JSON.stringify(applyUninstall(current, saved), null, 2) + '\n')
    fs.rmSync(savedPath, { force: true })
    console.log(`Removed the island status line from ${settingsPath}`)
    return
  }
  const cmd = scriptCommand(path.resolve(__dirname, 'claude-island-status.cjs'), process.env.DI_NODE_RUNNER)
  const { settings, previous } = applyInstall(current, cmd, saved)
  fs.writeFileSync(savedPath, JSON.stringify({ previous }, null, 2) + '\n')
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log(`Installed the island status line -> ${cmd}`)
}

module.exports = { usageFromStatus, ownStatusLine, applyInstall, applyUninstall, isInstalled, scriptCommand }

if (require.main === module) main()
