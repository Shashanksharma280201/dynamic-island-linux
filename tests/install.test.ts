import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { applyInstall } = require('../hook/install.cjs')

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
