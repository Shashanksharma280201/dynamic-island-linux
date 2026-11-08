// End-to-end test of the buddy against a stand-in AI: a question goes with a
// screenshot (a private window blacked out first), the answer is said with
// captions on the island, the pointer flies to the spot, a walkthrough goes
// step by step, "stop" stops it, and Settings › Buddy and Privacy steer it.
// Speech is written to a file instead of played (DI_TTS_LOG). Needs an X
// server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-buddy-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
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

;(async () => {
  const ai = await startFakeAi()
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ ai: { provider: 'anthropic' }, character: { id: 'bolt', name: 'Sparky' } }))
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
      DI_TTS_LOG: TTS,
      DI_EGRESS_COUNT_LOCAL: '1',
    },
  })
  const page = await app.firstWindow()
  const view = () => page.evaluate(() => window.island.buddy.get())
  const pointerWin = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((b) => b.getTitle() === 'Buddy pointer')
      return w ? { visible: w.isVisible(), id: w.id } : null
    })
  const arrowAt = () =>
    app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((b) => b.getTitle() === 'Buddy pointer')
      return w ? w.webContents.executeJavaScript("(() => { const a = document.getElementById('arrow'); return { x: a.style.getPropertyValue('--x'), y: a.style.getPropertyValue('--y'), on: a.classList.contains('on'), label: document.getElementById('label').textContent } })()") : null
    })
  const ask = (q) => page.evaluate((t) => window.island.buddy.ask(t), q)
  try {
    await page.waitForSelector('.island', { timeout: 15000 })
    await page.evaluate(() => window.settings?.setAiKey?.('anthropic', 'sk-ant-test-123')).catch(() => {})
    // The key is set through Settings (the island page has no settings API).
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('buddy'))])
    await settings.waitForSelector('#buddy', { timeout: 8000 })
    await settings.evaluate(() => window.settings.setAiKey('anthropic', 'sk-ant-test-123'))
    check('Settings has a Buddy page', await settings.isVisible('#buddy .toggle-row:has-text("Ask Sparky about your screen")'))

    // A private window, bright red, which must come out black.
    await app.evaluate(({ BrowserWindow }) => {
      const w = new BrowserWindow({ x: 100, y: 200, width: 400, height: 300, frame: false, show: true, title: 'KeePassXC - Passwords', backgroundColor: '#ff0000' })
      w.loadURL('data:text/html,<title>KeePassXC - Passwords</title><body style="background:%23ff0000"></body>')
    })
    await sleep(1200)

    // ---- a question about the screen ----
    const n = ai.log.length
    await ask('where do I change the wallpaper?')
    check('it thinks, then answers out loud', !!(await until(async () => /It’s the gear at the top right\./.test(said()))), said().trim())
    check('the island shows the caption', await page.waitForSelector('.buddy-pill .buddy-text:has-text("gear at the top right")', { timeout: 5000 }).then(() => true, () => false))
    const v = await view()
    check('it looked at the screen', v.looked === true && ai.log.length > n && !!ai.lastImage)
    check('and blacked out the private window', v.blanked === 1, `blanked ${v.blanked}`)
    if (ai.lastImage) {
      const px = await page.evaluate(async (b64) => {
        const img = new Image()
        img.src = `data:image/jpeg;base64,${b64}`
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const g = c.getContext('2d')
        g.drawImage(img, 0, 0)
        const k = img.width / 1920
        return Array.from(g.getImageData(Math.round(300 * k), Math.round(350 * k), 1, 1).data)
      }, ai.lastImage)
      check('the private window is black in what was sent', px[0] < 40 && px[1] < 40 && px[2] < 40, px.join(','))
    }
    const p = await until(async () => {
      const a = await arrowAt()
      return a?.on && a.x === '1801px' && a
    }, 5000)
    check('the pointer flies to the spot it named', !!p, JSON.stringify(await arrowAt()))
    check('with its label', p?.label === 'Settings gear')
    await page.screenshot({ path: `${OUT}/01-answer.png` })

    // ---- a walkthrough ----
    await ask('walk me through changing the wallpaper')
    check('a walkthrough says its first step', !!(await until(async () => /First open the menu at the top\./.test(said()))))
    check('and shows step 1 of 2', await page.waitForSelector('.buddy-pill .buddy-step:has-text("Step 1 of 2")', { timeout: 5000 }).then(() => true, () => false))
    check('pointing at the first spot', !!(await until(async () => (await arrowAt())?.label === '1/2 · Menu')))
    await until(async () => (await view()).phase === 'pointing', 5000)
    await page.screenshot({ path: `${OUT}/02-walkthrough.png` })
    await page.click('.buddy-pill button:has-text("Next")')
    check('Next goes to step 2, and says it', !!(await until(async () => (await view()).step === 1 && /Then choose Settings\./.test(said()))))
    check('the pointer moves there', !!(await until(async () => (await arrowAt())?.label === '2/2 · Settings')))
    await until(async () => (await view()).phase === 'pointing', 5000)
    await page.click('.buddy-pill button:has-text("Done")')
    check('Done puts it away', !!(await until(async () => (await view()).phase === 'idle' && !(await pointerWin())?.visible, 4000)))

    // ---- "stop" ----
    await ask('walk me through changing the wallpaper')
    await until(async () => (await view()).points.length === 2, 5000)
    await ask('stop')
    check('saying “stop” stops it', !!(await until(async () => (await view()).phase === 'idle', 4000)))

    // ---- not looking ----
    await settings.click('#buddy .toggle-row:has-text("Let it see the screen") input.switch')
    const before = ai.log.length
    ai.lastImage = ''
    await ask('what time zone am I in?')
    await until(async () => ai.log.length > before && (await view()).phase !== 'thinking', 8000)
    check('with the screen off, no screenshot goes', !ai.lastImage && (await view()).looked === false)
    await settings.click('#buddy .toggle-row:has-text("Let it see the screen") input.switch')

    // ---- privacy ----
    await settings.click('.side-item[data-section="privacy"]')
    check('Privacy lists the buddy’s questions', await settings.waitForSelector('#privacy .privacy-row:has-text("Buddy sent your question, with a screenshot")', { timeout: 4000 }).then(() => true, () => false))
    await settings.click('#privacy .toggle-row:has-text("Pause AI and the web") input.switch')
    const quiet = ai.log.length
    await ask('where do I change the wallpaper?')
    const paused = await until(async () => (await view()).error, 5000)
    check('paused, it neither looks nor asks', /Paused in Settings › Privacy/.test(paused ?? '') && ai.log.length === quiet, paused ?? '')
    await settings.click('#privacy .toggle-row:has-text("Pause AI and the web") input.switch')
    await page.screenshot({ path: `${OUT}/03-paused.png` })

    // ---- voice choice ----
    await settings.click('.side-item[data-section="buddy"]')
    await settings.click('#buddy .segmented button:has-text("Off")')
    await settings.click('#buddy button:has-text("Hear it")')
    check('“Hear it” says hello in the chosen voice', !!(await until(async () => /^off: Hi, I’m Sparky\./m.test(said()))), said().split('\n').slice(-2).join(' | '))
    await settings.screenshot({ path: `${OUT}/04-settings.png` })
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
