// End-to-end test of the island's everyday conveniences: the countdown on
// cards that close by themselves (it stops while you hover; the pin keeps the
// card), the shortcuts sheet in the Control Center, changing a shortcut in
// Settings (and being told when it's taken), and opening on hover. Needs an X
// server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-ease-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
fs.mkdirSync(OUT, { recursive: true })
// A tiny WAV (a tenth of a second of silence) for "your own sounds".
const wav = () => {
  const data = Buffer.alloc(1600 * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0), h.writeUInt32LE(36 + data.length, 4), h.write('WAVE', 8), h.write('fmt ', 12)
  h.writeUInt32LE(16, 16), h.writeUInt16LE(1, 20), h.writeUInt16LE(1, 22), h.writeUInt32LE(16000, 24)
  h.writeUInt32LE(32000, 28), h.writeUInt16LE(2, 32), h.writeUInt16LE(16, 34), h.write('data', 36), h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
fs.mkdirSync(path.join(USER_DATA, 'sounds'), { recursive: true })
fs.writeFileSync(path.join(USER_DATA, 'sounds', 'done.wav'), wav())

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const xt = (...a) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), ...a.map(String)]).toString().trim()
const pointer = (x, y) => xt(Math.round(x * SCALE), Math.round(y * SCALE))
const key = (combo) => xt('key', combo)
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
    env: { ...process.env, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1' },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })
  const cfg = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
  const islandCenter = () =>
    page.evaluate(() => {
      const b = document.querySelector('.island-outer').getBoundingClientRect()
      return { x: window.screenX + b.x + b.width / 2, y: window.screenY + b.y + b.height / 2 }
    })
  const away = () => pointer(40, 1000)

  try {
    await page.waitForSelector('.capsule.idle', { timeout: 8000 })

    // ---- A card's countdown ----
    notify('Calendar', 'Standup in 5 minutes', 'Room 2')
    check('a card that closes by itself shows its countdown', await seen(page, '.card.notification + .close-row .close-bar span, .close-row .close-bar span'))
    await sleep(1200)
    const width = () => page.$eval('.close-bar span', (e) => e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width).catch(() => -1)
    const w1 = await width()
    check('and it runs down', w1 > 0.4 && w1 < 0.95, w1.toFixed(2))
    await shot(page, '01-countdown')
    const c = await islandCenter()
    pointer(c.x, c.y)
    check('hovering stops it', await seen(page, '.close-bar.held'))
    const w2 = await width()
    await sleep(800)
    const w3 = await width()
    check('it stays put while you hover', Math.abs(w3 - w2) < 0.02, `${w2.toFixed(2)} -> ${w3.toFixed(2)}`)
    check('and offers a pin', await seen(page, '.pin-btn'))
    await shot(page, '02-held-pin')
    await page.click('.pin-btn')
    check('pinning drops the countdown', await gone(page, '.close-row'))
    away()
    await sleep(7000)
    check('and the card stays well past its time', !!(await page.$('.card.notification:has-text("Standup")')))
    await page.click('.card.notification')
    check('until you close it', await gone(page, '.card.notification'))

    // ---- The shortcuts sheet ----
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })
    await page.click('.rail-btn[aria-label="Controls"]')
    await page.click('.panel-foot button:has-text("Shortcuts")')
    check('the Control Center lists the shortcuts', await seen(page, '.shortcut-sheet .sheet-row:has-text("Open or close the island") kbd:has-text("Ctrl+I")'))
    check('with the approval keys', await seen(page, '.shortcut-sheet .sheet-row:has-text("Always Allow") kbd:has-text("Ctrl+Alt+A")'))
    await sleep(300)
    await shot(page, '03-shortcut-sheet')

    // ---- Change one in Settings ----
    await page.click('.sheet-change')
    const settings = await (async () => {
      for (let i = 0; i < 50; i++) {
        const w = app.windows().find((p) => p.url().includes('settings.html'))
        if (w) return w
        await sleep(100)
      }
      return null
    })()
    check('"Change keys" opens Settings', !!settings)
    await settings.waitForSelector('#shortcuts .key-recorder[data-shortcut="voice"]', { timeout: 5000 })
    await settings.click('#shortcuts .key-recorder[data-shortcut="voice"]')
    check('click a shortcut and it waits for keys', await seen(settings, '.key-recorder.recording'))
    await settings.keyboard.press('Shift+K')
    check('Shift alone is refused (that is typing)', await seen(settings, '#shortcuts .hint:has-text("Ctrl, Alt or Super")'))
    await settings.keyboard.press('Control+Alt+K')
    check('new keys are saved', await (async () => {
      for (let i = 0; i < 30; i++) {
        if (cfg().keys?.voice === 'Control+Alt+K') return true
        await sleep(100)
      }
      return false
    })(), JSON.stringify(cfg().keys))
    check('and shown', await seen(settings, '.key-recorder[data-shortcut="voice"]:has-text("Ctrl+Alt+K")'))
    check('the island knows them too', await seen(page, '.shortcut-sheet .sheet-row:has-text("Talk to Claude") kbd:has-text("Ctrl+Alt+K")'))
    await settings.click('#shortcuts .key-recorder[data-shortcut="allow"]')
    await settings.keyboard.press('Control+Alt+K')
    check('keys another shortcut uses are refused, saying which', await seen(settings, '#shortcuts .error-text:has-text("Talk to Claude already uses Ctrl+Alt+K")'))
    check('and nothing changes', cfg().keys.allow === 'Control+Alt+Y')
    await shot(settings, '04-settings-shortcuts')
    await settings.click('#shortcuts .toggle-row:has(.key-recorder[data-shortcut="voice"]) button.link:has-text("Reset")')
    check('Reset puts the default back', await seen(settings, '.key-recorder[data-shortcut="voice"]:has-text("Ctrl+Alt+Space")'))

    // ---- Which display ----
    check('Settings offers where the island lives', (await settings.$$eval('#general select.display-select option', (o) => o.map((x) => x.value))).join() === 'primary,cursor')
    await settings.selectOption('#general select.display-select', 'cursor')
    check('"the display with the pointer" is saved', await (async () => {
      for (let i = 0; i < 30; i++) {
        if (cfg().display === 'cursor') return true
        await sleep(100)
      }
      return false
    })())
    check('and the island is still on screen', await seen(page, '.island-outer'))
    await settings.selectOption('#general select.display-select', 'primary')

    // ---- Your own sounds ----
    await settings.click('#general .toggle-row:has-text("Sounds") input.switch')
    check('with sounds on, Settings says which files it uses', await seen(settings, '#general .hint:has-text("Using yours for: done")'))
    const served = await page.evaluate(() => fetch('island-media://sound/done').then((r) => [r.status, r.headers.get('content-type')]))
    check('the island can play your file', served[0] === 200 && served[1] === 'audio/wav', JSON.stringify(served))
    fs.writeFileSync(path.join(USER_DATA, 'sounds', 'ask.wav'), wav())
    check('a file added later is picked up', await seen(settings, '#general .hint:has-text("Using yours for: ask, done")', 5000))
    await settings.click('#general .toggle-row:has-text("Sounds") input.switch')

    // ---- Show me around ----
    const kept = (await page.evaluate(() => window.island.notifications.view())).entries.length
    await settings.click('button:has-text("Start Tour")')
    check('Start Tour begins the tour on the island', await seen(page, '.tour-bar .tour-title:has-text("Hi, I")'))
    await shot(page, '05-tour-hello')
    await page.click('.tour-next')
    check('step 2 shows music, opened', await seen(page, '.card.media:has-text("Midnight City")'))
    await page.click('.tour-next')
    check('step 3: notifications, with Clear all', await seen(page, '.notif-stack:has-text("2 more")'))
    await sleep(300)
    await shot(page, '06-tour-notifications')
    await page.click('.notif-stack .clear')
    check("the tour's Clear all just moves on", await seen(page, '.tour-title:has-text("Claude Code, from any terminal")'))
    check("and doesn't touch your real notifications", (await page.evaluate(() => window.island.notifications.view())).entries.length === kept)
    check('a working session, opened', await seen(page, '.session-card.working'))
    await page.click('.tour-next')
    check('a question from Claude', await seen(page, '.question-card:has-text("tax rate")'))
    await shot(page, '07-tour-question')
    await page.click('.tour-next')
    check('a finished session', await seen(page, '.session-card.done:has-text("All 42 tests pass")'))
    await page.click('.tour-bar button:has-text("Back")')
    check('Back goes back', await seen(page, '.question-card'))
    await page.click('.tour-next')
    await page.click('.tour-next')
    check('the last step says Done', await seen(page, '.tour-next:has-text("Done")'))
    await page.click('.tour-next')
    check('and the island is yours again', (await gone(page, '.tour-bar')) && (await seen(page, '.capsule.idle')))

    // ---- The desktop companion ----
    await settings.click('#character .toggle-row:has-text("On your desktop too") input.switch')
    const buddy = await (async () => {
      for (let i = 0; i < 50; i++) {
        const w = app.windows().find((p) => p.url().includes('companion.html'))
        if (w) return w
        await sleep(100)
      }
      return null
    })()
    check('the character can sit on the desktop too', !!buddy && (await seen(buddy, '.companion[data-mood]')))
    const hook = (input) =>
      new Promise((resolve) => {
        const p = require('child_process').spawn('node', [path.join(ROOT, 'hook/claude-island-hook-events.cjs')], { env: { ...process.env, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock') } })
        p.on('close', resolve)
        p.stdin.end(JSON.stringify({ session_id: 'c1', cwd: '/home/me/site', ...input }))
      })
    await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'tidy the css' })
    await hook({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'color' } })
    check('it acts out what Claude is doing', await seen(buddy, '.companion[data-mood="searching"]'))
    await buddy.screenshot({ path: `${OUT}/11-companion.png`, omitBackground: true })
    await hook({ hook_event_name: 'SessionEnd' })
    const where = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Companion')?.getPosition())
    const before = await where()
    await buddy.mouse.move(60, 60)
    await buddy.mouse.down()
    for (let i = 1; i <= 5; i++) await buddy.mouse.move(60 - i * 8, 60 - i * 6)
    await buddy.mouse.up()
    await sleep(300)
    const after = await where()
    check('drag it anywhere', after[0] < before[0] && after[1] < before[1], `${before} -> ${after}`)
    check('and it remembers the spot', JSON.stringify(cfg().companion?.at) === JSON.stringify({ x: after[0], y: after[1] }), JSON.stringify(cfg().companion))
    await buddy.click('.companion')
    check('a click opens the island', await seen(page, '.hub'))
    key('ctrl+i')
    await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    await settings.click('#character .toggle-row:has-text("On your desktop too") input.switch')
    check('and it goes when turned off', await (async () => {
      for (let i = 0; i < 30; i++) {
        if (!app.windows().some((p) => p.url().includes('companion.html'))) return true
        await sleep(100)
      }
      return false
    })())

    // ---- Open on hover ----
    await settings.click('.toggle-row:has-text("Open the panel when the pointer rests on the island") input.switch')
    check('"Open on hover" is saved', await (async () => {
      for (let i = 0; i < 30; i++) {
        if (cfg().openOnHover === true) return true
        await sleep(100)
      }
      return false
    })())
    await settings.close()
    // (The tour closed the panel.)
    if (await page.$('.hub')) {
      key('ctrl+i')
      await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    }
    away()
    // Playwright's clicks leave its mouse over the island: take it off (and
    // say so: a click that removed the button under it sends no mouseleave).
    const [, h] = await page.evaluate(() => [innerWidth, innerHeight])
    await page.mouse.move(4, h - 4)
    await page.evaluate(() => document.querySelector('.island-outer').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await page.waitForSelector('.capsule.idle', { timeout: 4000 })
    await sleep(500)
    const c2 = await islandCenter()
    pointer(c2.x, c2.y)
    check('resting on the island opens the panel', await seen(page, '.hub', 5000))
    await shot(page, '05-open-on-hover')
    away()
    check('and it closes again when you move away', await gone(page, '.hub', 5000))

    // ---- The wardrobe ----
    if (await page.$('.hub')) {
      key('ctrl+i')
      await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 })
    }
    away()
    await page.mouse.move(4, (await page.evaluate(() => innerHeight)) - 4)
    await page.evaluate(() => document.querySelector('.island-outer').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await page.waitForSelector('.capsule.idle', { timeout: 4000 })
    await page.click('.capsule.idle', { button: 'right' })
    check('right-click the island to dress it up', await seen(page, '.wardrobe-card'))
    check('every outfit to pick', (await page.$$('.wardrobe-card .wardrobe-item')).length === 15)
    await sleep(500)
    await shot(page, '08-wardrobe')
    await page.click('.wardrobe-card .wardrobe-item[data-outfit="crown"]')
    await page.click('.wardrobe-card .swatch[aria-label="Sky"]')
    check('the outfit and colour are saved', await (async () => {
      for (let i = 0; i < 30; i++) {
        const c = cfg().character
        if (c?.outfit === 'crown' && c?.color === '#5ac8fa') return true
        await sleep(100)
      }
      return false
    })(), JSON.stringify(cfg().character))
    await sleep(400)
    await shot(page, '09-wardrobe-crown')
    await page.click('.wardrobe-card button:has-text("Done")')
    check('and the island wears them', await seen(page, '.capsule.idle svg.character[data-outfit="crown"]'))
    await sleep(400)
    await shot(page, '10-capsule-crown')

    // ---- Dictate anywhere: what you said is typed into the app you're in ----
    const fakeApp = (cls) => {
      const p = require('child_process').spawn('node', [path.join(__dirname, 'fake-keys-app.cjs'), cls], { stdio: ['ignore', 'pipe', 'inherit'] })
      let out = ''
      p.stdout.on('data', (d) => (out += d))
      return { out: () => out, ready: async () => { for (let i = 0; i < 50 && !/window/.test(out); i++) await sleep(100) }, close: () => p.kill() }
    }
    await app.evaluate(({ clipboard }) => clipboard.writeText('my own clipboard'))
    const editor = fakeApp('gedit')
    await editor.ready()
    await sleep(300)
    const typed = await page.evaluate(() => window.island.dictate.type('hello from the island'))
    await sleep(300)
    check('dictated text is pasted into the focused app', typed === true && /KEY 76 4\b/.test(editor.out()), editor.out().trim().split('\n').slice(-3).join(' | '))
    check('through the clipboard', (await app.evaluate(({ clipboard }) => clipboard.readText())) === 'hello from the island')
    await sleep(1000)
    check('which is put back afterwards', (await app.evaluate(({ clipboard }) => clipboard.readText())) === 'my own clipboard')
    editor.close()
    const term = fakeApp('gnome-terminal-server')
    await term.ready()
    await sleep(300)
    await page.evaluate(() => window.island.dictate.type('ls -la'))
    await sleep(300)
    check('in a terminal it pastes with Ctrl+Shift+V', /KEY 76 5\b/.test(term.out()), term.out().trim().split('\n').slice(-2).join(' | '))
    term.close()
    key('ctrl+alt+d')
    check('the dictate shortcut shows the dictation pill', await seen(page, '.dictate-pill .dictate'))
    await sleep(400)
    await shot(page, '12-dictate')
    const x = await page.$('.dictate-x')
    if (x) await x.click()
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
