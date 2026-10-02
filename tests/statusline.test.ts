import { testSocket } from './testSocket'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'

const require = createRequire(import.meta.url)
const { usageFromStatus, ownStatusLine, applyInstall, applyUninstall, isInstalled } = require('../hook/statusline.cjs')

const STATUS = {
  model: { display_name: 'Opus 5' },
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
    seven_day: { used_percentage: 41.2, resets_at: 1738857600 },
  },
}

test('plan usage is read from the status line data', () => {
  expect(usageFromStatus(STATUS, 5)).toEqual({
    fiveHour: { pct: 23.5, resetsAt: 1738425600000 },
    sevenDay: { pct: 41.2, resetsAt: 1738857600000 },
    model: 'Opus 5',
    updatedAt: 5,
  })
  // API-key users and the first moments of a session carry no limits
  expect(usageFromStatus({ model: { display_name: 'x' } }, 1)).toBeNull()
  expect(usageFromStatus({ rate_limits: { five_hour: { used_percentage: 'lots' } } }, 1)).toBeNull()
  expect(usageFromStatus({ rate_limits: { seven_day: { used_percentage: 130 } } }, 1)?.sevenDay?.pct).toBe(100)
})

test('own status line when there was none', () => {
  expect(ownStatusLine(STATUS)).toBe('Opus 5 · session 24% · week 41%')
  expect(ownStatusLine({})).toBe('')
})

test('install keeps your status line and uninstall restores it', () => {
  const mine = { type: 'command', command: '~/bin/my-line.sh', padding: 2 }
  const { settings, previous } = applyInstall({ statusLine: mine, theme: 'dark' }, 'node "/x/claude-island-status.cjs"', null)
  expect(previous).toEqual(mine)
  expect(settings.statusLine).toEqual({ type: 'command', command: 'node "/x/claude-island-status.cjs"', padding: 2 })
  expect(settings.theme).toBe('dark')
  expect(isInstalled(settings)).toBe(true)
  // Installing again does not lose the saved one
  const again = applyInstall(settings, 'node "/y/claude-island-status.cjs"', previous)
  expect(again.previous).toEqual(mine)
  expect(applyUninstall(again.settings, again.previous)).toEqual({ statusLine: mine, theme: 'dark' })
  // With none before, uninstall removes it entirely
  const fresh = applyInstall({}, 'node "/x/claude-island-status.cjs"', null)
  expect(fresh.previous).toBeNull()
  expect(applyUninstall(fresh.settings, null)).toEqual({})
  // Someone else's status line is never touched by uninstall
  expect(applyUninstall({ statusLine: mine }, null)).toEqual({ statusLine: mine })
})

test('the bridge forwards usage to the island and runs your old status line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'di-sl-'))
  const sock = testSocket('di-status')
  const got: string[] = []
  const server = net.createServer((c) => c.on('data', (d) => got.push(d.toString())))
  await new Promise<void>((r) => server.listen(sock, r))
  writeFileSync(join(dir, 'dynamic-island-statusline.json'), JSON.stringify({ previous: { type: 'command', command: 'echo mine; cat >/dev/null' } }))
  const run = () =>
    new Promise<string>((resolve) => {
      const p = require('node:child_process').spawn('node', [join(__dirname, '../hook/claude-island-status.cjs')], {
        env: { ...process.env, DYNAMIC_ISLAND_SOCK: sock, CLAUDE_CONFIG_DIR: dir },
      })
      let out = ''
      p.stdout.on('data', (d: Buffer) => (out += d))
      p.on('close', () => resolve(out))
      p.stdin.end(JSON.stringify(STATUS))
    })
  expect(await run()).toBe('mine\n')
  await new Promise((r) => setTimeout(r, 100))
  const msg = JSON.parse(got.join('').trim())
  expect(msg.type).toBe('usage')
  expect(msg.usage.fiveHour.pct).toBe(23.5)
  server.close()
  // No island running and no old status line: still prints its own line
  const lone = spawnSync('node', [join(__dirname, '../hook/claude-island-status.cjs')], {
    input: JSON.stringify(STATUS),
    env: { ...process.env, DYNAMIC_ISLAND_SOCK: join(dir, 'none.sock'), CLAUDE_CONFIG_DIR: join(dir, 'empty') },
    timeout: 5000,
  })
  expect(lone.stdout.toString()).toBe('Opus 5 · session 24% · week 41%\n')
})

test('the installer CLI round-trips a real settings file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'di-sl2-'))
  const settings = join(dir, 'settings.json')
  writeFileSync(settings, JSON.stringify({ statusLine: { type: 'command', command: 'my-line' }, model: 'opus' }))
  const env = { ...process.env, CLAUDE_CONFIG_DIR: dir, DI_NODE_RUNNER: '/usr/bin/node' }
  execFileSync('node', [join(__dirname, '../hook/statusline.cjs')], { env })
  const on = JSON.parse(readFileSync(settings, 'utf8'))
  expect(on.statusLine.command).toMatch(/^\/usr\/bin\/node ".*claude-island-status\.cjs"$/)
  expect(on.model).toBe('opus')
  execFileSync('node', [join(__dirname, '../hook/statusline.cjs'), '--uninstall'], { env })
  expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ statusLine: { type: 'command', command: 'my-line' }, model: 'opus' })
  expect(existsSync(join(dir, 'dynamic-island-statusline.json'))).toBe(false)
})
