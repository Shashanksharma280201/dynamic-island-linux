// End-to-end test of Connected (a trading engine on the island), against
// e2e/fake-engine.cjs: Settings refuses a wrong token and connects with the
// right one, a trade shows as a card and your click answers it, the capsule
// shows today's P&L, the Trading tab shows the engine's sections and sends its
// buttons, heads-ups pop up, and Settings shows the phone's pairing QR.
// Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync, spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-connected-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
fs.mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const key = (combo) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'key', combo])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const seen = (page, sel, ms = 6000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const gone = (page, sel, ms = 6000) => page.waitForSelector(sel, { state: 'detached', timeout: ms }).then(() => true, () => false)
const control = (port, what, body) =>
  new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, path: `/__control/${what}`, method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let b = ''
      res.on('data', (d) => (b += d))
      res.on('end', () => resolve(b ? JSON.parse(b) : null))
    })
    r.end(body ? JSON.stringify(body) : undefined)
  })

const ASK = {
  id: 'a1b2c3d4',
  title: 'Buy 19 INFY',
  subtitle: 'INFY · 09:31',
  lines: [
    { label: 'Price', value: '~₹1,002.51' },
    { label: 'Value', value: '₹19,047.69' },
    { label: 'Stop', value: '₹995.17' },
    { label: 'Target', value: '₹1,017.19' },
    { label: 'Risk', value: '₹139.46', tone: 'down' },
  ],
  note: 'ORB long: close 1002.51 > range high 1001.95',
  approve_label: 'Buy',
  reject_label: 'Skip',
  seconds_left: 60,
  expires_at: 0,
  tone: 'up',
}
const LIVE = {
  status: { text: '+₹1,240.50', short: '+₹1.2k', tone: 'up', detail: '1 open · 2 trades · PAPER', show: true },
  asks: [],
  sections: [
    { type: 'stats', items: [{ label: 'Today', value: '+₹1,240.50', tone: 'up' }, { label: 'Charges', value: '₹40.54' }, { label: 'Open P&L', value: '+₹20.30', tone: 'up' }, { label: 'Loss limit used', value: '0% of ₹2,000.00' }] },
    { type: 'list', title: 'Open positions', empty: 'No open positions', rows: [{ title: 'Long 19 INFY', subtitle: 'in ₹1,002.71 · now ₹1,003.78 · stop ₹995.17', value: '+₹20.30', tone: 'up' }] },
    { type: 'list', title: "Today's trades", empty: 'No trades yet today', rows: [{ title: 'TCS long 8', subtitle: '09:42 to 10:15 · target hit · charges ₹20.11', value: '+₹1,220.20', tone: 'up' }] },
    { type: 'actions', actions: [{ id: 'stop_today', label: 'Stop trading today', style: 'danger', confirm: 'No new trades today. Open positions keep their stops.' }] },
  ],
}

;(async () => {
  const fake = spawn('node', [path.join(__dirname, 'fake-engine.cjs')], { stdio: ['ignore', 'pipe', 'inherit'] })
  const port = await new Promise((r) => fake.stdout.on('data', (d) => /port (\d+)/.test(d) && r(Number(/port (\d+)/.exec(d)[1]))))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1' },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })

  try {
    await page.waitForSelector('.capsule.idle', { timeout: 8000 })

    // ---- Nothing connected: no tab ----
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 4000 })
    check('with nothing connected, there is no Trading tab', !(await page.$('.rail-btn[aria-label="Connected"], .rail-btn[aria-label="Trading"]')))

    // ---- Settings → Connected ----
    await page.evaluate(() => window.island.openSettings('connected'))
    let settings = null
    for (let i = 0; i < 50 && !settings; i++) {
      settings = app.windows().find((p) => p.url().includes('settings.html'))
      await sleep(100)
    }
    await settings.waitForSelector('#connected', { timeout: 5000 })
    const row = '#connected .service-row[data-service="connected"]'
    await settings.click(`${row} input.switch`)
    await settings.fill(`${row} input[aria-label="Connected address"]`, `http://127.0.0.1:${port}`)
    await settings.fill(`${row} input[type=password]`, 'wrong')
    await settings.click(`${row} button:has-text("Save")`)
    check('a wrong token is refused, saying why', await seen(settings, `${row} .service-status.bad:has-text("token")`))
    await settings.fill(`${row} input[type=password]`, 'good-token')
    await settings.click(`${row} button:has-text("Save")`)
    check("the right one connects", await seen(settings, `${row} .service-status.ok`, 8000))
    const cfg = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check('the token is stored encrypted', !JSON.stringify(cfg.connected).includes('good-token') && !!cfg.connected.secret)
    await settings.click('#connected button:has-text("Show QR")')
    check('Settings shows the phone pairing QR', await seen(settings, '#connected img.connected-qr'))
    await shot(settings, 'connected-settings')
    await settings.close()

    // ---- A trade to approve ----
    key('ctrl+i')
    await gone(page, '.hub', 4000)
    await control(port, 'view', { asks: [ASK], status: { ...LIVE.status, show: false } })
    check('a trade shows as a card with its numbers', await seen(page, '.card.connected-ask:has-text("Buy 19 INFY"):has-text("₹995.17")', 8000))
    check('with a countdown', await seen(page, '.connected-ask .ask-timer'))
    await sleep(900) // let the card finish opening
    await shot(page, 'connected-ask')
    await page.click('.connected-ask button.allow')
    check('Buy closes the card', await gone(page, '.card.connected-ask'))
    let posts = await control(port, 'posts')
    check('and sends your answer to the engine', posts.some((p) => p.path === '/island/answer' && p.body.ask_id === ASK.id && p.body.answer === 'approve' && p.body.device === 'island'), JSON.stringify(posts))

    // Skip
    await control(port, 'view', { asks: [{ ...ASK, id: 'e5f6a7b8', title: 'Sell short 10 TCS', approve_label: 'Sell', tone: 'down' }] })
    await seen(page, '.card.connected-ask:has-text("Sell short 10 TCS")')
    await page.click('.connected-ask button.deny')
    await gone(page, '.card.connected-ask')
    posts = await control(port, 'posts')
    check('Skip sends a no', posts.some((p) => p.body.ask_id === 'e5f6a7b8' && p.body.answer === 'reject'))

    // ---- The capsule ----
    await control(port, 'view', LIVE)
    // Pointer off the island, or it opens into the full status card (also right).
    execFileSync('node', [path.join(__dirname, 'xtest.cjs'), '5', '1000'])
    await sleep(800)
    check("the capsule shows today's P&L", await seen(page, '.connected-capsule:has-text("+₹1.2k")', 8000))
    await sleep(600)
    await shot(page, 'connected-capsule')

    // ---- A heads-up ----
    await control(port, 'notify', { title: 'TCS closed: +₹1,220.20', body: 'target hit · charges ₹20.11', urgency: 'normal' })
    check('heads-ups pop up on the island', await seen(page, '.card:has-text("TCS closed: +₹1,220.20")', 8000))
    await sleep(300)

    // ---- The Trading tab ----
    key('ctrl+i')
    await page.waitForSelector('.rail', { timeout: 4000 })
    check('the rail shows the Trading tab', await seen(page, '.rail-btn[aria-label="Trading"]'))
    await page.click('.rail-btn[aria-label="Trading"]')
    check('the tab shows the engine sections', await seen(page, '.connected-view:has-text("Long 19 INFY"):has-text("TCS long 8")'))
    await shot(page, 'connected-tab')
    await page.click('.connected-view button:has-text("Stop trading today")')
    check('a dangerous button asks first', await seen(page, '.cv-confirm:has-text("Open positions keep their stops")'))
    await page.click('.cv-confirm button.danger')
    await sleep(500)
    posts = await control(port, 'posts')
    check('then sends it', posts.some((p) => p.path === '/island/action' && p.body.action_id === 'stop_today'))
  } catch (e) {
    check('no crash', false, String(e?.stack ?? e))
  } finally {
    await app.close().catch(() => {})
    fake.kill()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in ${OUT}`)
    if (failed.length) {
      console.log(logs.join('').slice(-3000))
      process.exit(1)
    }
  }
})()
