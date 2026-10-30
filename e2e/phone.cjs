// End-to-end test of the island on your phone: this script plays the Island
// Drop app. It listens to the island's live stream (/island/events) with the
// pairing token, sees a real Claude Code permission request and what's
// playing, answers from "the phone", and takes files the computer sends: one
// from the tray, one dragged to the screen's edge where the phone is (a
// scripted drag source, DI_FAKE_DRAG, plays the drag as a system reports one).
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
const SCRIPT = path.join(TMP, 'drag.jsonl')
const WA_LOG = path.join(TMP, 'whatsapp.log')
const say = (o) => fs.appendFileSync(SCRIPT, JSON.stringify(o) + '\n')
/** The pointer gliding to (x, y), as samples. */
const glide = async (from, to, steps = 8) => {
  for (let i = 1; i <= steps; i++) {
    say({ at: [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps] })
    await sleep(40)
  }
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
  // A trading engine connected (the stand-in from e2e/connected.cjs), with its token stored as Settings would without a keyring.
  const engine = spawn('node', [path.join(__dirname, 'fake-engine.cjs')], { stdio: ['ignore', 'pipe', 'inherit'] })
  const enginePort = await new Promise((r) => engine.stdout.on('data', (d) => /port (\d+)/.test(d) && r(Number(/port (\d+)/.exec(d)[1]))))
  const control = (what, body) => fetch(`http://127.0.0.1:${enginePort}/__control/${what}`, { method: 'POST', body: JSON.stringify(body ?? {}) }).then((r) => r.json())
  const connected = { on: true, url: `http://127.0.0.1:${enginePort}`, secret: 'plain:' + Buffer.from('good-token').toString('base64') }
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'top' }, drop: { on: true }, connected, whatsapp: true }))
  fs.writeFileSync(SCRIPT, '')
  const player = spawn('node', [path.join(__dirname, 'fake-player.cjs')])
  let playerLog = ''
  player.stdout.on('data', (d) => (playerLog += d))

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, HOME, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: SOCK, DI_BACKDROP: 'off', DI_DROP_TOKEN: TOKEN, DI_DROP_PORT: String(PORT), DI_DROP_FOLDER: path.join(TMP, 'Downloads'), DI_TEST_HOOKS: '1', DI_FAKE_DRAG: SCRIPT, DI_CLAUDE_BIN: path.join(__dirname, 'fake-claude.cjs'), DI_WHATSAPP_ENGINE: 'fake', DI_FAKE_WA_READY_MS: '500', DI_DEMO_LOG: WA_LOG },
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

    // ---- A trade from the engine, answered on the phone ----
    const ASK = { id: 'a1b2c3d4', title: 'Buy 19 INFY', subtitle: 'INFY · 09:31', lines: [{ label: 'Stop', value: '₹995.17' }, { label: 'Risk', value: '₹139.46', tone: 'down' }], note: 'ORB long', approve_label: 'Buy', reject_label: 'Skip', seconds_left: 60, expires_at: 0, tone: 'up' }
    await control('view', { asks: [ASK] })
    check('a trade the engine proposes reaches the phone', await until(() => phone.view?.approvals.some((x) => x.kind === 'trade'), 8000), JSON.stringify(phone.view?.approvals))
    const t = phone.view?.approvals.find((x) => x.kind === 'trade')
    check('with its own buttons, numbers and countdown', t?.title === 'Buy 19 INFY' && t.allow === 'Buy' && t.deny === 'Skip' && t.lines?.some((l) => l.value === '₹995.17') && t.secondsLeft > 0, JSON.stringify(t))
    check('the island shows it too', await page.waitForSelector('.card.connected-ask', { timeout: 3000 }).then(() => true, () => false))
    const bought = await post('/island/decide', { id: t?.id, decision: 'allow' })
    check('the phone’s Buy is accepted', bought.ok, String(bought.status))
    const posts = await until(async () => {
      const p = await control('posts')
      return p.some((x) => x.path === '/island/answer') ? p : null
    }, 4000)
    check('and the engine gets the approval', !!posts?.some((x) => x.path === '/island/answer' && x.body.ask_id === ASK.id && x.body.answer === 'approve'), JSON.stringify(posts))
    await control('view', { asks: [] })
    check('the trade goes from the island and the phone', (await page.waitForSelector('.card.connected-ask', { state: 'detached', timeout: 4000 }).then(() => true, () => false)) && (await until(() => !phone.view?.approvals.some((x) => x.kind === 'trade'), 4000)))

    // ---- The island's own functions, from the phone ----
    const call = (fn, ...args) =>
      fetch(`${BASE}/island/call`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ fn, args }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }))
    const pushes = (topic) => phone.events.filter((e) => e.ev === 'push' && e.msg.topic === topic).map((e) => e.msg.data)

    const saved = await call('notes.save', null, 'Groceries\nMilk, eggs')
    check('the phone writes a note on the computer', saved.ok && typeof saved.value === 'string', JSON.stringify(saved))
    const notes = await call('notes.list')
    check('and finds it among the notes', notes.ok && notes.value.some((n) => n.title === 'Groceries'), JSON.stringify(notes.value?.slice?.(0, 2)))

    const asked = await call('claude.ask', 'say hello from the phone')
    check('the phone asks Claude Code', asked.ok, JSON.stringify(asked))
    const answered = () => pushes('claude').some((v) => v?.turns?.some((t) => t.prompt === 'say hello from the phone' && t.reply))
    check('and hears the reply as it comes', await until(answered, 15000), JSON.stringify(pushes('claude').slice(-1)[0]?.run ?? null).slice(0, 200))

    const tv = await call('connected.view')
    check('it reads the trading engine’s view, positions and all', tv.ok && tv.value.phase === 'live' && Array.isArray(tv.value.view?.sections), JSON.stringify(tv).slice(0, 200))
    const act = await call('connected.action', 'stop_today')
    const actPosts = await control('posts')
    check('and runs its actions', act.ok && act.value?.ok === true && actPosts.some((x) => x.path === '/island/action' && x.body.action_id === 'stop_today'), JSON.stringify(act) + ' ' + JSON.stringify(actPosts.slice(-1)))

    await call('notifications.setDnd', true)
    check('Do Not Disturb from the phone', await until(() => phone.view?.dnd === true, 3000))
    await call('notifications.setDnd', false)
    check('and off again', await until(() => phone.view?.dnd === false, 3000))

    const chats = await until(async () => {
      const c = await call('inbox.chats')
      return c.ok && c.value?.length ? c : null
    }, 12000)
    check('the phone lists WhatsApp chats', !!chats && chats.value.some((c) => c.name === 'Alice'), JSON.stringify(chats?.value?.map?.((c) => c.name)))
    const alice = chats?.value.find((c) => c.name === 'Alice')
    const thread = alice && (await call('inbox.chat', alice.id))
    check('opens one', !!thread?.ok && Array.isArray(thread.value) && thread.value.length > 0)
    const sentChat = alice && (await call('inbox.sendChat', alice.id, 'On my way'))
    check('and sends a message', !!sentChat?.ok && (await until(() => fs.existsSync(WA_LOG) && fs.readFileSync(WA_LOG, 'utf8').includes('On my way'), 4000)), JSON.stringify(sentChat))

    const notIsland = await call('settings.setAiKey', 'anthropic', 'sk-x')
    check('only the island’s own calls', notIsland.status === 400 && notIsland.ok === false)
    const wrongArgs = await call('notes.get', 5)
    check('with the right arguments', wrongArgs.status === 400)
    const unpaired = await fetch(`${BASE}/island/call`, { method: 'POST', headers: { Authorization: 'Bearer ' + 'x'.repeat(44) }, body: '{}' })
    check('and only from a paired phone', unpaired.status === 401)

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

    // ---- Dragging a file to the screen's edge where the phone is ----
    const photo = path.join(TMP, 'Holiday.png')
    fs.writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
    const screenB = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds)
    const overlay = () => app.windows().find((w) => w.url().includes('drop.html'))
    const lit = async () =>
      overlay()
        ?.evaluate(() => ({ phase: document.body.dataset.phase ?? '', label: document.querySelector('.aim span')?.textContent ?? '', ready: !!document.querySelector('.aim.ready') }))
        .catch(() => null)
    const strip = () =>
      app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Send to phone')
        return w ? { visible: w.isVisible(), bounds: w.getBounds() } : null
      })
    const before = phone.events.filter((e) => e.ev === 'incoming').length
    const right = screenB.x + screenB.width
    const y = screenB.y + Math.round(screenB.height * 0.6)
    say({ start: [photo] })
    await glide([right - 700, y], [right - 420, y], 4)
    check('dragging in the middle of the screen lights nothing', !['aim', 'aim-ready'].includes((await lit())?.phase ?? ''), JSON.stringify(await lit()))
    await glide([right - 420, y], [right - 100, y], 6)
    check('nearing the phone’s edge lights it, saying where it goes', await until(async () => (await lit())?.label === 'Send to Test Phone', 3000), JSON.stringify(await lit()))
    await glide([right - 100, y], [right - 12, y], 4)
    check('at the edge, letting go will send it', await until(async () => (await lit())?.ready === true && (await lit())?.label === 'Let go to send to Test Phone', 3000), JSON.stringify(await lit()))
    const st = await strip()
    check('a strip at the edge takes the drop', !!st?.visible && st.bounds.x + st.bounds.width === right && st.bounds.y <= y && st.bounds.y + st.bounds.height >= y, JSON.stringify(st))
    await sleep(300)
    await page.screenshot({ path: path.join(OUT, 'phone-edge.png') }).catch(() => {})
    say({ end: true })
    const inc2 = await until(() => phone.events.filter((e) => e.ev === 'incoming')[before]?.msg, 5000)
    check('letting go sends it to the phone, from that edge', !!inc2 && inc2.name === 'Holiday.png' && inc2.side === 'right' && !!inc2.thumb, JSON.stringify(inc2 && { ...inc2, thumb: !!inc2.thumb }))
    check('the island shows it going', await until(async () => (await page.textContent('.card.job').catch(() => '')).includes('To Test Phone'), 3000), await page.textContent('.card.job').catch(() => ''))
    check('and the strip goes', await until(async () => (await strip())?.visible === false, 2000))
    if (inc2) {
      await fetch(`${BASE}/drop/out/${inc2.id}`, { headers: auth }).then((r) => r.arrayBuffer())
      await post(`/drop/out/${inc2.id}/done`, { ok: true })
    }

    // Letting go short of the edge sends nothing.
    say({ start: [photo] })
    await glide([right - 400, y], [right - 120, y], 6)
    await until(async () => (await lit())?.label === 'Send to Test Phone', 2000)
    say({ end: true })
    await sleep(900)
    check('letting go short of the edge sends nothing', phone.events.filter((e) => e.ev === 'incoming').length === before + 1 && !['aim', 'aim-ready'].includes((await lit())?.phase ?? ''), JSON.stringify(await lit()))
  } catch (e) {
    check('unexpected error', false, e.message)
    await page.screenshot({ path: path.join(OUT, 'phone-failure.png') }).catch(() => {})
  }

  phone?.ctl.abort()
  player.kill()
  engine.kill()
  await app.close().catch(() => {})
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError/.test(l))
  console.log('app log:', errs.length ? errs.slice(0, 6).join(' | ') : 'clean')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
