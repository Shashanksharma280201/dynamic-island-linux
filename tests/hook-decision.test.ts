import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { buildDecision, allowSuggestions, summarize } = require('../hook/decision.cjs')

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

const SUGGESTION = {
  type: 'addRules',
  rules: [{ toolName: 'Bash', ruleContent: 'npm test' }],
  behavior: 'allow',
  destination: 'localSettings',
}

test('deny carries the reason as message', () => {
  expect(buildDecision({ decision: 'deny', message: 'use pnpm' })).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: 'use pnpm' },
    },
  })
})

test('always-allow echoes allow-rule suggestions as updatedPermissions', () => {
  const out = buildDecision({ decision: 'allow', always: true }, [
    SUGGESTION,
    { type: 'setMode', mode: 'bypassPermissions', destination: 'session' },
  ])
  expect(out.hookSpecificOutput.decision).toEqual({
    behavior: 'allow',
    updatedPermissions: [SUGGESTION],
  })
  // without always, no permissions are changed
  expect(buildDecision({ decision: 'allow' }, [SUGGESTION]).hookSpecificOutput.decision).toEqual(
    { behavior: 'allow' },
  )
})

test('allowSuggestions keeps only allow addRules entries', () => {
  expect(allowSuggestions(undefined)).toEqual([])
  expect(allowSuggestions([SUGGESTION, { type: 'addRules', behavior: 'deny', rules: [] }])).toEqual(
    [SUGGESTION],
  )
})
