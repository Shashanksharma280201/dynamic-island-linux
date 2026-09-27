import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { applyInstall, applyUninstall, hookCommand } = require('../hook/install.cjs')

const CMD = 'node /abs/hook/claude-island-hook.cjs'

test('removes the old broken PreToolUse island entry', () => {
  const before = {
    hooks: {
      PreToolUse: [
        { matcher: 'Glob|Grep', hooks: [{ type: 'command', command: 'other' }] },
        { matcher: '*', hooks: [{ type: 'command', command: 'node /x/claude-island-hook.cjs' }] },
      ],
    },
  }
  const after = applyInstall(before, CMD)
  // unrelated PreToolUse hook preserved, island one gone
  expect(after.hooks.PreToolUse).toHaveLength(1)
  expect(JSON.stringify(after.hooks.PreToolUse)).not.toContain('claude-island-hook')
})

test('registers PermissionRequest with matcher .* and timeout 60', () => {
  const after = applyInstall({}, CMD)
  const entry = after.hooks.PermissionRequest.find((e: any) =>
    JSON.stringify(e).includes('claude-island-hook'),
  )
  expect(entry.matcher).toBe('.*')
  expect(entry.hooks[0].command).toBe(CMD)
  expect(entry.hooks[0].timeout).toBe(60)
})

test('is idempotent (no duplicate island entries)', () => {
  const once = applyInstall({}, CMD)
  const twice = applyInstall(once, CMD)
  const count = twice.hooks.PermissionRequest.filter((e: any) =>
    JSON.stringify(e).includes('claude-island-hook'),
  ).length
  expect(count).toBe(1)
})

test('applyUninstall removes island entries and empty event lists only', () => {
  const installed = applyInstall(
    { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep' }] }] }, model: 'x' },
    CMD,
  )
  const after = applyUninstall(installed)
  expect(after.hooks.PermissionRequest).toBeUndefined()
  expect(after.hooks.Stop).toHaveLength(1)
  expect(after.model).toBe('x')
  expect(applyUninstall(applyInstall({}, CMD))).toEqual({})
})

test('hookCommand quotes paths with spaces', () => {
  expect(hookCommand('/home/a b/hook.cjs')).toBe('node "/home/a b/hook.cjs"')
})

test('installer creates settings.json when missing and uninstalls cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-install-'))
  const run = (...args: string[]) =>
    execFileSync('node', ['hook/install.cjs', ...args], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
    })
  run()
  const file = path.join(dir, 'settings.json')
  expect(JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')))).toContain(
    'claude-island-hook',
  )
  run('--uninstall')
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({})
})
