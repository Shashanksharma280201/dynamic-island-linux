import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeCode, claudeArgs, failureText, launchOf } from '../electron/claudeCode'
import type { ClaudeState } from '../shared/claude'

const FAKE = join(__dirname, '../e2e/fake-claude.cjs')

function service(opts: { hook?: string; binary?: string | null } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'di-cc-'))) // macOS: /var is /private/var
  const log = join(dir, 'args.log')
  process.env.DI_FAKE_CLAUDE_LOG = log
  const states: ClaudeState[] = []
  const finished: any[] = []
  const usages: any[] = []
  const cc = new ClaudeCode({
    config: () => ({ cwd: dir, permissionMode: 'default', voiceShortcut: true, sttModel: 'base', binary: '' }),
    findBinary: () => (opts.binary === undefined ? FAKE : opts.binary),
    hookCommand: () => opts.hook,
    approvalsInstalled: () => false,
    usageBridgeInstalled: () => false,
    socketPath: join(dir, 'none.sock'),
    dataDir: dir,
    onChange: (s) => states.push(s),
    onUsage: (u) => usages.push(u),
    onFinished: (r) => finished.push(r),
  })
  const done = () => new Promise<any>((resolve) => { const t = setInterval(() => finished.length && (clearInterval(t), resolve(finished.shift())), 20) })
  return { cc, dir, log, states, usages, done, args: () => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) }
}

test('arguments for a turn', () => {
  const a = claudeArgs({ prompt: 'fix it', permissionMode: 'default' })
  expect(a.slice(0, 6)).toEqual(['-p', 'fix it', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'])
  expect(a).not.toContain('--resume')
  expect(a).not.toContain('--permission-mode')
  const b = claudeArgs({ prompt: 'x', sessionId: 's1', permissionMode: 'acceptEdits', hookCommand: 'node "/h.cjs"' })
  expect(b.slice(b.indexOf('--resume'), b.indexOf('--resume') + 2)).toEqual(['--resume', 's1'])
  expect(b.slice(b.indexOf('--permission-mode'), b.indexOf('--permission-mode') + 2)).toEqual(['--permission-mode', 'acceptEdits'])
  expect(JSON.parse(b[b.indexOf('--settings') + 1]).hooks.PermissionRequest[0].hooks[0].command).toBe('node "/h.cjs"')
})

test('failure messages people can act on', () => {
  expect(failureText(1, 'Error: No conversation found with session ID: x', 'claude')).toMatch(/conversation is gone/)
  expect(failureText(1, 'Please run /login to authenticate', 'claude')).toMatch(/isn't logged in/)
  expect(failureText(127, '', '/usr/bin/claude')).toBe("Couldn't run /usr/bin/claude. Is Claude Code installed?")
  expect(failureText(2, 'a\nb\nlast words\n', 'c')).toBe('a b last words')
})

test('a turn runs, streams, and follow-ups continue the conversation', async () => {
  const s = service()
  s.cc.ask('check the readme')
  expect(s.cc.busy).toBe(true)
  expect(() => s.cc.ask('again')).toThrow(/still working/)
  const r = await s.done()
  expect(r.phase).toBe('done')
  expect(r.reply).toBe('Done: check the readme')
  expect(r.steps).toBe(1)
  expect(r.costUsd).toBe(0.0123)
  // Usage from the stream's rate_limit_event
  expect(s.usages[0].fiveHour.pct).toBeCloseTo(37)
  // Saw it working along the way
  const phases = s.states.map((x) => x.run?.phase)
  expect(phases).toContain('tool')
  expect(phases).toContain('writing')
  const first = s.args()[0]
  expect(first.cwd).toBe(s.dir)
  expect(first.args).not.toContain('--resume')

  s.cc.ask('and now the tests')
  const r2 = await s.done()
  expect(r2.reply).toMatch(/continuing fake-session-\d+/)
  expect(s.args()[1].args).toContain('--resume')
  expect(s.cc.state().turns.map((t) => t.prompt)).toEqual(['check the readme', 'and now the tests'])

  // Remembered across restarts
  const again = new ClaudeCode({ ...(s.cc as any).d })
  expect(again.state().turns.length).toBe(2)
  expect(again.state().sessionId).toMatch(/^fake-session-/)
  expect(again.state().usage?.fiveHour?.pct).toBeCloseTo(37)

  s.cc.newConversation()
  expect(s.cc.state().turns).toEqual([])
  s.cc.ask('fresh start')
  await s.done()
  expect(s.args()[2].args).not.toContain('--resume')
})

test('errors, stop, and a missing claude command', async () => {
  const s = service()
  s.cc.ask('please fail')
  const r = await s.done()
  expect(r.phase).toBe('error')
  expect(r.error).toBe('Error: something broke in the fake')

  s.cc.ask('something slow')
  await new Promise((res) => setTimeout(res, 400))
  s.cc.stop()
  const st = await s.done()
  expect(st.phase).toBe('stopped')
  expect(s.cc.busy).toBe(false)
  expect(s.cc.state().turns.at(-1)?.reply).toBe('Stopped.')

  const none = service({ binary: null })
  expect(() => none.cc.ask('hi')).toThrow(/isn.t installed/)
  expect(() => none.cc.ask('   ')).toThrow(/Say or type/)
})

test('approvals go through the island hook for runs from the island', async () => {
  const s = service({ hook: `node ${JSON.stringify(join(__dirname, '../hook/claude-island-hook.cjs'))}` })
  // No island listening on the socket: the hook fails open (no decision)
  s.cc.ask('this needs approval')
  const r = await s.done()
  expect(r.reply).toMatch(/^Bash was no-decision\./)
  writeFileSync(join(s.dir, 'x'), '')
})

test('on Windows an npm .cmd shim runs its script with Node, never through cmd.exe', () => {
  expect(launchOf('/usr/bin/claude', 'linux')).toEqual({ command: '/usr/bin/claude', args: [], node: false })
  expect(launchOf('C:\\x\\claude.exe', 'win32')).toEqual({ command: 'C:\\x\\claude.exe', args: [], node: false })
  const shim = '@ECHO off\r\nSET dp0=%~dp0\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n'
  const l = launchOf('/npm/claude.cmd', 'win32', () => shim)
  expect(l.node).toBe(true)
  expect(l.command).toBe(process.execPath)
  expect(l.args[0].replace(/\\/g, '/')).toBe('/npm/node_modules/@anthropic-ai/claude-code/cli.js')
  expect(() => launchOf('/npm/odd.cmd', 'win32', () => 'echo hi')).toThrow('install Claude Code with its own installer')
})
