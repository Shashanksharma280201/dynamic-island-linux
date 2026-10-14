// End-to-end test of Claude Code sessions in your terminals: the real session
// hook, fired from a fake terminal (e2e/fake-terminal.cjs), drives the island's
// capsule, its "needs you" and "done" cards and the Sessions tab with the diff;
// Open terminal brings that window forward; and the real approval hook gets
// Claude's questions and plan answered on the island. Needs an X server and a
// session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-sessions-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const SOCK = path.join(TMP, 'island.sock')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
for (const d of [OUT, CLAUDE_DIR]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const xt = (...a) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), ...a.map(String)]).toString().trim()
const key = (combo) => xt('key', combo)
const seen = (page, sel, ms = 4000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const gone = (page, sel, ms = 4000) => page.waitForSelector(sel, { state: 'detached', timeout: ms }).then(() => true, () => false)
const env = { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, CLAUDE_CONFIG_DIR: CLAUDE_DIR }

/** The fake terminal and the "claude" in it; `hook(input)` fires the session hook once. */
function terminal() {
  const p = spawn('node', [path.join(__dirname, 'fake-terminal.cjs')], { env, stdio: ['pipe', 'pipe', 'inherit'] })
  let out = ''
  const waiters = []
  p.stdout.on('data', (d) => {
    out += d
    for (const w of waiters.splice(0)) w()
  })
  const sentCount = () => (out.match(/^sent$/gm) || []).length
  const waitFor = (fn) => new Promise((r) => (fn() ? r() : waiters.push(function again() { fn() ? r() : waiters.push(again) })))
  let fired = 0
  return {
    ready: () => waitFor(() => /window (\d+) claude (\d+)/.test(out)).then(() => ({ window: Number(out.match(/window (\d+)/)[1]), claude: Number(out.match(/claude (\d+)/)[1]) })),
    hook: async (input) => {
      p.stdin.write(JSON.stringify({ cwd: '/home/me/shop', ...input }) + '\n')
      const n = ++fired
      await waitFor(() => sentCount() >= n)
    },
    close: () => p.kill(),
  }
}

/** Ask the island through the real approval hook; resolves to what the hook printed. */
function approval(input) {
  return new Promise((resolve) => {
    const p = spawn('node', [path.join(ROOT, 'hook/claude-island-hook.cjs')], { env })
    let o = ''
    p.stdout.on('data', (d) => (o += d))
    p.on('close', () => resolve(o.trim() ? JSON.parse(o) : null))
    p.stdin.end(JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 's1', cwd: '/home/me/shop', ...input }))
  })
}

;(async () => {
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...env, DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1' },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })
  // After clicking on the island, take the (page's) mouse off it again. A
  // click that removed the button under the mouse leaves Chromium without a
  // mouseleave to send (the real pointer, which the island also follows, never
  // came here), so say it explicitly too.
  const leave = async () => {
    const [, h] = await page.evaluate(() => [innerWidth, innerHeight])
    await page.mouse.move(4, h - 4)
    await page.evaluate(() => document.querySelector('.island-outer').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await sleep(200)
  }
  const term = terminal()

  try {
    await page.waitForSelector('.capsule.idle', { timeout: 8000 })
    const { window: termWindow } = await term.ready()

    // ---- A session starts working ----
    await term.hook({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup' })
    await term.hook({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'fix the cart total' })
    await term.hook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Read', tool_input: { file_path: '/home/me/shop/cart.ts' } })
    check('a session at work shows on the capsule', await seen(page, '.session-capsule'))
    check('with an orb for what it does (searching while it reads)', await seen(page, '.session-capsule .orb[data-state="searching"]'))
    await term.hook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Edit', tool_input: { file_path: '/home/me/shop/cart.ts', old_string: 'a', new_string: 'b' } })
    await term.hook({
      hook_event_name: 'PostToolUse',
      session_id: 's1',
      tool_name: 'Edit',
      tool_input: { file_path: '/home/me/shop/cart.ts', old_string: 'total', new_string: 'total + tax' },
      tool_response: { filePath: '/home/me/shop/cart.ts', structuredPatch: [{ oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, lines: [' const sum = items()', '-return sum', '+const tax = sum * 0.2', '+return sum + tax', ' }'] }] },
    })
    check('the orb switches as it edits', await seen(page, '.session-capsule .orb[data-state="working"], .session-capsule .orb[data-state="solving"]'))
    check('and counts its steps', await seen(page, '.session-capsule .step-count:has-text("2")'))
    await sleep(500)
    await shot('01-session-capsule')

    // ---- The Sessions tab ----
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })
    await page.click('.rail-btn[aria-label="Sessions"]')
    check('the Sessions tab lists it', await seen(page, '.session-row:has-text("shop")'))
    check('with what it changed', await seen(page, '.session-row .diffstat:has-text("+2")'))
    await sleep(500)
    await shot('02-sessions-tab')
    await page.click('.session-row:has-text("shop")')
    check('its page shows what you asked', await seen(page, '.session-prompt:has-text("fix the cart total")'))
    check('and its steps', await seen(page, '.session-steps li:has-text("Reading cart.ts")'))
    check('and the diff of each file', await seen(page, '.diff-file.open .dl.add:has-text("const tax = sum * 0.2")'))
    check('removed lines too', await seen(page, '.diff-file.open .dl.del:has-text("return sum")'))
    await sleep(400)
    await shot('03-session-diff')
    key('ctrl+i')
    await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    await leave()
    // Its icon rail must go too, or its invisible box keeps the island's clickable area big.
    check('the icon rail leaves with the panel', await gone(page, '.rail-shell'))

    // ---- It needs you ----
    await term.hook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm test' } })
    await term.hook({ hook_event_name: 'Notification', session_id: 's1', message: 'Claude needs your permission to use Bash' })
    check('a session stuck on a prompt pops a card', await seen(page, '.session-card.waiting .session-needs:has-text("needs your permission")'))
    check('with a way to its terminal', await seen(page, '.session-card.waiting .terminal-btn'))
    await sleep(500)
    await shot('04-session-needs-you')
    await term.hook({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: 'ok' } })
    await term.hook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Grep', tool_input: { pattern: 'tax' } })
    check('once it moves on the card goes', await gone(page, '.session-card.waiting'))

    // ---- Two at once ----
    await term.hook({ hook_event_name: 'UserPromptSubmit', session_id: 's2', cwd: '/home/me/blog', prompt: 'write the release notes' })
    check('two sessions working share the capsule, with a count', await seen(page, '.session-capsule .sessions-count:has-text("2")'))
    await term.hook({ hook_event_name: 'SessionEnd', session_id: 's2', cwd: '/home/me/blog' })

    // ---- Done ----
    const transcript = path.join(TMP, 's1.jsonl')
    fs.writeFileSync(transcript, JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Fixed: the cart total now includes tax.' }] } }) + '\n')
    await term.hook({ hook_event_name: 'Stop', session_id: 's1', transcript_path: transcript })
    check('when it finishes, a card says so', await seen(page, '.session-card.done .claude-status:has-text("Done")'))
    check('with its last words', await seen(page, '.session-card.done .claude-reply:has-text("now includes tax")'))
    check('and the changes', await seen(page, '.session-card.done .session-meta:has-text("cart.ts")'))
    await sleep(500)
    await shot('05-session-done')
    const before = xt('focus')
    await page.click('.session-card.done .terminal-btn')
    const focused = await (async () => {
      for (let i = 0; i < 30; i++) {
        if (xt('focus') === String(termWindow)) return true
        await sleep(100)
      }
      return false
    })()
    check('Open terminal brings its window to the front', focused, `${before} -> ${xt('focus')} (want ${termWindow})`)
    check('and closes the card', await gone(page, '.session-card.done'))
    await leave()

    // ---- Claude asks you questions ----
    const QUESTIONS = {
      questions: [
        { question: 'Which database?', header: 'Storage', multiSelect: false, options: [{ label: 'Postgres', description: 'A server, for when it grows' }, { label: 'SQLite', description: 'One file, nothing to run' }] },
        { question: 'Which extras?', header: 'Extras', multiSelect: true, options: [{ label: 'Auth', description: 'Sign in with email' }, { label: 'Billing', description: 'Stripe checkout' }, { label: 'Admin', description: '' }] },
      ],
    }
    const asked = approval({ tool_name: 'AskUserQuestion', tool_input: QUESTIONS })
    check("Claude's question shows on the island", await seen(page, '.question-card .q-text:has-text("Which database?")'))
    check('one at a time', await seen(page, '.question-card .q-count:has-text("1 of 2")'))
    await sleep(400)
    await shot('06-question')
    await page.click('.q-option:has-text("SQLite")')
    check('picking an answer moves on', await seen(page, '.question-card .q-text:has-text("Which extras?")'))
    await page.click('.q-option:has-text("Auth")')
    await page.click('.q-option:has-text("Billing")')
    await sleep(300)
    await shot('07-question-multi')
    await page.click('.question-card .pill.primary:has-text("Send")')
    const answered = await asked
    check(
      'and the answers go back to Claude',
      JSON.stringify(answered?.hookSpecificOutput?.decision?.updatedInput?.answers) === JSON.stringify({ 'Which database?': 'SQLite', 'Which extras?': 'Auth, Billing' }),
      JSON.stringify(answered),
    )

    // Your own words.
    const own = approval({ tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Name the branch?', header: 'Branch', multiSelect: false, options: [{ label: 'main', description: '' }] }] } })
    await page.waitForSelector('.question-card .q-text:has-text("Name the branch?")', { timeout: 4000 })
    await page.click('.q-other')
    await page.waitForSelector('.q-input', { timeout: 2000 })
    await sleep(300)
    xt('type', 'tax fix')
    await sleep(300)
    await page.click('.question-card .pill.primary:has-text("Send")')
    const typed = await own
    check('or answers in your own words', typed?.hookSpecificOutput?.decision?.updatedInput?.answers?.['Name the branch?'] === 'tax fix', JSON.stringify(typed))

    // Answer in the terminal instead.
    const skip = approval({ tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Proceed?', header: 'Go', multiSelect: false, options: [{ label: 'Yes', description: '' }] }] } })
    await page.waitForSelector('.question-card .q-text:has-text("Proceed?")', { timeout: 4000 })
    await page.click('.question-card button:has-text("Answer in terminal")')
    check('"Answer in terminal" leaves it to the terminal', (await skip) === null)

    // With the keyboard, from any app: Ctrl+Alt+number picks, Ctrl+Alt+Y moves on / sends.
    const byKeys = approval({ tool_name: 'AskUserQuestion', tool_input: QUESTIONS })
    await page.waitForSelector('.question-card .q-text:has-text("Which database?")', { timeout: 4000 })
    check('the card says which keys answer it', await seen(page, '.question-card .q-keys:has-text("Ctrl+Alt+1–2")'))
    await sleep(300)
    key('ctrl+alt+2')
    check('Ctrl+Alt+2 picks the second option and moves on', await seen(page, '.question-card .q-text:has-text("Which extras?")'))
    key('ctrl+alt+1')
    key('ctrl+alt+3')
    await sleep(200)
    key('ctrl+alt+y')
    const keyed = await byKeys
    check(
      'Ctrl+Alt+Y sends what was picked',
      JSON.stringify(keyed?.hookSpecificOutput?.decision?.updatedInput?.answers) === JSON.stringify({ 'Which database?': 'SQLite', 'Which extras?': 'Auth, Admin' }),
      JSON.stringify(keyed?.hookSpecificOutput?.decision?.updatedInput?.answers),
    )

    // Answered in the terminal instead: the card goes, and says why.
    const gone1 = spawn('node', [path.join(ROOT, 'hook/claude-island-hook.cjs')], { env })
    gone1.stdin.end(JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 's1', cwd: '/home/me/shop', tool_name: 'Bash', tool_input: { command: 'npm run lint' } }))
    await page.waitForSelector('.card.approval', { timeout: 4000 })
    gone1.kill()
    check('a request answered in the terminal leaves a short note', await seen(page, '.card.notification:has-text("Answered in the terminal")'))
    await page.waitForSelector('.card.notification', { state: 'detached', timeout: 6000 }).catch(() => {})

    // ---- Claude's plan ----
    const plan = approval({ tool_name: 'ExitPlanMode', tool_input: { plan: '1. Add tax to the total\n2. Test the cart' } })
    check('a plan shows in full', await seen(page, '.plan-card .plan-body:has-text("Test the cart")'))
    await sleep(400)
    await shot('08-plan')
    await page.click('.plan-card .pill.primary:has-text("Start")')
    check('and Start approves it', (await plan)?.hookSpecificOutput?.decision?.behavior === 'allow')
    await leave()

    // ---- Other agents: Gemini CLI ----
    const gemini = (args, input) =>
      new Promise((resolve) => {
        const p = spawn('node', [path.join(ROOT, 'hook/claude-island-hook-events.cjs'), '--agent', 'gemini', ...args], { env })
        p.on('close', resolve)
        p.stdin.end(JSON.stringify({ session_id: 'g1', cwd: '/home/me/notes-app', ...input }))
      })
    await gemini(['UserPromptSubmit'], { hook_event_name: 'BeforeAgent', prompt: 'build it' })
    await gemini(['PreToolUse'], { hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'npm run build' } })
    check('another agent shows too', await seen(page, '.session-capsule'))
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })
    await page.click('.rail-btn[aria-label="Sessions"]')
    check('named, with its step read like Claude\'s', await seen(page, '.session-row:has-text("Gemini CLI"):has-text("Running npm run build")'))
    await sleep(400)
    check('nothing on the island is left scrolled out of place', await page.evaluate(() => [...document.querySelectorAll('.island')].every((e) => !e.scrollTop && !e.scrollLeft)))
    await shot('09-gemini-session')
    key('ctrl+i')
    await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    await leave()
    await gemini(['SessionEnd'], { hook_event_name: 'SessionEnd' })

    // ---- The session closes ----
    await term.hook({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'thanks' })
    check('a new turn shows it working again', await seen(page, '.session-capsule'))
    await term.hook({ hook_event_name: 'SessionEnd', session_id: 's1', reason: 'exit' })
    check('and when it ends the island rests', await seen(page, '.capsule.idle'))
  } catch (e) {
    check('unexpected error', false, e.message)
  } finally {
    term.close()
    const errs = logs.join('').split('\n').filter((l) => /error/i.test(l) && !/dbus|libva|gpu|GLib|Fontconfig|viz_main|bus\.cc|atom_cache|ozone|X11 error/i.test(l))
    console.log(`app log errors: ${errs.length ? '\n' + errs.join('\n') : 'none'}\n`)
    await app.close().catch(() => {})
    const pass = results.filter((r) => r.ok).length
    console.log(`${pass}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(pass === results.length ? 0 : 1)
  }
})()
