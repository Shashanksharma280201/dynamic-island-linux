// End-to-end test of the Dashboard and the focus timer: a session that was
// running when the island closed carries on at the next start, shows on the
// notch, and says when it's done (then the break starts); the Dashboard
// opens first, with four tiles (what's playing, the timer, the day, this
// computer) you can change; the timer starts, pauses and stops from its
// tile and from the island's card; and nothing in a tile is cut off.
// Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-dash-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const SOCK = path.join(TMP, 'island.sock')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
const HOME = process.env.HOME && process.env.HOME !== os.userInfo().homedir ? process.env.HOME : path.join(TMP, 'home')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
for (const d of [OUT, USER_DATA, CLAUDE_DIR, HOME]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try {
      const v = await f()
      if (v) return v
    } catch {}
  }
  return null
}
const seen = (page, sel, ms = 5000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const gone = (page, sel, ms = 5000) => page.waitForSelector(sel, { state: 'detached', timeout: ms }).then(() => true, () => false)
const pointer = (x, y) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), String(Math.round(x * SCALE)), String(Math.round(y * SCALE))])
const pad = (n) => String(n).padStart(2, '0')
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

;(async () => {
  // At the top, as a notch. A focus session was running when the island last closed: it ends in a few seconds.
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'top', y: 0.3 }, buddy: { digest: false } }))
  const ENDS = Date.now() + 14_000
  fs.writeFileSync(path.join(USER_DATA, 'os-timer.json'), JSON.stringify({ phase: 'focus', endsAt: ENDS, left: null, done: 1, day: dayOf(new Date()) }))
  let playerLog = ''
  const player = spawn('node', [path.join(__dirname, 'fake-player.cjs')], { env: { ...process.env, FAKE_PLAYER_TITLES: 'Weightless|Two', FAKE_PLAYER_ARTIST: 'Marconi Union' } })
  player.stdout.on('data', (d) => (playerLog += d))
  await sleep(800)

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: {
      ...process.env,
      HOME,
      DYNAMIC_ISLAND_SOCK: SOCK,
      CLAUDE_CONFIG_DIR: CLAUDE_DIR,
      DI_USER_DATA: USER_DATA,
      DI_NO_GREETING: '1',
      DI_BACKDROP: 'off',
      DI_CLAUDE_BIN: '/nonexistent',
      DI_STATS_FAKE: JSON.stringify({ cpu: 23, mem: 61, memUsedGb: 9.8, memTotalGb: 16, battery: { pct: 84, charging: false } }),
    },
  })
  const page = await app.firstWindow()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {})
  const cfg = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
  const saved = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'os-timer.json'), 'utf8'))
  const togglePanel = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')).webContents.send('island:toggle-panel'))
  const kinds = () => page.$$eval('.dash-tile', (e) => e.map((t) => t.dataset.kind).join())
  const tileText = (kind) => page.$eval(`.dash-tile[data-kind="${kind}"]`, (e) => e.textContent)
  const clock = () => page.$eval('.dash-timer-clock', (e) => e.textContent)
  const islandBox = () =>
    page.evaluate(() => {
      const r = document.querySelector('.island-outer > .island').getBoundingClientRect()
      return { x: r.left, y: r.top, w: Math.round(r.width), h: Math.round(r.height), cx: r.left + r.width / 2, cy: r.top + r.height / 2, W: innerWidth }
    })
  // Anything inside a tile that pokes out of it.
  const cut = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.dash-tile')].flatMap((t) => {
        const p = t.getBoundingClientRect()
        return [...t.querySelectorAll('*')]
          .filter((e) => {
            const r = e.getBoundingClientRect()
            return r.width > 0 && (r.right > p.right + 0.5 || r.bottom > p.bottom + 0.5 || r.left < p.left - 0.5)
          })
          .map((e) => `${t.dataset.kind}: ${String(e.className?.baseVal ?? e.className) || e.tagName}`)
      }),
    )
  // Words shortened with an ellipsis that shouldn't be.
  const shortened = (sel) => page.$$eval(sel, (e) => e.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent))
  try {
    pointer(5, 700)
    // ---- A session carries on from before ----
    check('a session that was running when the island closed carries on', await seen(page, '.timer-capsule[data-phase="focus"]', 15000))
    const t0 = await page.$eval('.timer-capsule .timer-time', (e) => e.textContent)
    check('what is left counts down on the notch', /^00:(0\d|1[0-4])$/.test(t0), t0)
    // (Once it has settled: the music's bubble is still sliding out beside it.)
    const notchOk = (n) => n.w === 188 && n.h === 40 && Math.abs(n.cx - n.W / 2) <= 1 && n.y === 0
    await until(async () => notchOk(await islandBox()), 4000)
    const n = await islandBox()
    check('the notch keeps its size and its place with the timer in it', notchOk(n), JSON.stringify(n))
    check('the time of day stays beside it', await page.isVisible('.notch-clock'))
    await shot('01-notch-timer')

    // ---- It runs out: you're told, and the break starts ----
    check('when the session ends, the island says so', await seen(page, '.card.notification:has-text("Focus session done")', 25000))
    const told = await page.$eval('.card.notification', (e) => e.textContent)
    check('with how many that makes today, and the break', /2 today/.test(told) && /5 minutes/.test(told), told)
    await shot('02-session-done')
    check('the session is counted and kept', (() => { const s = saved(); return s.phase === 'break' && s.done === 2 && s.endsAt > Date.now() })(), JSON.stringify(saved()))
    await page.evaluate(() => window.island.dismiss('timer-done'))
    check('the break shows on the notch', await seen(page, '.timer-capsule[data-phase="break"]', 5000))

    // ---- The Dashboard opens first ----
    await togglePanel()
    check('the island opens on the Dashboard', (await seen(page, '.dashboard', 5000)) && (await page.isVisible('.rail-btn[aria-label="Dashboard"][aria-selected="true"]')))
    check('its section has a dot while the timer runs', await page.isVisible('.rail-btn[aria-label="Dashboard"].running'))
    check('four tiles: what is playing, the timer, the day, this computer', (await kinds()) === 'media,timer,day,system', await kinds())
    const head = await page.$eval('.dash-head', (e) => e.textContent)
    const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' })
    check('the day and the battery across the top', head.includes(weekday) && head.includes('84%'), head)

    // The timer's tile: the break, then at rest.
    check('the timer tile shows the break and the sessions done', /Break/.test(await tileText('timer')) && /2 done today/.test(await tileText('timer')), await tileText('timer'))
    await page.click('.dash-timer-btns button:has-text("Skip")')
    check('Skip ends the break', await seen(page, '.dash-timer[data-phase="idle"]', 4000))
    check('at rest it shows a whole session', (await clock()) === '25:00', await clock())
    check('and the Dashboard’s dot goes', !(await page.isVisible('.rail-btn[aria-label="Dashboard"].running')))
    await page.click('.dash-lengths button:has-text("45")')
    check('a longer session can be chosen', !!(await until(async () => (await clock()) === '45:00', 4000)), await clock())
    check('and is saved, with its break', !!(await until(() => cfg().dashboard?.timer?.focusMin === 45 && cfg().dashboard.timer.breakMin === 10, 4000)), JSON.stringify(cfg().dashboard))
    await page.click('.dash-lengths button:has-text("25")')
    await until(async () => (await clock()) === '25:00', 4000)
    await sleep(300)
    await shot('03-dashboard')

    await page.click('.dash-start')
    check('Start begins a session', await seen(page, '.dash-timer[data-phase="focus"]', 4000))
    check('and its clock counts down', !!(await until(async () => /^24:5\d$/.test(await clock()), 4000)), await clock())
    await page.click('.dash-timer-btns button:has-text("Pause")')
    check('Pause holds it', await seen(page, '.dash-timer[data-paused="yes"]', 4000))
    const held = await clock()
    await sleep(1600)
    check('paused, the clock stands still', (await clock()) === held, `${held} then ${await clock()}`)
    await page.click('.dash-timer-btns button:has-text("Resume")')
    check('Resume carries on', await seen(page, '.dash-timer[data-phase="focus"]:not([data-paused])', 4000))
    await sleep(300)
    await shot('04-timer-running')

    // ---- The other tiles ----
    const sys = await tileText('system')
    check('this computer: processor, memory and battery', sys.includes('23%') && sys.includes('9.8 of 16 GB') && sys.includes('84%'), sys)
    const at = new Date()
    const pct = Math.round(((at - new Date(at.getFullYear(), at.getMonth(), at.getDate())) / 86_400_000) * 100)
    const day = await page.$eval('.dash-tile[data-kind="day"] .dash-big', (e) => parseInt(e.textContent, 10))
    check('the day so far, in percent', Math.abs(day - pct) <= 1, `${day} vs ${pct}`)
    check('one mark an hour, the ones gone lit', (await page.$$('.dash-hours span')).length === 24 && (await page.$$('.dash-hours span.gone')).length === at.getHours())
    check('what is playing, by name', (await tileText('media')).includes('Weightless') && (await tileText('media')).includes('Marconi Union'), await tileText('media'))
    await page.click('.dash-tile[data-kind="media"] button[aria-label="Pause"]')
    check('its buttons work the player', !!(await until(() => playerLog.includes('STATUS Paused'), 4000)), playerLog.trim().split('\n').pop())
    check('nothing in a tile is cut off', (await cut()).length === 0, (await cut()).join(' | '))
    const panel = await page.evaluate(() => {
      const r = document.querySelector('.island-outer > .island').getBoundingClientRect()
      return { bottom: Math.round(r.bottom), H: innerHeight, right: Math.round(r.right), W: innerWidth, left: Math.round(r.left) }
    })
    check('the Dashboard fits on the screen', panel.bottom <= panel.H && panel.left >= 0 && panel.right <= panel.W, JSON.stringify(panel))

    // ---- Choosing the tiles ----
    await page.click('.dash-edit')
    check('Edit offers every kind of tile in each place', (await page.$$('.dash-tile .dash-choose')).length === 4 && (await page.$$('.dash-tile[data-slot="0"] .dash-choose button')).length === 6)
    check('with their names in full', (await shortened('.dash-choose button span')).length === 0, (await shortened('.dash-choose button span')).join())
    check('nothing in a tile is cut off while choosing', (await cut()).length === 0, (await cut()).join(' | '))
    await shot('05-edit')
    await page.click('.dash-tile[data-slot="2"] .dash-choose button:has-text("Next up")')
    check('a tile can be changed', !!(await until(async () => (await kinds()) === 'media,timer,next,system', 4000)), await kinds())
    await page.click('.dash-tile[data-slot="3"] .dash-choose button:has-text("Claude")')
    await until(async () => (await kinds()) === 'media,timer,next,claude', 4000)
    await page.click('.dash-tile[data-slot="0"] .dash-choose button:has-text("Focus timer")')
    check('choosing one that is already showing swaps the two', !!(await until(async () => (await kinds()) === 'timer,media,next,claude', 4000)), await kinds())
    check('and the choice is saved', cfg().dashboard?.tiles?.join() === 'timer,media,next,claude', JSON.stringify(cfg().dashboard))
    await page.click('.dash-edit')
    check('Done shows the tiles again', (await gone(page, '.dash-choose', 3000)) && (await kinds()) === 'timer,media,next,claude')
    check('the timer went on running meanwhile', !!(await until(async () => held !== (await clock()) && /^24:\d\d$/.test(await clock()), 5000)), `${held} then ${await clock()}`)
    check('Next up and Claude say when there is nothing', /Nothing else today/.test(await tileText('next')) && /Quiet/.test(await tileText('claude')), `${await tileText('next')} / ${await tileText('claude')}`)
    check('nothing in these tiles is cut off either', (await cut()).length === 0, (await cut()).join(' | '))
    await sleep(300)
    await shot('06-other-tiles')
    await page.click('.dash-tile[data-kind="next"]', { button: 'right' })
    check('a right-click on a tile starts choosing too', await seen(page, '.dash-tile .dash-choose', 3000))
    await page.click('.dash-edit')
    await gone(page, '.dash-choose', 3000)
    await page.click('.dash-tile[data-kind="claude"] .dash-tile-title')
    check('the Claude tile opens Claude', await seen(page, '.rail-btn[aria-label="Claude"][aria-selected="true"]', 3000))

    // ---- On the island while it runs ----
    await togglePanel()
    await gone(page, '.hub', 4000)
    // (The test's clicks came from a pointer of their own: take it off the island too.)
    pointer(5, 700)
    await page.mouse.move(5, 500)
    check('closed, the running timer is on the notch', await seen(page, '.timer-capsule[data-phase="focus"]', 5000))
    // (Once it has finished closing: measured while it shrinks, its middle is lower than where it comes to rest.)
    await until(async () => notchOk(await islandBox()), 4000)
    const b = await islandBox()
    check('and the notch is back to its size', notchOk(b), JSON.stringify(b))
    pointer(b.cx, b.cy)
    await page.mouse.move(b.cx, b.cy)
    check('resting the pointer on it says what is left', await seen(page, '.peek .peek-title:text-matches("^Focus · 2[34]:\\\\d\\\\d left$")', 5000))
    check('and then opens its card', await seen(page, '.timer-card', 6000))
    await sleep(500)
    await shot('07-timer-card')
    await page.click('.timer-card button:has-text("Pause")')
    check('the card pauses it', await seen(page, '.timer-card[data-paused="yes"] button:has-text("Resume")', 4000))
    await page.click('.timer-card button:has-text("Stop")')
    check('and stops it: the timer leaves the island', (await gone(page, '.timer-card', 6000)) && !(await page.$('.timer-capsule')))
    check('a session stopped early isn’t counted', (() => { const s = saved(); return s.phase === 'idle' && s.done === 2 })(), JSON.stringify(saved()))
    pointer(5, 700)
    check('the page raised no errors', pageErrors.length === 0, pageErrors.join(' | '))
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await app.close().catch(() => {})
    player.kill()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(failed.length ? 1 : 0)
  }
})()
