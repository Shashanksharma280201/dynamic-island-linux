// End-to-end test of the Jarvis layer against a stand-in AI: "yes" answers a
// Claude Code permission prompt by voice, work the buddy hands off runs in
// the assistant and is followed to the end, a fact about you is offered
// before it's kept, a click happens (really, through XTest) only after
// Allow, and routines and the wake word are set in Settings. Needs an X
// server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-jarvis-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const SOCK = path.join(TMP, 'island.sock')
const TTS = path.join(TMP, 'tts.log')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
for (const d of [OUT, USER_DATA]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 10000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try {
      const v = await f()
      if (v) return v
    } catch {}
  }
  return null
}
const said = () => (fs.existsSync(TTS) ? fs.readFileSync(TTS, 'utf8') : '')
function hook(input) {
  const p = spawn('node', [path.join(ROOT, 'hook/claude-island-hook.cjs')], { env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK } })
  let out = ''
  p.stdout.on('data', (d) => (out += d))
  const done = new Promise((r) => p.on('close', () => r(out)))
  p.stdin.end(JSON.stringify(input))
  return done
}

;(async () => {
  const ai = await startFakeAi()
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ ai: { provider: 'anthropic' }, character: { id: 'bolt', name: 'Sparky' } }))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: SOCK, DI_NO_GREETING: '1', DI_BACKDROP: 'off', DI_AI_BASE_URL: ai.base, DI_TTS_LOG: TTS },
  })
  const page = await app.firstWindow()
  const view = () => page.evaluate(() => window.island.buddy.get())
  const ask = (q) => page.evaluate((t) => window.island.buddy.ask(t), q)
  try {
    await page.waitForSelector('.island', { timeout: 15000 })
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('buddy'))])
    await settings.waitForSelector('#buddy', { timeout: 8000 })
    await settings.setViewportSize({ width: 900, height: 1600 }).catch(() => {})
    await settings.evaluate(() => window.settings.setAiKey('anthropic', 'sk-ant-test-123'))

    // ---- yes, by voice, to a permission prompt ----
    const answered = hook({ tool_name: 'Bash', cwd: '/tmp/project', tool_input: { command: 'npm test' } })
    await page.waitForSelector('.card.approval', { timeout: 6000 })
    await ask('yes')
    const out = await Promise.race([answered, sleep(6000).then(() => '')])
    check('“yes” answers a waiting permission prompt', /"behavior":\s*"allow"/.test(out), out.slice(0, 120))
    check('and says what it allowed', !!(await until(async () => /Allowed: Bash npm test/.test(said()))), said().trim().split('\n').pop())

    // ---- real work goes to the assistant ----
    const n = ai.log.length
    await ask('please fix the failing cart test')
    check('it hands the work to the assistant', !!(await until(async () => (await view()).task?.text === 'fix the failing cart test')))
    check('the assistant gets it', !!(await until(() => ai.log.slice(n).some((r) => JSON.stringify(r.body ?? r).includes('fix the failing cart test')))))
    check('and the buddy follows it to the end', !!(await until(async () => (await view()).task?.done === true && (await view()).task?.status === 'Done', 15000)), JSON.stringify((await view()).task))

    // ---- a fact about you: offered, then kept or not ----
    await ask('I always use pnpm')
    check('a fact about you is offered first', !!(await until(async () => (await view()).offer?.kind === 'remember')) && (await page.isVisible('.buddy-offer:has-text("prefers pnpm over npm")')))
    await page.click('.buddy-offer button:has-text("Not this")')
    check('“Not this” keeps nothing', !!(await until(async () => !(await view()).offer)))
    await ask('I always use pnpm')
    await until(async () => (await view()).offer?.kind === 'remember')
    await page.click('.buddy-offer button:has-text("Keep")')
    check('Keep needs the brain, and says so', !!(await until(async () => /Turn on the second brain/.test((await view()).error ?? ''))))
    await page.evaluate(() => window.island.buddy.cmd('stop'))

    // ---- a click, only after Allow ----
    await app.evaluate(({ BrowserWindow }) => {
      const w = new BrowserWindow({ x: 100, y: 200, width: 400, height: 300, frame: false, show: true, title: 'Red window', backgroundColor: '#ff0000' })
      w.loadURL('data:text/html,<body style="margin:0;height:100vh;background:%23ff0000" onclick="document.body.dataset.clicked=1"></body>')
    })
    await sleep(1200)
    const clicked = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Red window')?.webContents.executeJavaScript('document.body.dataset.clicked || ""'))
    await ask('click the red window for me')
    check('a click is offered, pointed at, not done', !!(await until(async () => (await view()).offer?.kind === 'click')) && (await clicked()) === '')
    await page.screenshot({ path: `${OUT}/01-click-offer.png` })
    await page.click('.buddy-offer button:has-text("Allow")')
    check('Allow clicks it, for real', !!(await until(async () => (await clicked()) === '1', 5000)))

    // ---- routines and the wake word, in Settings ----
    await settings.click('#buddy button:has-text("Add “End-of-day wrap”")')
    check('a routine can be added', await settings.waitForSelector('#buddy .routine:has-text("End-of-day wrap")', { timeout: 4000 }).then(() => true, () => false))
    const saved = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8')).routines ?? []
    check('and is kept, starting from now', saved.length === 1 && saved[0].on && Date.now() - saved[0].lastRun < 60_000)
    await settings.click('#buddy .routine button:has-text("Remove")')
    check('and removed', !!(await until(async () => !(await settings.$('#buddy .routine')))))
    await settings.click('#buddy .toggle-row:has-text("Listen for “hey Sparky”") input.switch')
    check('the wake word reaches the island', !!(await until(async () => (await view()).wake === true)))
    await settings.screenshot({ path: `${OUT}/02-settings.png` })
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await app.close().catch(() => {})
    ai.close?.()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in ${OUT}`)
    process.exit(failed.length ? 1 : 0)
  }
})()
