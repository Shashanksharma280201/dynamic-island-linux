// End-to-end test of the look and Privacy: the island in light and dark (with
// "Always dark"), the accent colour on the island and in Settings, and
// Settings › Privacy listing what the assistant sent and pausing it. Needs an
// X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-look-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
for (const d of [OUT, USER_DATA]) fs.mkdirSync(d, { recursive: true })

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

;(async () => {
  const ai = await startFakeAi()
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ theme: 'light', ai: { provider: 'anthropic' }, character: { id: 'bolt', name: 'Sparky' } }))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: {
      ...process.env,
      DI_USER_DATA: USER_DATA,
      DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
      DI_NO_GREETING: '1',
      DI_BACKDROP: 'off',
      DI_AI_BASE_URL: ai.base,
      // The stand-in AI runs on this computer; count it as away.
      DI_EGRESS_COUNT_LOCAL: '1',
    },
  })
  const page = await app.firstWindow()
  const island = (f) => page.evaluate(f)
  const theme = () => island(() => document.documentElement.dataset.theme)
  const accent = () => island(() => document.documentElement.style.getPropertyValue('--accent-light'))
  const ask = async (text) => {
    await page.evaluate((t) => window.island.claude.ask(t), text)
    return until(async () => {
      const run = (await page.evaluate(() => window.island.claude.state())).run
      return run && (run.phase === 'done' || run.phase === 'error') && run
    }, 10000)
  }
  try {
    await page.waitForSelector('.island', { timeout: 15000 })
    const at = await app.evaluate(({ BrowserWindow, screen }) => {
      const b = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')).getBounds()
      const a = screen.getPrimaryDisplay().workArea
      return { mid: b.x + b.width / 2, center: a.x + a.width / 2, top: b.y - a.y, narrow: b.width < a.width }
    })
    check('a new island sits at the top centre', Math.abs(at.mid - at.center) <= 1 && at.top === 0 && at.narrow, JSON.stringify(at))
    const pill = await page.evaluate(() => {
      const r = document.querySelector('.island-outer').getBoundingClientRect()
      return { mid: r.x + r.width / 2, top: r.y, w: window.innerWidth }
    })
    check('its pill centred in the band, just under the top', Math.abs(pill.mid - pill.w / 2) <= 2 && pill.top >= 0 && pill.top <= 24, JSON.stringify(pill))
    check('the island is light when the theme is light', !!(await until(async () => (await theme()) === 'light')))
    check('and its material is light', await island(() => getComputedStyle(document.documentElement).getPropertyValue('--material').includes('244')))

    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('general'))])
    await settings.waitForSelector('#general .accent-swatches', { timeout: 8000 })
    await settings.setViewportSize({ width: 900, height: 900 }).catch(() => {})
    check('Settings is light too', (await settings.evaluate(() => document.documentElement.dataset.theme)) === 'light')

    // ---- accent ----
    await settings.click('#general .accent-swatch[aria-label="Purple"]')
    check('picking an accent colours the island', !!(await until(async () => (await accent()) === '#a550d0')))
    check('and Settings', !!(await until(() => settings.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() === '#a550d0'))))
    check('it’s kept', JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8')).accent === 'purple')

    // ---- island colours ----
    await settings.click('#general .segmented button:has-text("Always dark")')
    check('“Always dark” keeps the island dark in a light theme', !!(await until(async () => (await theme()) === 'dark')))
    await settings.click('#general .segmented button:has-text("Match")')
    check('“Match” brings it back to light', !!(await until(async () => (await theme()) === 'light')))
    await settings.click('#general .segmented button:text-is("Dark")')
    check('the Dark theme makes both dark', !!(await until(async () => (await theme()) === 'dark' && (await settings.evaluate(() => document.documentElement.dataset.theme)) === 'dark')))
    await settings.click('#general .segmented button:text-is("Light")')
    await until(async () => (await theme()) === 'light')
    await settings.screenshot({ path: `${OUT}/01-general.png` })

    // ---- privacy ----
    await settings.evaluate(() => window.settings.setAiKey('anthropic', 'sk-ant-test-123'))
    const first = await ask('hello there')
    check('the assistant answers', first?.phase === 'done', first?.error ?? '')
    await settings.click('.side-item[data-section="privacy"]')
    check('Settings › Privacy lists where it went', await settings.waitForSelector(`#privacy .privacy-to:has-text("127.0.0.1")`, { timeout: 5000 }).then(() => true, () => false))
    check('and what went', await settings.waitForSelector('#privacy .privacy-row:has-text("Assistant sent your question")', { timeout: 3000 }).then(() => true, () => false))
    const n = ai.log.length
    await settings.click('#privacy .toggle-row:has-text("Pause AI and the web") input.switch')
    const paused = await ask('hello again')
    check('paused, the assistant sends nothing', paused?.phase === 'error' && /Paused in Settings › Privacy/.test(paused.error ?? '') && ai.log.length === n, paused?.error ?? paused?.phase)
    await settings.screenshot({ path: `${OUT}/02-privacy.png` })
    await settings.click('#privacy .toggle-row:has-text("Pause AI and the web") input.switch')
    const back = await ask('and again')
    check('turned off, it works again', back?.phase === 'done')
    check('the same send on the same day counts up', await settings.waitForSelector('#privacy .privacy-meta:has-text("2 times")', { timeout: 3000 }).then(() => true, () => false))
    await settings.click('#privacy button:has-text("Clear the list")')
    check('the list can be cleared', await settings.waitForSelector('#privacy :text("Nothing has left this computer yet.")', { timeout: 3000 }).then(() => true, () => false))
    check('searching finds Privacy', await (async () => {
      await settings.fill('.side-search input[type="search"]', 'pause')
      return settings.waitForSelector('.side-item[data-section="privacy"]', { timeout: 3000 }).then(() => true, () => false)
    })())
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await page.screenshot({ path: `${OUT}/03-island.png` }).catch(() => {})
    await app.close().catch(() => {})
    ai.close?.()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in ${OUT}`)
    process.exit(failed.length ? 1 : 0)
  }
})()
