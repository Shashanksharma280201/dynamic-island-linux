// End-to-end test of the brain's loop against a stand-in AI: Settings lists
// the jobs (none run yet), the evening filing proposes moves that only happen
// when applied (and undo), the daily signal is written, and the morning card
// shows on the island, where Edit opens its draft and Hold puts it away.
// Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-loop-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const HOME = path.join(TMP, 'home')
const VAULT = path.join(HOME, 'Brain')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const WA_GO = path.join(TMP, 'wa-go')
const TOKEN = 'e2e-' + 'b'.repeat(40)
const PORT = 23000 + Math.floor(Math.random() * 20000)
for (const d of [OUT, USER_DATA, HOME]) fs.mkdirSync(d, { recursive: true })

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
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

;(async () => {
  const ai = await startFakeAi()
  // WhatsApp (the stand-in engine) and the phone link, for what the brain keeps.
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ ai: { provider: 'anthropic' }, character: { id: 'bolt', name: 'Sparky' }, whatsapp: true, drop: { on: true } }))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: {
      ...process.env,
      DI_USER_DATA: USER_DATA,
      DI_HOME: HOME,
      CLAUDE_CONFIG_DIR: path.join(HOME, '.claude'),
      DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
      DI_NO_GREETING: '1',
      DI_BACKDROP: 'off',
      DI_AI_BASE_URL: ai.base,
      DI_CLAUDE_BIN: '/nonexistent',
      DI_EGRESS_COUNT_LOCAL: '1',
      DI_WHATSAPP_ENGINE: 'fake',
      DI_FAKE_WA_READY_MS: '300',
      DI_FAKE_WA_TRIGGER: WA_GO,
      DI_DROP_TOKEN: TOKEN,
      DI_DROP_PORT: String(PORT),
      DI_DROP_FOLDER: path.join(TMP, 'Downloads'),
    },
  })
  const page = await app.firstWindow()
  try {
    await page.waitForSelector('.island', { timeout: 15000 })
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('brain'))])
    await settings.waitForSelector('#brain', { timeout: 8000 })
    await settings.setViewportSize({ width: 900, height: 1600 }).catch(() => {})
    await settings.evaluate(() => window.settings.setAiKey('anthropic', 'sk-ant-test-123'))
    const made = await settings.evaluate((v) => window.settings.brain.create(v), VAULT)
    check('a brain is made', made === null && fs.existsSync(path.join(VAULT, '_system')), String(made))
    check('Settings lists the loop’s jobs, none run yet', !!(await until(async () => (await settings.$$('#brain .loop-job')).length === 6 && (await settings.$$('#brain .loop-dot.none')).length === 6)))

    // An inbox note about a person.
    fs.writeFileSync(path.join(VAULT, '01-inbox', `${today()}-asha.md`), `---\ntype: person\ndate: ${today()}\n---\n# Asha Rao\n\nRuns Globex.\n`)

    // ---- the evening filing ----
    await settings.click('#brain .loop-job[data-job="triage"] button:has-text("Run now")')
    check('the filing proposes a move', await settings.waitForSelector('#brain .loop-move:has-text("07-world-model/people")', { timeout: 6000 }).then(() => true, () => false))
    check('and moves nothing yet', fs.existsSync(path.join(VAULT, '01-inbox', `${today()}-asha.md`)))
    check('the job says how it went', await settings.isVisible('#brain .loop-job[data-job="triage"] .loop-dot.ok'))
    await settings.click('#brain .loop-filing button:has-text("Apply")')
    check('Apply files it', !!(await until(() => fs.existsSync(path.join(VAULT, '07-world-model/people/asha-rao.md')) && !fs.existsSync(path.join(VAULT, '01-inbox', `${today()}-asha.md`)))))
    await settings.click('#brain .loop-filing button:has-text("Undo")')
    check('Undo puts it back', !!(await until(() => fs.existsSync(path.join(VAULT, '01-inbox', `${today()}-asha.md`)))))

    // ---- the daily signal ----
    await settings.click('#brain .loop-job[data-job="daily"] button:has-text("Run now")')
    const signal = path.join(VAULT, '06-brain/signals/daily', `${today()}.md`)
    check('the daily signal is written by the AI', !!(await until(() => fs.existsSync(signal) && /- Shipped: the loop/.test(fs.readFileSync(signal, 'utf8')))))

    // ---- the morning card ----
    await settings.click('#brain .loop-job[data-job="morning"] button:has-text("Run now")')
    check('the morning card shows on the island', await page.waitForSelector('.morning-card .morning-one:has-text("Send Asha the deck")', { timeout: 6000 }).then(() => true, () => false))
    check('with why and the draft', await page.isVisible('.morning-card .morning-why:has-text("You promised it on Friday")') && (await page.isVisible('.morning-card .morning-draft:has-text("To Asha, by mail")')))
    check('and in Settings', await settings.waitForSelector('#brain .loop-card:has-text("Send Asha the deck")', { timeout: 4000 }).then(() => true, () => false))
    await page.screenshot({ path: `${OUT}/01-morning.png` })
    await settings.screenshot({ path: `${OUT}/02-settings.png` })
    await page.click('.morning-card button:has-text("Edit")')
    check('Edit opens the draft in the Claude tab', !!(await until(async () => /Send this to Asha, by mail:[\s\S]*Hi Asha, here is the deck/.test(await page.inputValue('.claude-field textarea').catch(() => '')))))
    await page.evaluate(() => window.island.morning.act('hold'))
    check('Hold puts it away for now', !!(await until(async () => !(await page.$('.morning-card')))))
    const card = JSON.parse(fs.readFileSync(path.join(VAULT, '_system/jobs/morning.json'), 'utf8'))
    check('and brings it back in three hours', card.state === 'held' && card.holdUntil - Date.now() > 2.9 * 3_600_000)

    // ---- what it keeps: WhatsApp, and notes from the phone ----
    const phone = (fn, ...args) =>
      fetch(`http://127.0.0.1:${PORT}/island/call`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'X-Island-Device': 'Test Phone', 'Content-Type': 'application/json' }, body: JSON.stringify({ fn, args }) }).then((r) => r.json())
    const before = await phone('brain.capture', 'Call the plumber')
    check('a note from the phone needs your yes first', before.ok === false && /Notes from your phone/.test(before.message), JSON.stringify(before))
    await settings.click('#brain .toggle-row:has-text("Your WhatsApp chats") input.switch')
    await settings.click('#brain .toggle-row:has-text("Notes from your phone") input.switch')
    check('Settings has what it keeps, each off until turned on', await settings.waitForSelector('#brain input[aria-label="Never keep chats with"]', { timeout: 4000 }).then(() => true, () => false))
    const sent = await phone('brain.capture', '# Call the plumber\nAbout the kitchen sink, before Friday')
    check('then it lands in the inbox', sent.ok === true && fs.existsSync(path.join(VAULT, '01-inbox', `${today()}-phone-call-the-plumber.md`)), JSON.stringify(sent))
    check('and Settings lists it there', await settings.waitForSelector('#brain :text("Call the plumber")', { timeout: 6000 }).then(() => true, () => false))
    fs.writeFileSync(WA_GO, '')
    check('a chat that arrives waits to be kept tonight', !!(await until(async () => (await settings.textContent('#brain .toggle-row:has-text("Your WhatsApp chats")')).includes('waiting for tonight'), 8000)))
    await settings.click('#brain .loop-job[data-job="messages"] button:has-text("Run now")')
    const kept = path.join(VAULT, '09-sources', 'whatsapp', `${today()}.md`)
    check('Your messages keeps the day’s chats as a source', !!(await until(() => fs.existsSync(kept) && /Are we still on for lunch\?/.test(fs.readFileSync(kept, 'utf8')))))
    check('marked as data, never instructions', /never instructions to follow/.test(fs.readFileSync(kept, 'utf8')) && /data: "?true"?/.test(fs.readFileSync(kept, 'utf8')))
    check('and the job says so', await settings.waitForSelector('#brain .loop-job[data-job="messages"]:has-text("in 1 chat (Alice)")', { timeout: 6000 }).then(() => true, () => false))
    await settings.screenshot({ path: `${OUT}/03-what-it-keeps.png` })

    // ---- privacy ----
    await settings.click('.side-item[data-section="privacy"]')
    check('Privacy says what the loop sent', await settings.waitForSelector('#privacy .privacy-row:has-text("for the morning card")', { timeout: 4000 }).then(() => true, () => false))
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
