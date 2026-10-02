// End-to-end test of the island's own agent with API providers, in the real
// Electron app, against a local stand-in AI server (e2e/fake-ai.cjs): the
// setup prompt, Settings → AI (provider, encrypted key, model list), asking
// with a tool call that saves a note, switching to an OpenAI-compatible
// provider, a rejected key, Ollama without a key, and Stop.
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-agent-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(USER_DATA, { recursive: true })

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

;(async () => {
  const ai = await startFakeAi()
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({ dock: { side: 'right', y: 0.35 }, character: { id: 'bolt', name: 'Sparky' }, ai: { provider: 'anthropic' } }),
  )
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_BACKDROP: 'off', DI_AI_BASE_URL: ai.base },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {})
  const cfg = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
  const threadText = () => page.evaluate(() => document.querySelector('.claude-thread')?.textContent ?? '')
  const view = () => page.evaluate(() => window.island.claude.state())
  const ask = (t) => page.evaluate((t) => window.island.claude.ask(t), t)
  const waitDone = () => until(async () => ['done', 'error', 'stopped'].includes((await view()).run?.phase), 10000)

  try {
    await sleep(1500)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
    await page.waitForSelector('.hub', { timeout: 5000 })
    await page.click('.rail-btn[aria-label="Claude"]')
    check(
      'without a key the agent tab says how to set it up',
      await page.waitForSelector('.claude-panel:has-text("Set up Sparky’s AI")', { timeout: 5000 }).then(() => true, () => false),
    )
    check('and names what’s missing', (await page.textContent('.claude-panel')).includes('Add your Claude (API key) API key'))

    // ---- Settings → AI ----
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('ai'))])
    await settings.waitForSelector('#ai select', { timeout: 5000 })
    check('Settings → AI shows the chosen provider', (await settings.inputValue('#ai select')) === 'anthropic')
    const options = await settings.$$eval('#ai select option', (o) => o.map((x) => x.textContent))
    check('every provider can be picked', ['Claude Code', 'Claude (API key)', 'ChatGPT (OpenAI)', 'Gemini (Google)', 'DeepSeek', 'OpenRouter', 'Ollama (on this computer)', 'Other (OpenAI-compatible)'].every((o) => options.includes(o)), options.join(' | '))
    await settings.fill('#ai input[aria-label="API key"]', 'sk-ant-test-123')
    await settings.click('#ai .ai-key button:has-text("Save")')
    check('saving the key checks it and lists the models', await settings.waitForSelector('#ai :text("Connected · 3 models available")', { timeout: 6000 }).then(() => true, () => false))
    const stored = cfg().ai.keys.anthropic
    check('the key is stored encrypted, never as plain text', typeof stored === 'string' && /^(enc|plain):/.test(stored) && !JSON.stringify(cfg()).includes('sk-ant-test-123'))
    await settings.screenshot({ path: `${OUT}/01-settings-ai.png` })

    // ---- Ask: a tool call saves a note ----
    check('the tab now shows the character’s name and model', await page.waitForSelector('.claude-head:has-text("Sparky"):has-text("claude-opus-5-5")', { timeout: 5000 }).then(() => true, () => false))
    await page.fill('.claude-field textarea', 'remember to buy oat milk')
    await page.press('.claude-field textarea', 'Enter')
    check('while it uses a tool the character is busy writing', await page.waitForSelector('.claude-turn.live .character[data-mood="writing"]', { timeout: 6000 }).then(() => true, () => false))
    await shot('02-working')
    await waitDone()
    check('the answer appears in the conversation', await until(async () => (await threadText()).includes('Done! I saved that note for you.'), 4000), await threadText())
    const notesDir = path.join(USER_DATA, 'notes')
    const notes = fs.existsSync(notesDir) ? fs.readdirSync(notesDir).map((f) => fs.readFileSync(path.join(notesDir, f), 'utf8')) : []
    check('the agent really saved the note', notes.includes('buy oat milk'), JSON.stringify(notes))
    const calls = ai.log.filter((l) => l.path === '/v1/messages')
    check('it called Claude with your key, the tools and its character', calls[0]?.headers['x-api-key'] === 'sk-ant-test-123' && calls[0].body.tools.some((t) => t.name === 'notes_create') && calls[0].body.system.includes('You are Sparky'))
    check('the tool result went back to the model', calls[1]?.body.messages.at(-1).content[0].type === 'tool_result')
    await shot('03-answer')

    // ---- Switch to an OpenAI-compatible provider ----
    await settings.selectOption('#ai select', 'openai')
    await settings.waitForSelector('#ai input[aria-label="API key"]', { timeout: 3000 })
    await settings.fill('#ai input[aria-label="API key"]', 'sk-oai-test')
    await settings.click('#ai .ai-key button:has-text("Save")')
    await settings.waitForSelector('#ai :text("Connected")', { timeout: 6000 })
    check('switching provider applies straight away', await page.waitForSelector('.claude-head:has-text("gpt-5")', { timeout: 5000 }).then(() => true, () => false))
    ai.log.length = 0
    await ask('what notes?')
    await waitDone()
    check('ChatGPT can search the notes too', await until(async () => (await threadText()).includes('Here’s what I found: buy oat milk'), 4000), (await threadText()).slice(-200))
    const oai = ai.log.filter((l) => l.path === '/chat/completions')
    check('with a bearer key and function tools', oai[0]?.headers.authorization === 'Bearer sk-oai-test' && oai[0].body.tools[0].type === 'function')
    check('earlier answers are sent as context', oai[0]?.body.messages.some((m) => m.role === 'assistant' && m.content === 'Done! I saved that note for you.'))
    await settings.fill('#ai input[aria-label="Model"]', 'gpt-5-mini')
    await settings.click('#ai button:has-text("Save") >> nth=-1')
    check('the model can be changed', await until(() => cfg().ai.models.openai === 'gpt-5-mini', 3000))

    // ---- A rejected key ----
    await settings.fill('#ai input[aria-label="API key"]', 'bad-key')
    await settings.click('#ai .ai-key button:has-text("Save")')
    check('a wrong key is reported in Settings', await settings.waitForSelector('#ai .error:has-text("rejected the API key")', { timeout: 6000 }).then(() => true, () => false))
    await ask('hello')
    await waitDone()
    check('and on the island', /rejected the API key/.test((await view()).run?.error ?? ''), (await view()).run?.error)

    // ---- Ollama: no key needed ----
    await settings.selectOption('#ai select', 'ollama')
    await settings.waitForSelector('#ai input[aria-label="Server address"]', { timeout: 3000 })
    check('Ollama asks for no key', !(await settings.$('#ai input[aria-label="API key"]')))
    await settings.click('#ai button:has-text("Load models")')
    check('and lists the models on this computer', await settings.waitForSelector('#ai :text("Connected")', { timeout: 6000 }).then(() => true, () => false))
    await ask('hi island')
    await waitDone()
    check('it answers through Ollama', (await view()).run?.reply === 'You said: hi island', (await view()).run?.reply)

    // ---- Stop ----
    await ask('slow one please')
    await until(async () => (await view()).run?.phase === 'thinking', 3000)
    await page.evaluate(() => window.island.claude.stop())
    check('Stop ends a running answer', await until(async () => (await view()).run?.phase === 'stopped', 3000))
    await sleep(300)
    check('and the next one works', await (async () => (await ask('again'), await waitDone(), (await view()).run?.reply === 'You said: again'))())

    // ---- Back to Claude Code ----
    await settings.selectOption('#ai select', 'claude-code')
    check('Claude Code is still there as a provider', await page.waitForSelector('.claude-head .large-title:text("Claude")', { timeout: 5000 }).then(() => true, () => false))
    await settings.close()
  } catch (e) {
    check('unexpected error', false, e.message)
    await shot('99-failure')
  }

  await app.close().catch(() => {})
  ai.close()
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError/i.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
