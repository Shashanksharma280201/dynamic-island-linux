// End-to-end test of the island on your phone: this script plays the Island
// Drop app. It listens to the island's live stream (/island/events) with the
// pairing token, sees a real Claude Code permission request and what's
// playing, answers from "the phone", and takes a file the computer sends.
const { _electron } = require('playwright-core')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-phone-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const HOME = path.join(TMP, 'home')
const SOCK = path.join(TMP, 'island.sock')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const TOKEN = 'e2e-' + 'p'.repeat(40)
const PORT = 23000 + Math.floor(Math.random() * 20000)
const BASE = `http://127.0.0.1:${PORT}`
for (const d of [OUT, USER_DATA, HOME]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms
  while (!(await fn()) && Date.now() < end) await sleep(100)
  return fn()
}
const auth = { Authorization: `Bearer ${TOKEN}`, 'X-Island-Device': 'Test Phone' }
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function hook(input) {
  const p = spawn('node', [path.join(ROOT, 'hook/claude-island-hook.cjs')], { env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK } })
  let out = ''
  p.stdout.on('data', (d) => (out += d))
  const done = new Promise((r) => p.on('close', () => r(out)))
  p.stdin.end(JSON.stringify(input))
  return done
}

/** The island's event stream, as the phone hears it: the latest view and every event. */
function listen() {
  const ctl = new AbortController()
  const s = { view: null, events: [], ctl, open: false }
  ;(async () => {
    const r = await fetch(`${BASE}/island/events`, { headers: auth, signal: ctl.signal })
    s.open = r.ok
    const reader = r.body.getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += Buffer.from(value).toString('utf8')
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const ev = /^event: (.+)$/m.exec(block)?.[1]
        const data = /^data: (.+)$/m.exec(block)?.[1]
        if (!ev || !data) continue
        const msg = JSON.parse(data)
        s.events.push({ ev, msg })
        if (ev === 'view') s.view = msg
      }
    }
  })().catch(() => {})
  return s
}

;(async () => {
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'top' }, drop: { on: true } }))
  const player = spawn('node', [path.join(__dirname, 'fake-player.cjs')])
  let playerLog = ''
  player.stdout.on('data', (d) => (playerLog += d))

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, HOME, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: SOCK, DI_BACKDROP: 'off', DI_DROP_TOKEN: TOKEN, DI_DROP_PORT: String(PORT), DI_DROP_FOLDER: path.join(TMP, 'Downloads'), DI_TEST_HOOKS: '1' },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  app.process().stdout.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  let phone = null

  try {
    await page.waitForSelector('.capsule', { timeout: 20000 })
    await until(() => logs.join('').includes('phone drop listening'), 10000)

    // ---- The phone connects ----
    phone = listen()
    check('the phone hears the island live', await until(() => !!phone.view, 5000), JSON.stringify(phone.view)?.slice(0, 120))
    check('with this computer’s name and nothing waiting', phone.view?.protocol === 1 && typeof phone.view.name === 'string' && phone.view.approvals.length === 0)
    const denied = await fetch(`${BASE}/island/view`, { headers: { Authorization: 'Bearer ' + 'x'.repeat(44) } })
    check('a phone that isn’t paired hears nothing', denied.status === 401)

    // ---- What's playing, and the phone's buttons ----
    check('it sees what’s playing', await until(() => phone.view?.media?.title === 'Fake Track One', 8000), JSON.stringify(phone.view?.media))
    await post('/island/media', { cmd: 'playpause' })
    check('and its play button works the player on the computer', await until(() => playerLog.includes('STATUS Paused'), 4000), playerLog.trim().split('\n').slice(-2).join(' | '))

    // ---- A Claude Code permission, answered from the phone ----
    const h = hook({ tool_name: 'Bash', cwd: '/tmp/shop', tool_input: { command: 'npm run deploy' } })
    check('a permission Claude asks for reaches the phone', await until(() => phone.view?.approvals.length === 1, 5000), JSON.stringify(phone.view?.approvals))
    const a = phone.view?.approvals[0]
    check('saying what it wants to run, and where', a?.kind === 'claude' && a.body.includes('npm run deploy') && a.where === 'shop' && a.allow === 'Allow', JSON.stringify(a))
    check('the island shows it too', await page.waitForSelector('.card.approval', { timeout: 3000 }).then(() => true, () => false))
    const stale = await post('/island/decide', { id: 'nope', decision: 'allow' })
    check('an answer to something that isn’t waiting is refused', stale.status === 404)
    const r = await post('/island/decide', { id: a.id, decision: 'allow' })
    check('the phone’s Allow is accepted', r.ok)
    const said = JSON.parse((await h) || '{}')
    check('and Claude Code gets it', said.hookSpecificOutput?.decision?.behavior === 'allow', JSON.stringify(said))
    check('the card goes from the island', await page.waitForSelector('.card.approval', { state: 'detached', timeout: 3000 }).then(() => true, () => false))
    check('and from the phone', await until(() => phone.view?.approvals.length === 0, 3000))

    // ---- Answered on the island: the phone's card goes ----
    const h2 = hook({ tool_name: 'Write', cwd: '/tmp/shop', tool_input: { file_path: '/tmp/shop/a.txt', content: 'x' } })
    await until(() => phone.view?.approvals.length === 1, 5000)
    await page.click('.card.approval .pill.deny')
    const said2 = JSON.parse((await h2) || '{}')
    check('answering on the island tells the phone', said2.hookSpecificOutput?.decision?.behavior === 'deny' && (await until(() => phone.view?.approvals.length === 0, 3000)), JSON.stringify(said2))

    // ---- A file from the computer to the phone ----
    const file = path.join(TMP, 'Slides.pdf')
    fs.writeFileSync(file, Buffer.alloc(150_000, 7))
    await app.evaluate(({ BrowserWindow }, f) => {
      // The tray's "Send a file to your phone…", without its file picker.
      return globalThis.__islandSendToPhone?.([f])
    }, file)
    const inc = await until(() => phone.events.find((e) => e.ev === 'incoming')?.msg, 5000)
    check('the phone hears a file is coming', !!inc && inc.name === 'Slides.pdf' && inc.size === 150_000, JSON.stringify(inc))
    if (inc) {
      const got = Buffer.from(await (await fetch(`${BASE}/drop/out/${inc.id}`, { headers: auth })).arrayBuffer())
      check('and takes it whole', got.length === 150_000 && got.equals(fs.readFileSync(file)))
      await post(`/drop/out/${inc.id}/done`, { ok: true })
      check('the island says it reached the phone', await until(async () => (await page.textContent('.card.job').catch(() => '')).includes('Sent to Test Phone'), 5000), await page.textContent('.card.job').catch(() => ''))
      const again = await fetch(`${BASE}/drop/out/${inc.id}`, { headers: auth })
      check('a file is only offered until it’s taken', again.status === 404)
    }
  } catch (e) {
    check('unexpected error', false, e.message)
    await page.screenshot({ path: path.join(OUT, 'phone-failure.png') }).catch(() => {})
  }

  phone?.ctl.abort()
  player.kill()
  await app.close().catch(() => {})
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError/.test(l))
  console.log('app log:', errs.length ? errs.slice(0, 6).join(' | ') : 'clean')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
