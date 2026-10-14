// End-to-end test of the weekly recap: last week's counts show by themselves
// (Monday from 8 am, or the first chance after), the card's numbers, sharing
// it as an image (saved to Pictures), and showing it again from Settings.
// Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-recap-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const HOME = path.join(TMP, 'home')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
for (const d of [OUT, USER_DATA, path.join(HOME, 'Pictures')]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const seen = (page, sel, ms = 6000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)

// Last week, as the island would have counted it.
const monday = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7)
  return d
})()
const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
const H = 3_600_000
fs.writeFileSync(
  path.join(USER_DATA, 'recap.json'),
  JSON.stringify({
    shown: '',
    history: [
      { week: key, turns: 14, sessions: ['a', 'b', 'c', 'd', 'e'], codingMs: 7.5 * H, longestMs: 1.25 * H, files: 37, added: 912, removed: 205, commands: 48, allowed: 22, denied: 3, questions: 4, agents: { 'claude-code': 6 * H, codex: 1.5 * H }, projects: { shop: 5 * H, blog: 2.5 * H }, days: [H, 2 * H, 0.5 * H, 3 * H, H, 0, 0] },
    ],
  }),
)
const now = new Date()
const mondayMorning = (now.getDay() + 6) % 7 === 0 && now.getHours() < 8

;(async () => {
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...process.env, HOME, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1' },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })

  try {
    await page.waitForSelector('.capsule.idle', { timeout: 8000 })
    if (!mondayMorning) {
      check('last week’s recap shows by itself', await seen(page, '.recap-card', 30_000))
      await sleep(900) // it's saved a moment after
      const saved = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'recap.json'), 'utf8'))
      check('once: it remembers it was shown this week', saved.shown && saved.shown !== key, saved.shown)
    } else {
      console.log('(Monday before 8 am: the recap waits, as it should; showing it from Settings instead)')
    }
    if (!(await page.$('.recap-card'))) {
      await page.evaluate(() => window.island.openSettings('general'))
      let st = null
      for (let i = 0; i < 50 && !st; i++) {
        st = app.windows().find((p) => p.url().includes('settings.html'))
        await sleep(100)
      }
      await st.click('.toggle-row:has-text("Last week’s recap") button:has-text("Show")')
      await st.close()
    }
    check('the numbers', await seen(page, '.recap-chip:has-text("7 h 30 min")'))
    check('sessions, files, lines and commands', (await page.$$eval('.recap-chip b', (e) => e.map((x) => x.textContent))).join('|') === '7 h 30 min|5|37|+912 −205|48')
    check('and the highlights', await seen(page, '.recap-lines:has-text("Top project") >> text=shop'))
    check('busiest day', await seen(page, '.recap-lines:has-text("Thursday")'))
    await sleep(500)
    await shot('01-recap')
    await page.click('.recap-card button:has-text("Share image")')
    check('Share image draws a picture of the week', await seen(page, '.recap-thumb[src^="data:image/png"]'))
    await page.click('.recap-hide input')
    await sleep(800)
    await shot('02-recap-share')
    await page.click('.recap-card button:has-text("Save image")')
    check('Save image puts it in Pictures', await seen(page, '.recap-note:has-text("Saved as Weekly recap")'))
    const pics = fs.readdirSync(path.join(HOME, 'Pictures'))
    const png = pics.find((f) => /^Weekly recap .*\.png$/.test(f))
    const size = png ? fs.readFileSync(path.join(HOME, 'Pictures', png)).readUInt32BE(16) : 0
    check('a tall 1080 px image', size === 1080, `${png} ${size}`)
    await page.click('.recap-card .pill.primary:has-text("OK")')
    check('OK puts it away', (await page.waitForSelector('.recap-card', { state: 'detached', timeout: 3000 }).then(() => true, () => false)) && (await seen(page, '.capsule.idle')))
  } catch (e) {
    check('unexpected error', false, e.message)
  } finally {
    const errs = logs.join('').split('\n').filter((l) => /error/i.test(l) && !/dbus|libva|gpu|GLib|Fontconfig|viz_main|bus\.cc|atom_cache|ozone|shared_image_manager/i.test(l))
    console.log(`app log errors: ${errs.length ? '\n' + errs.join('\n') : 'none'}\n`)
    await app.close().catch(() => {})
    const pass = results.filter((r) => r.ok).length
    console.log(`${pass}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(pass === results.length ? 0 : 1)
  }
})()
