// End-to-end test of the services you can follow (e2e/fake-services.cjs plays
// GitHub, Vercel, Stripe, Resend, Notion, Cal.com and n8n): keys set in
// Settings (a wrong one is refused), each card in the Services tab, and a
// heads-up on the island for a failed deploy, failing CI, a new payment and a
// failed workflow. Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync, spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-services-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
fs.mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const key = (combo) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'key', combo])
const seen = (page, sel, ms = 6000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const post = (port, p, body) =>
  new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => (res.resume(), res.on('end', resolve)))
    r.end(JSON.stringify(body))
  })
const getJson = (port, p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve(JSON.parse(b))) }))

;(async () => {
  const fake = spawn('node', [path.join(__dirname, 'fake-services.cjs')], { stdio: ['ignore', 'pipe', 'inherit'] })
  const port = await new Promise((r) => fake.stdout.on('data', (d) => /port (\d+)/.test(d) && r(Number(/port (\d+)/.exec(d)[1]))))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...process.env, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1', DI_SERVICES_BASE: `http://127.0.0.1:${port}` },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })
  // Pages the island opens go here instead of a browser.
  await app.evaluate(({ shell }) => {
    globalThis.__opened = []
    shell.openExternal = async (u) => void globalThis.__opened.push(u)
  })

  try {
    await page.waitForSelector('.capsule.idle', { timeout: 8000 })

    // ---- An empty tab says how to start ----
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })
    await page.click('.rail-btn[aria-label="Services"]')
    check('with nothing set up, the Services tab says what it does', await seen(page, '.services-view .empty:has-text("Follow your services here")'))

    // ---- Settings: keys ----
    await page.click('.services-view .empty button:has-text("Set Up")')
    let settings = null
    for (let i = 0; i < 50 && !settings; i++) {
      settings = app.windows().find((p) => p.url().includes('settings.html'))
      await sleep(100)
    }
    await settings.waitForSelector('#services', { timeout: 5000 })
    const row = (id) => `#services .service-row[data-service="${id}"]`
    await settings.click(`${row('github')} input.switch`)
    await settings.fill(`${row('github')} input[type=password]`, 'wrong')
    await settings.click(`${row('github')} button:has-text("Save")`)
    check('a wrong key is refused, saying why', await seen(settings, `${row('github')} .service-status.bad:has-text("didn’t accept the key (401)")`))
    await settings.fill(`${row('github')} input[type=password]`, 'good')
    await settings.click(`${row('github')} button:has-text("Save")`)
    check('a good one connects', await seen(settings, `${row('github')} .service-status.ok`))
    const cfg = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check('and is stored encrypted, not as typed', !JSON.stringify(cfg().services).includes('"good"') && !!cfg().services.github.secret)
    for (const id of ['vercel', 'stripe', 'resend', 'notion', 'calcom', 'n8n']) {
      await settings.click(`${row(id)} input.switch`)
      if (id === 'n8n') await settings.fill(`${row(id)} input[aria-label="n8n Instance"]`, 'https://n8n.example.com')
      await settings.fill(`${row(id)} input[type=password]`, 'good')
      await settings.click(`${row(id)} button:has-text("Save")`)
      await settings.waitForSelector(`${row(id)} .service-status.ok`, { timeout: 6000 })
    }
    check('all seven connect', Object.values(cfg().services).every((s) => s.on && s.secret))
    await settings.close()

    // ---- The cards ----
    const card = (id) => `.svc-card[data-service="${id}"]`
    check('GitHub: reviews waiting, and my PR with its CI', (await seen(page, `${card('github')} .svc-big:has-text("2")`)) && (await seen(page, `${card('github')} .svc-row:has-text("Fix the cart total") .svc-dot.busy`)))
    check('Vercel: the deploy, building', await seen(page, `${card('vercel')} .svc-row:has-text("shop-site") .svc-side:has-text("Building")`))
    check('Stripe: the balance and payments', (await seen(page, `${card('stripe')} .svc-big:has-text("$1,240.50")`)) && (await seen(page, `${card('stripe')} .svc-row:has-text("Starter plan")`)))
    check('Resend: emails', await seen(page, `${card('resend')} .svc-row:has-text("Your receipt")`))
    check('Notion: recent pages', await seen(page, `${card('notion')} .svc-row:has-text("🗺 Roadmap")`))
    check('Cal.com: the next call', await seen(page, `${card('calcom')} .svc-row:has-text("Intro call")`))
    check('n8n: executions, by workflow name', await seen(page, `${card('n8n')} .svc-row:has-text("Daily digest")`))
    const hits = await getJson(port, '/__hits')
    check('each API asked the right way', hits.some((h) => h.service === 'notion' && h.method === 'POST' && h.notionVersion) && hits.some((h) => h.service === 'calcom' && h.calVersion) && hits.some((h) => h.service === 'github' && h.gh))
    await sleep(500)
    await shot(page, '01-services-tab')
    await page.click(`${card('github')} .svc-row:has-text("Fix the cart total")`)
    await sleep(300)
    const opened = await app.evaluate(() => globalThis.__opened)
    check('a row opens its page', opened.includes('https://github.com/me/shop/pull/12'), JSON.stringify(opened))
    key('ctrl+i')
    await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })

    // ---- Heads-ups on the island ----
    const refresh = (id) => page.evaluate((id) => window.island.services.refresh(id), id)
    await post(port, '/__state', { deployState: 'ERROR' })
    await refresh('vercel')
    check('a failed deploy pops up', await seen(page, '.card.notification:has-text("Deploy failed: shop-site")'))
    await sleep(400)
    await shot(page, '02-deploy-failed')
    await page.click('.card.notification')
    await post(port, '/__state', { ci: 'failing' })
    await refresh('github')
    check('CI breaking on my PR pops up', await seen(page, '.card.notification:has-text("CI failed: Fix the cart total")'))
    await page.click('.card.notification')
    await post(port, '/__state', { charges: [{ id: 'ch_2', amount: 4200, currency: 'eur', description: 'Pro plan', created: Math.floor(Date.now() / 1000), paid: true, status: 'succeeded' }] })
    await refresh('stripe')
    check('a new payment pops up', await seen(page, '.card.notification:has-text("+€42.00")'))
    await page.click('.card.notification')
    await post(port, '/__state', { execStatus: 'error' })
    await refresh('n8n')
    check('a failed workflow pops up', await seen(page, '.card.notification:has-text("Workflow failed: Daily digest")'))
    await page.click('.card.notification')
    const center = await page.evaluate(() => window.island.notifications.view())
    check('and they wait in Notifications too', center.entries.some((e) => /Deploy failed/.test(e.title)) && center.entries.some((e) => /Workflow failed/.test(e.title)))
  } catch (e) {
    check('unexpected error', false, e.message)
  } finally {
    const errs = logs.join('').split('\n').filter((l) => /error/i.test(l) && !/dbus|libva|gpu|GLib|Fontconfig|viz_main|bus\.cc|atom_cache|ozone|shared_image_manager/i.test(l))
    console.log(`app log errors: ${errs.length ? '\n' + errs.join('\n') : 'none'}\n`)
    await app.close().catch(() => {})
    fake.kill()
    const pass = results.filter((r) => r.ok).length
    console.log(`${pass}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(pass === results.length ? 0 : 1)
  }
})()
