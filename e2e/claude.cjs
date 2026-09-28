// End-to-end test of the Claude features in the real Electron app: plan limits
// (through the real status line bridge script), commands typed with the real
// keyboard and run by a fake `claude` (e2e/fake-claude.cjs), approvals on the
// island, stop, the capsule orb and the answer card, and Settings.
// Voice (mic -> local Whisper -> Claude) runs when a Whisper model folder is
// given in E2E_STT_MODELS (containing Xenova/whisper-tiny) and espeak-ng is
// installed; the model is "downloaded" from a local server to test that too.
const { _electron } = require('playwright-core')
const { execFileSync, spawnSync } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-claude-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
const PROJECT = path.join(TMP, 'my-project')
const LOG = path.join(TMP, 'claude-args.log')
const SOCK = path.join(TMP, 'island.sock')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
for (const d of [OUT, USER_DATA, CLAUDE_DIR, PROJECT]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms
  while (!(await fn()) && Date.now() < end) await sleep(100)
  return fn()
}
const xt = (...a) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), ...a.map(String)])
const runs = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])

// Voice needs a Whisper model and a speech synthesizer.
const STT = process.env.E2E_STT_MODELS
const ESPEAK = spawnSync('sh', ['-c', 'command -v espeak-ng']).status === 0
const VOICE = !!STT && fs.existsSync(path.join(STT || '', 'Xenova/whisper-tiny')) && ESPEAK

function speechWav(text, file) {
  // espeak-ng -> 16 kHz mono PCM with silence around it
  const raw = path.join(TMP, 'raw.wav')
  execFileSync('espeak-ng', ['-v', 'en-us', '-s', '140', '-w', raw, text])
  const b = fs.readFileSync(raw)
  const rate = b.readUInt32LE(24)
  const pcm = b.subarray(44)
  const n = Math.floor(pcm.length / 2)
  const outN = Math.floor((n * 16000) / rate)
  const pad = (s) => Buffer.alloc(Math.floor(16000 * s) * 2)
  const body = Buffer.alloc(outN * 2)
  for (let i = 0; i < outN; i++) body.writeInt16LE(pcm.readInt16LE(Math.min(n - 1, Math.floor((i * rate) / 16000)) * 2), i * 2)
  const data = Buffer.concat([pad(0.6), body, pad(3)])
  const h = Buffer.alloc(44)
  h.write('RIFF', 0), h.writeUInt32LE(36 + data.length, 4), h.write('WAVE', 8), h.write('fmt ', 12)
  h.writeUInt32LE(16, 16), h.writeUInt16LE(1, 20), h.writeUInt16LE(1, 22), h.writeUInt32LE(16000, 24)
  h.writeUInt32LE(32000, 28), h.writeUInt16LE(2, 32), h.writeUInt16LE(16, 34), h.write('data', 36), h.writeUInt32LE(data.length, 40)
  fs.writeFileSync(file, Buffer.concat([h, data]))
}

;(async () => {
  // Someone's existing status line, which must keep working.
  fs.writeFileSync(path.join(CLAUDE_DIR, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'echo my-own-line' }, theme: 'dark' }))
  fs.writeFileSync(path.join(PROJECT, 'README.md'), '# My project\n')
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({ notifications: true, dock: { side: 'right', y: 0.35 }, claude: { cwd: PROJECT, sttModel: 'tiny' } }),
  )

  // Local stand-in for Hugging Face, serving the test model under the name the app asks for.
  let modelServer = null
  const env = {
    ...process.env,
    DI_USER_DATA: USER_DATA,
    DYNAMIC_ISLAND_SOCK: SOCK,
    DI_BACKDROP: 'off',
    CLAUDE_CONFIG_DIR: CLAUDE_DIR,
    DI_CLAUDE_BIN: path.join(__dirname, 'fake-claude.cjs'),
    DI_FAKE_CLAUDE_LOG: LOG,
  }
  if (VOICE) {
    const served = []
    modelServer = http.createServer((req, res) => {
      const m = /^\/Xenova\/whisper-tiny\.en\/resolve\/main\/(.+)$/.exec(req.url)
      const file = m && path.join(STT, 'Xenova/whisper-tiny', m[1])
      if (!file || !fs.existsSync(file)) return res.writeHead(404).end()
      served.push(m[1])
      res.writeHead(200, { 'Content-Length': fs.statSync(file).size })
      fs.createReadStream(file).pipe(res)
    })
    await new Promise((r) => modelServer.listen(0, '127.0.0.1', r))
    env.DI_STT_BASE_URL = `http://127.0.0.1:${modelServer.address().port}`
    env.DI_FAKE_MIC = path.join(TMP, 'mic.wav')
    speechWav('Open the settings file and change the port to eight thousand.', env.DI_FAKE_MIC)
    modelServer.served = served
  }

  const app = await _electron.launch({ executablePath: ELECTRON, args: [ROOT, '--no-sandbox'], cwd: ROOT, env: { ...env, DI_DEBUG: process.env.E2E_VERBOSE ? '1' : '' } })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {})
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')).getBounds())
  const realClick = async (sel) => {
    const b = await bounds()
    const centre = () => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] })
    let r = await centre()
    for (let i = 0; i < 20; i++) {
      await sleep(150)
      const n = await centre()
      if (n[0] === r[0] && n[1] === r[1]) break
      r = n
    }
    xt('click', b.x + r[0], b.y + r[1])
  }
  const threadText = () => page.textContent('.claude-panel').catch(() => '')
  const idle = () => until(async () => !(await page.evaluate(() => window.island.claude.state().then((v) => ['starting', 'thinking', 'tool', 'writing'].includes(v.run?.phase ?? '')))), 10000)

  try {
    await sleep(1500)
    // ---- Plan limits through the real status line bridge ----
    const status = {
      model: { display_name: 'Opus 5' },
      rate_limits: {
        five_hour: { used_percentage: 83, resets_at: Math.floor(Date.now() / 1000) + 2 * 3600 + 600 },
        seven_day: { used_percentage: 41, resets_at: Math.floor(Date.now() / 1000) + 3 * 86400 },
      },
    }
    const bridge = spawnSync('node', [path.join(ROOT, 'hook/claude-island-status.cjs')], {
      input: JSON.stringify(status),
      env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, CLAUDE_CONFIG_DIR: CLAUDE_DIR },
    })
    check('the status line bridge prints a status line', bridge.stdout.toString() === 'Opus 5 · session 83% · week 41%\n', JSON.stringify(bridge.stdout.toString()))
    check(
      'crossing 80% of the session limit raises a heads-up card',
      await page.waitForSelector('.card.notification:has-text("Session limit 83% used")', { timeout: 5000 }).then(() => true, () => false),
    )
    await shot('01-limit-alert')
    xt('key', 'ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })
    await realClick('.rail-btn[aria-label="Claude"]')
    await page.waitForSelector('.claude-panel .limits', { timeout: 5000 })
    const meters = await page.$$eval('.meter', (ms) => ms.map((m) => m.textContent))
    check('Claude tab shows session and weekly limits', /Session83%Resets in 2 h 1\d min/.test(meters[0] ?? '') && /Week41%Resets \w{3} \d\d:\d\d/.test(meters[1] ?? ''), JSON.stringify(meters))
    check('limits show which model and when', /Opus 5 · updated just now/.test(await page.textContent('.limits-foot')))
    check('the project folder is shown', (await page.textContent('.folder-chip')).includes('my-project'))
    const rings = await page.$$eval('.rail-btn[aria-label="Claude"] .ring-fill', (cs) => cs.map((c) => `${c.getAttribute('class')}:${c.dataset.pct}`))
    check('the Claude icon shows session and weekly usage as rings', rings.join() === 'ring-fill session high:83,ring-fill week ok:41', rings.join())
    await shot('02-claude-tab')

    // ---- A typed command, with the real keyboard ----
    await realClick('.claude-field textarea')
    await sleep(600)
    xt('type', 'summarize the readme')
    check('typing a command with the real keyboard', await until(async () => (await page.inputValue('.claude-field textarea')) === 'summarize the readme', 3000))
    xt('key', 'enter')
    check('Enter sends the command to Claude Code', await until(() => runs().length === 1, 5000))
    const first = runs()[0]
    check('it runs in the project folder', first?.cwd === PROJECT, first?.cwd)
    check('with streaming output', first?.args.includes('stream-json') && first?.args.includes('--include-partial-messages'))
    check('and asks for approvals on the island', !!first && JSON.parse(first.args[first.args.indexOf('--settings') + 1]).hooks.PermissionRequest[0].hooks[0].command.includes('claude-island-hook'))
    const sawTool = await until(async () => /Reading README\.md/.test(await threadText()), 4000)
    check('the orb shows what Claude is doing', sawTool && !!(await page.$('.claude-turn.live .orb')))
    await shot('03-working')
    check('the answer appears', await until(async () => /Done: summarize the readme/.test(await threadText()), 8000))
    await idle()
    await shot('04-answer')

    // Follow-up continues the conversation
    await page.fill('.claude-field textarea', 'and the tests')
    await page.press('.claude-field textarea', 'Enter')
    check('a follow-up continues the same conversation', await until(async () => /continuing fake-session-\d+/.test(await threadText()), 8000))
    check('with --resume', runs()[1]?.args.includes('--resume'))
    await idle()

    // ---- Approval on the island ----
    await page.fill('.claude-field textarea', 'this needs approval')
    await page.press('.claude-field textarea', 'Enter')
    const approval = await page.waitForSelector('.card.approval', { timeout: 8000 }).then(() => true, () => false)
    check('Claude asking for permission shows an approval card', approval)
    await shot('05-approval')
    check('there is no "Answer in terminal" for commands from the island', approval && !(await page.$('.card.approval button:has-text("Answer in terminal")')))
    if (approval) await page.click('.card.approval button.allow')
    await page.waitForSelector('.hub', { timeout: 5000 }).catch(() => {})
    check('allowing it lets Claude continue', await until(async () => /Bash was allow\./.test(await threadText()), 8000), process.env.E2E_VERBOSE ? (await threadText()).slice(-300) : '')
    await idle()

    // ---- Stop ----
    await page.fill('.claude-field textarea', 'something slow')
    await page.press('.claude-field textarea', 'Enter')
    await page.waitForSelector('.round-btn.stop', { timeout: 5000 })
    await page.click('.round-btn.stop')
    check('Stop ends the run', await until(async () => /Stopped\./.test(await threadText()) && !(await page.$('.round-btn.stop')), 6000), process.env.E2E_VERBOSE ? (await threadText()).slice(-200) + ' stopBtn=' + !!(await page.$('.round-btn.stop')) : '')

    // ---- Errors are explained ----
    await page.fill('.claude-field textarea', 'please fail')
    await page.press('.claude-field textarea', 'Enter')
    check('a failed run says why', await until(async () => /something broke in the fake/.test(await threadText()), 6000))
    await idle()

    // ---- New conversation ----
    await page.click('[aria-label="New conversation"]')
    check('New conversation clears the thread', await until(async () => !(await page.$('.claude-turn')), 3000))
    const n = runs().length
    await page.fill('.claude-field textarea', 'fresh start')
    await page.press('.claude-field textarea', 'Enter')
    await until(() => runs().length === n + 1, 5000)
    check('and the next command starts a new session', !runs()[n]?.args.includes('--resume'))
    await until(async () => /Done: fresh start/.test(await threadText()), 8000)

    // ---- While the panel is closed: orb on the capsule, then the answer card ----
    xt('key', 'ctrl+i')
    await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    xt(10, 10)
    await page.evaluate(() => window.island.claude.ask('something slow in the background'))
    check('a running command shows an orb on the capsule', await page.waitForSelector('.claude-capsule .orb', { timeout: 5000 }).then(() => true, () => false))
    await shot('06-capsule-orb')
    check(
      'the answer pops up as a card when done',
      await page.waitForSelector('.card.claude-card.done:has-text("Done: something slow in the background")', { timeout: 15000 }).then(() => true, () => false),
    )
    await shot('07-answer-card')
    await page.click('.card.claude-card button:has-text("Open Claude")')
    check('Open Claude opens the Claude tab', await page.waitForSelector('.claude-panel', { timeout: 3000 }).then(() => true, () => false))

    // ---- Voice: speak -> local Whisper -> Claude ----
    if (VOICE) {
      const before = runs().length
      await realClick('.round-btn.mic')
      check('the mic button starts listening', await page.waitForSelector('.voice-stage.listening, .voice-stage.preparing', { timeout: 5000 }).then(() => true, () => false))
      await shot('08-listening')
      const done = await until(() => runs().length > before, 90000)
      const prompt = runs()[before]?.args[1] ?? ''
      check('the speech model is downloaded on first use', modelServer.served.includes('onnx/decoder_model_merged_quantized.onnx') && fs.existsSync(path.join(USER_DATA, 'models/Xenova/whisper-tiny.en/config.json')))
      // The tiny test model isn't word-perfect on synthetic speech: check the gist.
      check('speaking sends what you said to Claude', done && /settings/i.test(prompt) && /8000|eight thousand/i.test(prompt), JSON.stringify(prompt) + (process.env.E2E_VERBOSE ? ' ' + (await threadText()).slice(-300) : ''))
      await until(async () => /Done:.*settings/i.test(await threadText()), 8000)
      await shot('09-voice-answer')
    } else {
      console.log('SKIP voice (set E2E_STT_MODELS to a folder with Xenova/whisper-tiny, and install espeak-ng)')
    }

    // ---- Settings ----
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('claude'))])
    await settings.waitForSelector('#claude', { timeout: 5000 })
    check('Settings finds the claude command', (await settings.textContent('#claude')).includes('fake-claude.cjs'))
    await settings.click('#claude .toggle-row:has-text("Show my plan limits") input.switch')
    const installed = await until(() => JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8')).statusLine?.command?.includes('claude-island-status'), 5000)
    check('"Show my plan limits" installs the status line bridge', installed)
    const kept = spawnSync('sh', ['-c', JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8')).statusLine.command], {
      input: JSON.stringify(status),
      env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, CLAUDE_CONFIG_DIR: CLAUDE_DIR },
    })
    check('your own status line still shows', kept.stdout.toString().trim() === 'my-own-line', JSON.stringify(kept.stdout.toString()))
    await settings.click('#claude .toggle-row:has-text("Show my plan limits") input.switch')
    check(
      'turning it off restores your status line',
      await until(() => JSON.stringify(JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'))) === JSON.stringify({ statusLine: { type: 'command', command: 'echo my-own-line' }, theme: 'dark' }), 5000),
    )
    await settings.click('#claude button:has-text("Allow edits")')
    await sleep(300)
    await page.evaluate(() => window.island.claude.ask('with edits'))
    await until(() => runs().some((r) => r.args.includes('acceptEdits')), 5000)
    check('the permission mode applies to island commands', runs().at(-1)?.args.includes('acceptEdits'))
    await settings.screenshot({ path: `${OUT}/10-settings.png`, fullPage: true })
    await settings.close()
  } catch (e) {
    check('unexpected error', false, e.message)
    await shot('99-failure')
  }

  await app.close().catch(() => {})
  modelServer?.close()
  const errs = logs.join('').split('\n').filter((l) => /error|Uncaught/i.test(l) && !/fake|X11 error/.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
