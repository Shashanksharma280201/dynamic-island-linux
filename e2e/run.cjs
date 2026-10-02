// End-to-end test of the real Electron app. Needs an X server and a session
// bus; run it through `npm run test:e2e` (xvfb-run + dbus-run-session).
const { _electron } = require('playwright-core')
const { spawn, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-e2e-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const SOCK = path.join(TMP, 'island.sock')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
// E2E_SCALE=2 simulates a HiDPI display (X11 pointer coords are physical px).
const SCALE = Number(process.env.E2E_SCALE) || 1
fs.mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pointer = (x, y) =>
  execFileSync('node', [path.join(__dirname, 'xtest.cjs'), Math.round(x * SCALE), Math.round(y * SCALE)])
    .toString()
    .trim()
// Real X11 drag (press, move, release) between two screen points (DIP).
const dragPointer = (x1, y1, x2, y2) =>
  execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'drag', ...[x1, y1, x2, y2].map((v) => Math.round(v * SCALE))])
const USER_DATA = path.join(TMP, 'profile')

function hook(input, env = {}) {
  const p = spawn('node', [path.join(ROOT, 'hook/claude-island-hook.cjs')], {
    env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, ...env },
  })
  let out = ''
  p.stdout.on('data', (d) => (out += d))
  const done = new Promise((r) => p.on('close', () => r(out)))
  p.stdin.end(JSON.stringify(input))
  return done
}

;(async () => {
  const player = spawn('node', [path.join(__dirname, 'fake-player.cjs')])
  let playerLog = ''
  player.stdout.on('data', (d) => (playerLog += d))
  await sleep(800)

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, DI_USER_DATA: USER_DATA },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  app.process().stdout.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })

  try {
    // 1. compact media from the fake MPRIS player
    await page.waitForSelector('.capsule:not(.idle)', { timeout: 8000 })
    check('compact media view for a single player', true)
    await sleep(500)
    await shot('01-compact')

    // 1b. click-through: the X server routes input to the island only over it
    const xid = await app.evaluate(({ BrowserWindow }) => {
      const h = BrowserWindow.getAllWindows()[0].getNativeWindowHandle()
      return String(h.length >= 8 ? h.readBigUInt64LE(0) : h.readUInt32LE(0))
    })
    const childAt = (x, y) =>
      execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'child', Math.round(x * SCALE), Math.round(y * SCALE)])
        .toString()
        .trim()
    const ic = await page.evaluate(() => {
      const b = document.querySelector('.island-outer').getBoundingClientRect()
      return { x: window.screenX + b.x + b.width / 2, y: window.screenY + b.y + b.height / 2, col: window.screenX + 40 }
    })
    check('input goes to the island over it', childAt(ic.x, ic.y) === xid)
    check('elsewhere in its column, clicks pass through to the desktop', childAt(ic.col, ic.y + 200) !== xid)
    // The probe hovered the island; let it settle back to the capsule before measuring it again.
    await page.waitForSelector('.capsule:not(.idle)', { timeout: 3000 })
    await sleep(600)

    // 2. real X pointer over the island → hover → expand
    const r = await page.evaluate(() => {
      const b = document.querySelector('.island-outer').getBoundingClientRect()
      return { x: window.screenX + b.x + b.width / 2, y: window.screenY + b.y + b.height / 2 }
    })
    pointer(Math.round(r.x), Math.round(r.y))
    await page.waitForSelector('.card.media', { timeout: 3000 })
    check('real pointer hover expands the island', true)
    const title = await page.textContent('.card.media .headline')
    check('media title from MPRIS', title === 'Fake Track One', title)
    const times = await page.$$eval('.progress .time', (e) => e.map((x) => x.textContent))
    check('progress bar shows position/remaining', times[0].startsWith('0:3') && times[1].startsWith('-2:'), times.join(' '))
    await sleep(400)
    await shot('02-expanded-media')

    // 3. transport controls reach the player
    await page.click('button[title="Pause"]')
    await page.waitForSelector('button[title="Play"]', { timeout: 3000 })
    check('play/pause round-trips to player', playerLog.includes('STATUS Paused'))
    await page.click('button[title="Next"]')
    await page.waitForFunction(() => document.querySelector('.card.media .headline')?.textContent === 'Fake Track Two', null, { timeout: 3000 })
    check('next track updates via PropertiesChanged', true)

    // 3b. shuffle / repeat / seek through MPRIS
    await page.click('button[title="Shuffle off"]')
    await page.waitForSelector('button[title="Shuffle on"]', { timeout: 3000 })
    check('shuffle toggles on the player', playerLog.includes('SHUFFLE true'))
    await page.click('button[title="Repeat off"]')
    await page.waitForSelector('button[title="Repeat all"]', { timeout: 3000 })
    check('repeat cycles on the player', playerLog.includes('LOOP Playlist'))
    const bar = await page.$('.progress .bar.seekable')
    const bb = await bar.boundingBox()
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await sleep(500)
    const seek = /SEEK \/org\/fake\/track1 (\d+)/.exec(playerLog)
    check('clicking the progress bar seeks', !!seek && Math.abs(Number(seek[1]) / 1e6 - 90) < 5, seek?.[1])

    // 4. pointer leaves → collapse to compact (authoritative hover from main)
    pointer(5, 450)
    await page.waitForSelector('.capsule:not(.idle)', { timeout: 3000 })
    check('pointer leaving collapses island', true)

    // 5. approval via real hook, Always allow
    const input = {
      tool_name: 'Bash',
      cwd: '/tmp/project',
      tool_input: { command: 'npm test -- --watch=false' },
      permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test:*' }], behavior: 'allow', destination: 'localSettings' }],
    }
    let h = hook(input)
    await page.waitForSelector('.card.approval', { timeout: 5000 })
    await sleep(400)
    await shot('03-approval')
    await page.click('.pill.always')
    let out = JSON.parse(await h)
    check('always-allow emits updatedPermissions', out.hookSpecificOutput.decision.updatedPermissions?.[0]?.rules?.[0]?.ruleContent === 'npm test:*')
    await page.waitForSelector('.card.approval', { state: 'detached', timeout: 3000 })

    // 6. two queued approvals → badge; deny first, allow second in order
    const h1 = hook({ ...input, tool_input: { command: 'echo first' } })
    await sleep(150)
    const h2 = hook({ ...input, tool_input: { command: 'echo second' } })
    await page.waitForSelector('.card.approval .badge', { timeout: 5000 })
    const first = await page.textContent('.card.approval .code')
    check('approvals answered FIFO with +1 badge', first.includes('first'), first)
    await shot('04-approval-queue')
    await page.click('.pill.deny')
    await page.waitForFunction(() => document.querySelector('.card.approval .code')?.textContent.includes('second'), null, { timeout: 3000 })
    await page.click('.pill.allow')
    const [o1, o2] = await Promise.all([h1, h2])
    check('deny then allow reach the right hooks', JSON.parse(o1).hookSpecificOutput.decision.behavior === 'deny' && JSON.parse(o2).hookSpecificOutput.decision.behavior === 'allow')

    // 7. "Answer in terminal" → hook prints nothing
    h = hook(input)
    await page.waitForSelector('.card.approval', { timeout: 5000 })
    await page.click('text=Answer in terminal')
    check('answer-in-terminal is a no-op for Claude', (await h).trim() === '')

    // 8. hook gives up → stale card removed
    h = hook(input, { DYNAMIC_ISLAND_TIMEOUT: '1.5' })
    await page.waitForSelector('.card.approval', { timeout: 5000 })
    await h
    await page.waitForSelector('.card.approval', { state: 'detached', timeout: 3000 })
    check('timed-out hook removes its card', true)

    // 9. desktop notification via D-Bus Notify (monitor)
    try {
      execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.Notifications', '--object-path', '/org/freedesktop/Notifications', '--method', 'org.freedesktop.Notifications.Notify', 'Mail', '0', '', 'Alice', 'Lunch at 1? This is a longer body that should wrap onto a second line nicely.', '[]', '{}', '5000'], { stdio: 'ignore', timeout: 3000 })
    } catch {}
    const got = await page.waitForSelector('.card.notification', { timeout: 4000 }).then(() => true, () => false)
    check('desktop notification mirrored', got)
    if (got) {
      await sleep(400)
      await shot('05-notification')
      await page.click('.card.notification')
      await page.waitForSelector('.card.notification', { state: 'detached', timeout: 3000 })
      check('click dismisses notification', true)
      try {
        execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.Notifications', '--object-path', '/org/freedesktop/Notifications', '--method', 'org.freedesktop.Notifications.Notify', 'Chat', '0', '', 'Bob', 'second one', '[]', '{}', '5000'], { stdio: 'ignore', timeout: 3000 })
      } catch {}
      const second = await page.waitForSelector('.card.notification', { timeout: 4000 }).then(() => true, () => false)
      check('monitor survives: second notification also shown', second)
      if (second) await page.click('.card.notification')
    }

    // 9b. GNotification buttons trigger the app's action (like GNOME Shell does)
    const gtk = spawn('node', [path.join(__dirname, 'fake-gtk-app.cjs')])
    let gtkLog = ''
    gtk.stdout.on('data', (d) => (gtkLog += d))
    const until = async (fn, ms = 4000) => {
      const end = Date.now() + ms
      while (!fn() && Date.now() < end) await sleep(100)
      return fn()
    }
    await until(() => gtkLog.includes('READY'))
    gtk.stdin.write('go\n')
    const gotGtk = await page
      .waitForSelector('.card.notification .actions button', { timeout: 4000 })
      .then(() => true, () => false)
    check('GNotification shows its button', gotGtk)
    if (gotGtk) {
      await sleep(300)
      await shot('05b-notification-actions')
      await page.click('.card.notification .actions button')
      check(
        'button runs the app action with its target',
        await until(() => gtkLog.includes('ACTION open-log ["run-42"]')),
        gtkLog.trim().split('\n').pop(),
      )
    }
    gtk.kill()

    // 10. Control Center opens on click, closes after pointer leaves
    const r2 = await page.evaluate(() => {
      const b = document.querySelector('.island-outer').getBoundingClientRect()
      return { x: window.screenX + b.x + b.width / 2, y: window.screenY + b.y + b.height / 2 }
    })
    pointer(Math.round(r2.x), Math.round(r2.y))
    await sleep(200)
    await page.click('.island-outer .art, .island-outer .compact-art')
    await page.waitForSelector('.card.panel', { timeout: 3000 })
    await sleep(600)
    await shot('06-control-center')
    check('control center opens', true)
    pointer(5, 450)
    await page.waitForSelector('.card.panel', { state: 'detached', timeout: 4000 })
    check('control center auto-closes after pointer leaves', true)
  } catch (e) {
    check('unexpected error', false, e.message)
    await shot('99-failure').catch(() => {})
  }

  // 10b. drag the island to the other edge with a real X11 press/move/release
  try {
    const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    const center = () =>
      page.evaluate(() => {
        const b = document.querySelector('.island-outer').getBoundingClientRect()
        return { x: window.screenX + b.x + b.width / 2, y: window.screenY + b.y + b.height / 2 }
      })
    const before = await bounds()
    check('island starts docked on the right edge', before.x + before.width >= 1920 / SCALE - 1, JSON.stringify(before))
    await page.waitForSelector('.capsule', { timeout: 3000 })
    // Grab it once it has finished shrinking back (it animates after the panel closes).
    // One still sample can fall before the animation starts: wait for several.
    let c = await center()
    for (let i = 0, still = 0; i < 40 && still < 4; i++) {
      await sleep(150)
      const n = await center()
      still = Math.abs(n.x - c.x) < 1 && Math.abs(n.y - c.y) < 1 ? still + 1 : 0
      c = n
    }
    const targetY = 700 / SCALE
    dragPointer(c.x, c.y, 200 / SCALE, targetY)
    await sleep(600)
    const after = await bounds()
    check('dragging across the middle docks it on the left edge', after.x === 0, JSON.stringify(after))
    c = await center()
    check('it follows the pointer vertically', Math.abs(c.y - targetY) < 30, `${Math.round(c.y)} vs ${targetY}`)
    check('releasing a drag does not count as a click', !(await page.$('.card.panel')))
    const cfg = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check('dock position is saved', cfg.dock?.side === 'left' && Math.abs(cfg.dock.y - 700 / 1080) < 0.05, JSON.stringify(cfg.dock))
    await shot('07-docked-left')
    // and back: a small vertical drag keeps the side
    dragPointer(c.x, c.y, c.x, c.y - 150 / SCALE)
    await sleep(600)
    check('a vertical drag keeps the side', (await bounds()).x === 0)
    c = await center()
    dragPointer(c.x, c.y, 1800 / SCALE, 300 / SCALE)
    await sleep(600)
    const back = await bounds()
    check('dragging back docks it on the right again', back.x + back.width >= 1920 / SCALE - 1, JSON.stringify(back))

    // Top center, below the camera
    await sleep(400)
    c = await center()
    dragPointer(c.x, c.y, 960 / SCALE, 60 / SCALE)
    await sleep(800)
    const topWin = await bounds()
    check('dropping it near the top center docks it there', Math.abs(topWin.x + topWin.width / 2 - 960 / SCALE) <= 1 && topWin.width < 1920 / SCALE, JSON.stringify(topWin))
    pointer(40 / SCALE, 1000 / SCALE) // move off it, so it collapses back to the pill
    await page.waitForSelector('.island-outer .capsule', { timeout: 5000 })
    await sleep(700)
    const t = await page.evaluate(() => {
      const b = document.querySelector('.island-outer').getBoundingClientRect()
      const cap = document.querySelector('.island-outer .capsule').getBoundingClientRect()
      return { cx: window.screenX + b.x + b.width / 2, top: b.y, cls: document.querySelector('.island-outer').className, wide: cap.width > cap.height }
    })
    check('it sits centered at the top', Math.abs(t.cx - 960 / SCALE) <= 2 && t.top <= 12 && t.cls.includes('top'), JSON.stringify(t))
    check('as a horizontal pill', t.wide)
    const topCfg = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check('the top position is saved', topCfg.dock?.side === 'top', JSON.stringify(topCfg.dock))
    const tc = await center()
    const winId = await app.evaluate(({ BrowserWindow }) => {
      const h = BrowserWindow.getAllWindows()[0].getNativeWindowHandle()
      return String(h.length >= 8 ? h.readBigUInt64LE(0) : h.readUInt32LE(0))
    })
    const xt = (...a) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), ...a.map(String)]).toString().trim()
    check('input goes to the island at the top', xt('child', Math.round(tc.x * SCALE), Math.round(tc.y * SCALE)) === winId)
    xt('click', Math.round(tc.x * SCALE), Math.round(tc.y * SCALE))
    check('clicking it opens the panel, growing down from the top', await page.waitForSelector('.card.panel', { timeout: 3000 }).then(() => true, () => false))
    await shot('07b-top-panel')
    pointer(40 / SCALE, 1000 / SCALE) // bottom-left corner: well away from the panel
    await page.waitForSelector('.card.panel', { state: 'detached', timeout: 5000 })
    await sleep(600)
    c = await center()
    dragPointer(c.x, c.y, 1800 / SCALE, 400 / SCALE)
    await sleep(800)
    const off = await bounds()
    check('dragging it away from the top docks it on an edge again', off.x + off.width >= 1920 / SCALE - 1, JSON.stringify(off))
    pointer(900 / SCALE, 500 / SCALE)
  } catch (e) {
    check('drag test error', false, e.message)
  }

  // 11. single instance: `--replace` (npm start) takes over from the running
  // island, then `--quit` from another launch closes it.
  const env = { ...process.env, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: SOCK }
  const replaced = new Promise((r) => app.process().on('exit', () => r(true)))
  const next = spawn(ELECTRON, [ROOT, '--no-sandbox', '--replace'], { cwd: ROOT, stdio: 'ignore', env })
  const nextExit = new Promise((r) => next.on('exit', () => r(true)))
  check('a new launch with --replace closes the running island', await Promise.race([replaced, sleep(10000).then(() => false)]))
  let tookOver = false
  for (let end = Date.now() + 15000; !tookOver && Date.now() < end; await sleep(200)) tookOver = fs.existsSync(SOCK)
  await sleep(1500)
  check('and takes its place', tookOver && next.exitCode === null)
  spawn(ELECTRON, [ROOT, '--no-sandbox', '--quit'], { cwd: ROOT, stdio: 'ignore', env })
  const quit = await Promise.race([nextExit, sleep(8000).then(() => false)])
  check('second instance with --quit stops the island', quit)
  check('socket removed on quit', quit && !fs.existsSync(SOCK))
  if (!quit) next.kill()
  player.kill()
  const errs = logs.join('').split('\n').filter((l) => /error|Uncaught/i.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
