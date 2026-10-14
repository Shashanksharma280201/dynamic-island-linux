// End-to-end test of the notification center: the island's stack with Clear
// all and Undo, the Notifications tab (dismiss, Clear all, Undo), and Do Not
// Disturb. Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-notifs-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const SOCK = path.join(TMP, 'island.sock')
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
const notify = (app, summary, body) => {
  try {
    execFileSync(
      'gdbus',
      ['call', '--session', '--dest', 'org.freedesktop.Notifications', '--object-path', '/org/freedesktop/Notifications', '--method', 'org.freedesktop.Notifications.Notify', app, '0', '', summary, body, '[]', '{}', '5000'],
      { stdio: 'ignore', timeout: 3000 },
    )
  } catch {
    // nobody owns the name here; the island hears the call anyway
  }
}
const seen = (page, sel, ms = 4000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const gone = (page, sel, ms = 4000) => page.waitForSelector(sel, { state: 'detached', timeout: ms }).then(() => true, () => false)

;(async () => {
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1' },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })
  const rows = () => page.$$eval('.nc-row', (e) => e.length)

  try {
    await page.waitForSelector('.capsule.idle', { timeout: 8000 })

    // ---- A pile of cards on the island, cleared at once ----
    notify('Mail', 'Alice', 'Lunch at 1?')
    await sleep(250)
    notify('Slack', 'Design team', 'New mockups are up')
    await sleep(250)
    notify('Mail', 'Bob', 'Quarterly report attached')
    check('three notifications stack up with a count', await seen(page, '.notif-stack:has-text("2 more")'))
    check('the newest shows on top', await seen(page, '.card.notification:has-text("Bob")'))
    check('the card leaves the count to the pill', !(await page.$('.card.notification:has-text("Bob") .badge')))
    await sleep(500)
    await shot('01-stack-clear-all')
    await page.click('.notif-stack .clear')
    check('Clear all takes every card off the island', await gone(page, '.card.notification'))
    check('and offers Undo', await seen(page, '.notif-stack.toast:has-text("Cleared 3 notifications")'))
    await sleep(300)
    await shot('02-cleared-undo')
    await page.click('.notif-stack.toast .clear')
    check('Undo hides the note', await gone(page, '.notif-stack.toast'))

    // ---- The Notifications tab ----
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })
    await page.click('.rail-btn[aria-label="Notifications"]')
    check('Undo brought all three back to Notifications', await page.waitForFunction(() => document.querySelectorAll('.nc-row').length === 3, null, { timeout: 3000 }).then(() => true, () => false))
    const groups = await page.$$eval('.nc-app', (e) => e.map((x) => x.textContent))
    check('grouped by app, newest app first', groups.join(',') === 'Mail,Slack', groups.join(','))
    await sleep(600)
    await shot('03-notifications-tab')
    await page.click('.nc-row:has-text("Alice") .nc-x')
    check('× dismisses one', await page.waitForFunction(() => document.querySelectorAll('.nc-row').length === 2, null, { timeout: 3000 }).then(() => true, () => false))
    await page.click('.nc-clear')
    check('Clear all empties the tab', await seen(page, '.nc-empty'))
    check('with an Undo', await seen(page, '.nc-toast:has-text("Cleared 2 notifications")'))
    await sleep(400)
    await shot('04-all-caught-up')
    await page.click('.nc-toast .plain')
    check('Undo brings them back', await page.waitForFunction(() => document.querySelectorAll('.nc-row').length === 2, null, { timeout: 3000 }).then(() => true, () => false))

    // ---- Do Not Disturb ----
    await page.click('.nc-dnd')
    check('Do Not Disturb turns on from the tab', await seen(page, '.nc-banner'))
    await sleep(400)
    await shot('05-dnd-on')
    key('ctrl+i')
    await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    notify('Calendar', 'Standup in 5 min', 'Room 2')
    await sleep(1500)
    check('in Do Not Disturb no card pops up', !(await page.$('.card.notification')))
    check('the resting island shows a moon and how many are waiting', await seen(page, '.dnd-badge:has-text("1")'))
    await sleep(300)
    await shot('06-dnd-capsule')
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })
    await page.click('.rail-btn[aria-label="Notifications"]')
    check('it waits in Notifications instead', await seen(page, '.nc-row:has-text("Standup in 5 min")'))
    const cfg = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check('Do Not Disturb is saved', cfg().dnd === true)
    await page.click('.rail-btn[aria-label="Controls"]')
    await page.click('.toggle:has-text("Do Not Disturb")')
    check('and turns off from Control Center', await page.waitForFunction(() => document.querySelector('.toggle[data-on="no"] .label')?.textContent === 'Do Not Disturb', null, { timeout: 3000 }).then(() => true, () => false))
    check('saved off', cfg().dnd === false)
    await sleep(700)
    const saved = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'notification-center.json'), 'utf8'))
    check('the list is kept on disk for next time', saved.length === 3 && saved[0].title === 'Standup in 5 min', String(saved.length))
    key('ctrl+i')
    await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    notify('Mail', 'Carol', 'Back to normal')
    check('with it off, cards pop up again', await seen(page, '.card.notification:has-text("Carol")'))
  } catch (e) {
    check('unexpected error', false, e.message)
  } finally {
    const errs = logs.join('').split('\n').filter((l) => /error/i.test(l) && !/dbus|libva|gpu|GLib|Fontconfig|viz_main|bus\.cc|atom_cache|ozone/i.test(l))
    console.log(`app log errors: ${errs.length ? '\n' + errs.join('\n') : 'none'}\n`)
    await app.close().catch(() => {})
    const pass = results.filter((r) => r.ok).length
    console.log(`${pass}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(pass === results.length ? 0 : 1)
  }
})()
