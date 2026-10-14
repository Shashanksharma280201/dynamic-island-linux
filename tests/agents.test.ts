import { createRequire } from 'node:module'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createDecoder } from '@shared/protocol'
import { applyEvent, canonicalTool, type AgentEvent } from '../shared/sessions'
import { parseQuestions, questionAnswer } from '../shared/questions'
const require = createRequire(import.meta.url)
const { AGENTS, applyAgentInstall, applyAgentUninstall, agentInstalled } = require('../hook/agents.cjs')

const HOOK = '/opt/island/hook/claude-island-hook-events.cjs'

test('Codex: Claude-style groups without a matcher, timeouts in seconds', () => {
  const mine = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }] } }
  const s = applyAgentInstall('codex', mine, 'node', HOOK)
  expect(s.hooks.PreToolUse).toEqual([{ hooks: [{ type: 'command', command: `node "${HOOK}" --agent codex`, timeout: 10 }] }])
  expect(s.hooks.Stop).toHaveLength(2)
  expect(agentInstalled('codex', s)).toBe(true)
  expect(agentInstalled('gemini', s)).toBe(false)
  expect(applyAgentInstall('codex', s, 'node', HOOK).hooks.Stop).toHaveLength(2) // idempotent
  expect(applyAgentUninstall('codex', s)).toEqual(mine)
})

test('Gemini CLI: its own event names, the island event on the command line, a * matcher', () => {
  const s = applyAgentInstall('gemini', { theme: 'dark' }, 'node', HOOK)
  expect(Object.keys(s.hooks).sort()).toEqual(['AfterAgent', 'AfterTool', 'BeforeAgent', 'BeforeTool', 'SessionEnd', 'SessionStart'])
  expect(s.hooks.BeforeTool[0]).toEqual({ matcher: '*', hooks: [{ type: 'command', command: `node "${HOOK}" --agent gemini PreToolUse`, timeout: 5000 }] })
  expect(s.theme).toBe('dark')
  expect(applyAgentUninstall('gemini', s)).toEqual({ theme: 'dark' })
})

test('Cursor: flat entries and a version', () => {
  const s = applyAgentInstall('cursor', { hooks: { afterFileEdit: [{ command: './format.sh' }] } }, 'node', HOOK)
  expect(s.version).toBe(1)
  expect(s.hooks.preToolUse).toEqual([{ command: `node "${HOOK}" --agent cursor` }])
  expect(s.hooks.afterFileEdit).toEqual([{ command: './format.sh' }])
  expect(applyAgentUninstall('cursor', s)).toEqual({ hooks: { afterFileEdit: [{ command: './format.sh' }] }, version: 1 })
  expect(Object.keys(AGENTS)).toEqual(['codex', 'gemini', 'cursor'])
})

test('the installer writes the file, backs it up and removes itself', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-agents-'))
  const run = (...a: string[]) => execFileSync('node', ['hook/agents.cjs', ...a], { env: { ...process.env, DI_HOME: home } }).toString()
  fs.mkdirSync(path.join(home, '.gemini'))
  fs.writeFileSync(path.join(home, '.gemini/settings.json'), '{"theme":"dark"}')
  expect(run('gemini')).toContain('Gemini CLI')
  const file = JSON.parse(fs.readFileSync(path.join(home, '.gemini/settings.json'), 'utf8'))
  expect(file.hooks.AfterAgent[0].hooks[0].command).toContain('--agent gemini Stop')
  expect(fs.readFileSync(path.join(home, '.gemini/settings.json.bak'), 'utf8')).toBe('{"theme":"dark"}')
  run('gemini', '--uninstall')
  expect(JSON.parse(fs.readFileSync(path.join(home, '.gemini/settings.json'), 'utf8'))).toEqual({ theme: 'dark' })
  run('codex')
  expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(true)
  fs.mkdirSync(path.join(home, '.cursor'))
  fs.writeFileSync(path.join(home, '.cursor/hooks.json'), '{ not json')
  expect(() => run('cursor')).toThrow()
})

/** Run the session hook as another agent would; resolves to what the island got. */
async function asAgent(args: string[], input: object, env: Record<string, string> = {}): Promise<any[]> {
  const got: any[] = []
  const sock = path.join(os.tmpdir(), `di-ag-${process.pid}-${Math.random()}.sock`)
  const server = net.createServer((socket) => {
    const decode = createDecoder()
    socket.on('data', (c) => got.push(...(decode(c) as any[])))
  })
  await new Promise<void>((r) => server.listen(sock, r))
  await new Promise<void>((resolve) => {
    const p = spawn('node', ['hook/claude-island-hook-events.cjs', ...args], { env: { ...process.env, DYNAMIC_ISLAND_SOCK: sock, ...env } })
    p.on('close', () => resolve())
    p.stdin.end(JSON.stringify(input))
  })
  await new Promise((r) => setTimeout(r, 50))
  await new Promise<void>((r) => server.close(() => r()))
  return got.map((m) => m.event)
}

test('the session hook reads Gemini CLI, Cursor and Copilot-style input', async () => {
  const [g] = await asAgent(['--agent', 'gemini', 'PreToolUse'], { hook_event_name: 'BeforeTool', session_id: 'g1', cwd: '/w/app', tool_name: 'read_file', tool_input: { absolute_path: '/w/app/a.ts' } })
  expect(g).toMatchObject({ event: 'PreToolUse', agent: 'gemini', sessionId: 'g1', tool: 'read_file' })
  const [c] = await asAgent(['--agent', 'cursor'], { hook_event_name: 'beforeSubmitPrompt', conversation_id: 'c1', workspace_roots: ['/w/site'], prompt: 'add a footer' })
  expect(c).toMatchObject({ event: 'UserPromptSubmit', agent: 'cursor', sessionId: 'c1', cwd: '/w/site', prompt: 'add a footer' })
  const [x] = await asAgent(['--agent', 'copilot'], { hook_event_name: 'preToolUse', sessionId: 'x1', workdir: '/w/x', toolName: 'bash', toolArgs: '{"command":"npm test"}' })
  expect(x).toMatchObject({ event: 'PreToolUse', sessionId: 'x1', cwd: '/w/x', tool: 'bash', input: { command: 'npm test' } })
  const [stop] = await asAgent(['--agent', 'gemini', 'Stop'], { hook_event_name: 'AfterAgent', session_id: 'g1', prompt_response: 'All set.' })
  expect(stop).toMatchObject({ event: 'Stop', final: 'All set.' })
})

test("other agents' tools read like Claude's", () => {
  expect(canonicalTool('read_file', { absolute_path: '/a/b.ts' })).toEqual({ tool: 'Read', input: { absolute_path: '/a/b.ts', file_path: '/a/b.ts' } })
  expect(canonicalTool('shell', { command: ['bash', '-lc', 'npm test'] }).input?.command).toBe('npm test')
  expect(canonicalTool('Bash').tool).toBe('Bash')
  const ev = (e: Partial<AgentEvent>): AgentEvent => ({ event: 'PreToolUse', agent: 'gemini', sessionId: 'g', at: 1, cwd: '/w/app', ...e })
  let all = applyEvent({}, ev({ tool: 'run_shell_command', input: { command: 'npm run build' } }))
  expect(all.g.steps[0].label).toBe('Running npm run build')
  all = applyEvent(all, ev({ tool: 'replace', input: { file_path: '/w/app/x.ts', old_string: 'a', new_string: 'b\nc' } }))
  all = applyEvent(all, ev({ event: 'PostToolUse', tool: 'replace', input: { file_path: '/w/app/x.ts', old_string: 'a', new_string: 'b\nc' } }))
  expect([all.g.added, all.g.removed, all.g.files[0].file]).toEqual([2, 1, '/w/app/x.ts'])
})

test('questions: parsed only when they can be answered, answers joined', () => {
  const q = parseQuestions({ questions: [{ question: 'Pick?', header: 'H', multiSelect: true, options: [{ label: 'A' }, { label: 'B', description: 'bee' }] }] })!
  expect(q[0].options[1]).toEqual({ label: 'B', description: 'bee' })
  expect(questionAnswer(q[0], ['B', 'A'], '')).toBe('A, B') // in the options' order
  expect(questionAnswer(q[0], ['A'], 'my own')).toBe('A, my own')
  expect(questionAnswer(q[0], [], '  ')).toBeNull()
  expect(questionAnswer({ ...q[0], multiSelect: false }, [], 'typed')).toBe('typed')
  expect(parseQuestions({ questions: [] })).toBeNull()
  expect(parseQuestions({ questions: [{ question: 'Same', options: [{ label: 'x' }] }, { question: 'Same', options: [{ label: 'y' }] }] })).toBeNull()
  expect(parseQuestions({ questions: [{ question: 'No options', options: [] }] })).toBeNull()
})
