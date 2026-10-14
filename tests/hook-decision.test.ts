import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { buildDecision, allowSuggestions, answersFit, summarize } = require('../hook/decision.cjs')

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

const QUESTIONS = {
  questions: [
    { question: 'Which database?', header: 'DB', multiSelect: false, options: [{ label: 'Postgres', description: '' }, { label: 'SQLite', description: '' }] },
    { question: 'Which extras?', header: 'Extras', multiSelect: true, options: [{ label: 'Auth', description: '' }, { label: 'Billing', description: '' }] },
  ],
}

test('answers to Claude questions go back as the updated input', () => {
  const answers = { 'Which database?': 'SQLite', 'Which extras?': 'Auth, Billing' }
  const out = buildDecision({ decision: 'allow', answers }, [], { toolName: 'AskUserQuestion', toolInput: QUESTIONS })
  expect(out).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow', updatedInput: { ...QUESTIONS, answers } },
    },
  })
})

test('answers that do not fit the questions fall back to the terminal', () => {
  const ask = (answers: unknown) => buildDecision({ decision: 'allow', answers }, [], { toolName: 'AskUserQuestion', toolInput: QUESTIONS })
  expect(ask(undefined)).toBeNull() // Allow with no answers (e.g. the shortcut)
  expect(ask({ 'Which database?': 'SQLite' })).toBeNull() // one missing
  expect(ask({ 'Which database?': 'SQLite', 'Which extras?': '' })).toBeNull() // empty
  expect(ask({ 'Which database?': 'SQLite', 'Which extras?': 'Auth', Other: 'x' })).toBeNull() // extra
  expect(answersFit([], {})).toBe(false)
  // Other tools are unaffected by answers.
  expect(buildDecision({ decision: 'allow', answers: { a: 'b' } }, [], { toolName: 'Bash', toolInput: {} })!.hookSpecificOutput.decision).toEqual({ behavior: 'allow' })
})
