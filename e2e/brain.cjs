// End-to-end test of the second brain: Settings makes the vault, connects
// Claude Code (CLAUDE.md, hooks, MCP, through a stand-in claude CLI), the
// brain's tools answer over MCP, a finished session goes through the real hook
// into a five-line note, the next session starts with it, mining drafts the
// project and Keep files it with its sessions, editing You rewrites the brief,
// and disconnecting undoes it all. Everything lives in a temp home.
// Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-brain-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const HOME = path.join(TMP, 'home')
const CLAUDE_DIR = path.join(HOME, '.claude')
const VAULT = path.join(HOME, 'Brain')
const PROJECT = path.join(HOME, 'code', 'robot-arm')
const USER_DATA = path.join(TMP, 'profile')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(CLAUDE_DIR, { recursive: true })
fs.mkdirSync(path.join(PROJECT, '.git'), { recursive: true })
fs.writeFileSync(path.join(CLAUDE_DIR, 'CLAUDE.md'), '# My own rules\n\nUse pnpm.\n')

// A stand-in claude CLI: `mcp add-json/remove` edit .claude.json like the real
// one, and `-p` answers with a session's five lines.
const FAKE = path.join(TMP, 'claude')
fs.writeFileSync(
  FAKE,
  `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
const f = ${JSON.stringify(path.join(CLAUDE_DIR, '.claude.json'))}
if (a[0] === '-p') {
  process.stdout.write('Title: Gripper torque tuned\\n- Shipped: torque limits for the gripper\\n- Decided: keep PID gains\\n- Promised: nothing\\n- Number: 3 tests\\n- Next: try it on the arm\\n')
  process.exit(0)
}
let j = {}
try { j = JSON.parse(fs.readFileSync(f, 'utf8')) } catch {}
if (a[1] === 'add-json') { j.mcpServers = j.mcpServers || {}; j.mcpServers[a[4]] = JSON.parse(a[5]) }
if (a[1] === 'remove' && j.mcpServers) delete j.mcpServers[a[4]]
fs.writeFileSync(f, JSON.stringify(j, null, 2))
`,
  { mode: 0o755 },
)

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const seen = (page, sel, ms = 6000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const until = async (f, ms = 10000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try {
      const v = f()
      if (v) return v
    } catch {}
  }
  return null
}
const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}
const ls = (d) => {
  try {
    return fs.readdirSync(d)
  } catch {
    return []
  }
}

/** A Claude Code transcript of a session in the project. */
function transcript(id) {
  const t = (m) => new Date(Date.parse('2026-11-07T09:00:00Z') + m * 60_000).toISOString()
  const base = { sessionId: id, cwd: PROJECT, gitBranch: 'main' }
  return [
    { ...base, type: 'user', timestamp: t(0), message: { role: 'user', content: 'Tune the gripper torque limits' } },
    { ...base, type: 'assistant', timestamp: t(4), message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: `${PROJECT}/src/gripper.cpp` } }] } },
    { ...base, type: 'assistant', timestamp: t(9), message: { role: 'assistant', content: [{ type: 'text', text: 'Done: the limits are in and three tests pass.' }] } },
  ]
    .map((l) => JSON.stringify(l))
    .join('\n')
}

/** Run a hook command from Claude Code's settings, as Claude Code would. */
function runHook(cmd, input) {
  return execSync(cmd, { input: JSON.stringify(input), env: { ...process.env, HOME }, encoding: 'utf8', shell: '/bin/sh' })
}

;(async () => {
  const env = {
    ...process.env,
    HOME,
    DI_HOME: HOME,
    CLAUDE_CONFIG_DIR: CLAUDE_DIR,
    DI_CLAUDE_BIN: FAKE,
    DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
    DI_USER_DATA: USER_DATA,
    DI_NO_GREETING: '1',
  }
  const app = await _electron.launch({ executablePath: ELECTRON, args: [ROOT, '--no-sandbox'], cwd: ROOT, env })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  try {
    await page.waitForSelector('.island', { timeout: 15000 })
    await page.evaluate(() => window.island.openSettings('brain'))
    const settings = await until(() => app.windows().find((p) => p.url().includes('settings.html')), 8000)
    await settings.waitForSelector('#brain', { timeout: 8000 })
    await settings.setViewportSize({ width: 900, height: 1600 }).catch(() => {})

    // ---- make it ----
    check('Settings offers to make the brain', await seen(settings, '#brain button:has-text("Make my brain")'))
    await settings.click('#brain button:has-text("Make my brain")')
    check('You appears in the sidebar once it exists', await seen(settings, '.side-item[data-section="you"]', 8000))
    check(
      'the vault has the Living Brain layout',
      ['00-me', '01-inbox', '02-projects', '07-world-model', '08-restricted', '09-sources', '_system'].every((d) => fs.existsSync(path.join(VAULT, d))) && read(path.join(VAULT, 'AGENTS.md')).includes('08-restricted'),
    )
    check('the brief is written', !!(await until(() => read(path.join(VAULT, '_system/brief.md')).includes('# My brief'))))
    await settings.screenshot({ path: `${OUT}/brain-made.png` })

    // ---- connect Claude Code ----
    await settings.click('[data-tool="claude-code"] input.switch')
    const mcpEntry = await until(() => JSON.parse(read(path.join(CLAUDE_DIR, '.claude.json')) || '{}').mcpServers?.brain)
    check('Claude Code gets the brain’s tools (user scope)', !!mcpEntry && /^http:\/\/127\.0\.0\.1:\d+\/mcp\?client=claude-code$/.test(mcpEntry.url) && /^Bearer [a-f0-9]{48}$/.test(mcpEntry.headers.Authorization))
    const md = read(path.join(CLAUDE_DIR, 'CLAUDE.md'))
    check('CLAUDE.md keeps your rules and imports the brief', md.startsWith('# My own rules\n\nUse pnpm.') && md.includes('@~/Brain/_system/brief.md'))
    const cs = JSON.parse(read(path.join(CLAUDE_DIR, 'settings.json')))
    const startCmd = cs.hooks?.SessionStart?.[0]?.hooks?.[0]?.command ?? ''
    const endCmd = cs.hooks?.SessionEnd?.[0]?.hooks?.[0]?.command ?? ''
    check('the session hooks are in Claude Code’s settings', startCmd.includes('island-brain-hook.cjs') && startCmd.includes(VAULT) && endCmd === startCmd)
    check('the brain’s tools are allowed without a prompt', (cs.permissions?.allow ?? []).includes('mcp__brain'))
    check('Settings shows Claude Code connected', await seen(settings, '[data-tool="claude-code"] .brain-parts li.done:nth-child(3)'))

    // ---- the tools, over MCP, as Claude Code calls them ----
    const rpc = async (id, method, params) => {
      const r = await fetch(mcpEntry.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: mcpEntry.headers.Authorization }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
      return r.json()
    }
    const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: 'x' } })
    check('the MCP server introduces itself as the brain', init.result?.serverInfo?.name === 'dynamic-island-brain')
    const list = await rpc(2, 'tools/list')
    const names = (list.result?.tools ?? []).map((t) => t.name)
    check('it offers the brain’s tools', ['brief', 'search', 'read', 'entity', 'capture', 'decision', 'promise'].every((n) => names.includes(n)), names.join(','))
    const cap = await rpc(3, 'tools/call', { name: 'capture', arguments: { title: 'Uses ROS 2 Humble', text: 'Stays on Ubuntu 22.04 for ROS 2 Humble.', type: 'fact' } })
    const capturedFile = await until(() => ls(path.join(VAULT, '01-inbox')).find((f) => f.includes('uses-ros-2-humble')))
    check('a capture lands in the inbox, marked as Claude Code’s', !!capturedFile && read(path.join(VAULT, '01-inbox', capturedFile)).includes('source: claude-code'), cap.result?.content?.[0]?.text)
    const restricted = await rpc(4, 'tools/call', { name: 'read', arguments: { path: '08-restricted/README.md' } })
    check('Restricted stays private over MCP', /private/.test(restricted.result?.content?.[0]?.text ?? ''))
    check('the capture shows in Settings’ inbox', await seen(settings, '#brain .brain-item:has-text("Uses ROS 2 Humble")'))

    // ---- a session ends, and the next one starts with it ----
    const id = 'e2e-1111-2222'
    const t = path.join(CLAUDE_DIR, 'projects', '-home-code-robot-arm', `${id}.jsonl`)
    fs.mkdirSync(path.dirname(t), { recursive: true })
    fs.writeFileSync(t, transcript(id))
    runHook(endCmd, { hook_event_name: 'SessionEnd', session_id: id, transcript_path: t, cwd: PROJECT, reason: 'exit' })
    const sessionNote = await until(() => ls(path.join(VAULT, '01-inbox')).find((f) => f.includes('-session-robot-arm-')), 15000)
    const noteText = sessionNote ? read(path.join(VAULT, '01-inbox', sessionNote)) : ''
    check('a finished session becomes a five-line note', noteText.includes('# Gripper torque tuned') && noteText.includes('- Shipped: torque limits for the gripper') && noteText.includes('project: "[[robot-arm]]"'), sessionNote ?? '')
    check('what was said is kept in 09-sources', ls(path.join(VAULT, '09-sources/claude-code')).some((f) => read(path.join(VAULT, '09-sources/claude-code', f)).includes('Tune the gripper torque limits')))
    const start = JSON.parse(runHook(startCmd, { hook_event_name: 'SessionStart', session_id: 'next', cwd: path.join(PROJECT, 'src') }))
    const ctx = start.hookSpecificOutput?.additionalContext ?? ''
    check('the next session in that project starts with it', ctx.includes('for this project (robot-arm)') && ctx.includes('- Shipped: torque limits for the gripper'), ctx.slice(0, 80))

    // ---- mining and keeping ----
    await settings.click('#brain button:has-text("Look")')
    check('mining drafts the project', await seen(settings, '#brain .brain-item:has-text("robot-arm")', 15000))
    await settings.screenshot({ path: `${OUT}/brain-inbox.png` })
    const draftRow = settings.locator('#brain .brain-item').filter({ has: settings.getByRole('button', { name: 'robot-arm', exact: true }) })
    await draftRow.locator('button:has-text("Keep")').click()
    const page2 = path.join(VAULT, '02-projects/robot-arm/robot-arm.md')
    check('Keep files the project page', !!(await until(() => fs.existsSync(page2))) && !read(page2).includes('suggested:'))
    check('and its waiting session goes with it', !!(await until(() => ls(path.join(VAULT, '02-projects/robot-arm/sessions')).length === 1)) && !ls(path.join(VAULT, '01-inbox')).some((f) => f.includes('-session-robot-arm-')))
    check('the brief lists the project', !!(await until(() => read(path.join(VAULT, '_system/brief.md')).includes('[[robot-arm]]'))))

    // ---- You ----
    await settings.click('.side-item[data-section="you"]')
    await settings.click('#you [data-me="profile.md"] button:has-text("Edit")')
    await settings.waitForSelector('#you .me-editor textarea')
    await settings.fill('#you .me-editor textarea', '# Profile\n\n- Name: Sam\n- What I do: robotics on ROS 2 Humble\n')
    await settings.click('#you .me-editor button:has-text("Save")')
    check('editing You rewrites the brief', !!(await until(() => read(path.join(VAULT, '_system/brief.md')).includes('robotics on ROS 2 Humble'))))
    check('the profile keeps its frontmatter', read(path.join(VAULT, '00-me/profile.md')).startsWith('---\ntype: me\n'))
    check('Settings counts it as filled in', await seen(settings, '#you :text("1 of 4 filled in")'))
    await settings.screenshot({ path: `${OUT}/brain-you.png` })

    // ---- disconnect ----
    await settings.click('.side-item[data-section="brain"]')
    await settings.click('[data-tool="claude-code"] input.switch')
    const undone = await until(() => !JSON.parse(read(path.join(CLAUDE_DIR, '.claude.json')) || '{}').mcpServers?.brain)
    const after = JSON.parse(read(path.join(CLAUDE_DIR, 'settings.json')) || '{}')
    check('disconnecting undoes it all', !!undone && read(path.join(CLAUDE_DIR, 'CLAUDE.md')) === '# My own rules\n\nUse pnpm.\n' && !JSON.stringify(after).includes('island-brain-hook') && !JSON.stringify(after).includes('mcp__brain'))
    check('the vault stays', fs.existsSync(path.join(VAULT, '00-me/profile.md')))
    check('the vault keeps its own history', fs.existsSync(path.join(VAULT, '.git')))
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await app.close().catch(() => {})
    const bad = logs.join('').split('\n').filter((l) => /\[brain\].*(fail|error)|Uncaught|uncaught/i.test(l))
    check('no brain errors in the log', bad.length === 0, bad.slice(0, 3).join(' | '))
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in ${OUT}`)
    process.exit(failed.length ? 1 : 0)
  }
})()
