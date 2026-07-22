import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { buildDecision, summarize } = require('../hook/decision.cjs')

test('allow/deny build PermissionRequest hookSpecificOutput', () => {
  expect(buildDecision('allow')).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' },
    },
  })
  expect(buildDecision('deny')).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny' },
    },
  })
})

test('no-op returns null (print nothing, exit 0)', () => {
  expect(buildDecision('noop')).toBeNull()
  expect(buildDecision('ask')).toBeNull()
})

test('summarize prefers command then file_path', () => {
  expect(summarize({ command: 'rm -rf /' })).toBe('rm -rf /')
  expect(summarize({ file_path: '/a/b.txt' })).toBe('/a/b.txt')
  expect(summarize(undefined)).toBe('')
})
