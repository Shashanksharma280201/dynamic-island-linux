// End-to-end test of Phone Drop: this script plays the phone. It talks to the
// island's drop server the way the Island Drop app does (the token from the
// pairing QR, an approach while the file heads for the edge, then its bytes)
// and checks the glow over the screen, the saved file and the island's card.
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const zlib = require('zlib')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-drop-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const FOLDER = path.join(TMP, 'Phone files')
const HOME = path.join(TMP, 'home')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const TOKEN = 'e2e-' + 'k'.repeat(40)
const PORT = 21000 + Math.floor(Math.random() * 20000)
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

/** A small PNG: a sky-to-sunset gradient, so a photo looks like one. */
function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3
      const t = y / h
      raw[i] = Math.round(40 + 200 * t + 15 * Math.sin(x / 9))
      raw[i + 1] = Math.round(110 + 60 * (1 - t))
      raw[i + 2] = Math.round(220 - 150 * t)
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) : crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

const auth = (token = TOKEN) => ({ Authorization: `Bearer ${token}` })
const post = (p, body, token) => fetch(BASE + p, { method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const put = (id, name, body, extra = {}) => fetch(`${BASE}/drop/file?id=${id}&index=0&name=${encodeURIComponent(name)}&size=${body.length}`, { method: 'PUT', headers: auth(), body, ...extra })

;(async () => {
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'top' }, drop: { on: true } }))
  const photo = png(360, 240)
  const thumb = 'data:image/png;base64,' + png(180, 120).toString('base64')

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, HOME, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_BACKDROP: 'off', DI_DROP_TOKEN: TOKEN, DI_DROP_PORT: String(PORT), DI_DROP_FOLDER: FOLDER },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  app.process().stdout.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const overlayWin = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Phone Drop')
      return w ? { visible: w.isVisible(), bounds: w.getBounds() } : null
    })
  const overlay = () => app.windows().find((w) => w.url().includes('drop.html'))
  const glow = async () =>
    overlay()
      ?.evaluate(() => ({ phase: document.body.dataset.phase ?? '', level: Number(document.body.dataset.level ?? 0), thumbs: document.querySelectorAll('.thumb').length, label: document.querySelector('.thumb .label')?.textContent ?? '' }))
      .catch(() => null)
  const card = async () =>
    page
      .evaluate(() => {
        const c = document.querySelector('.card.job')
        return c ? { state: c.getAttribute('data-job'), text: c.textContent } : null
      })
      .catch(() => null)
  const shot = (name) => overlay()?.screenshot({ path: path.join(OUT, `drop-${name}.png`) }).catch(() => {})

  try {
    await page.waitForSelector('.capsule', { timeout: 20000 })
    check('it listens for your phone', await until(() => logs.join('').includes('phone drop listening'), 10000))

    // ---- Who's there ----
    const hello = await (await fetch(`${BASE}/drop/hello`, { headers: auth() })).json()
    check('the phone finds the computer by name', hello.ok && hello.protocol === 1 && typeof hello.name === 'string' && hello.name.length > 0, JSON.stringify(hello))
    const denied = await fetch(`${BASE}/drop/hello`, { headers: auth('w' + TOKEN.slice(1)) })
    check('a phone that isn’t paired is turned away', denied.status === 401)

    // ---- A file heads for the edge, then goes back ----
    await post('/drop/approach', { id: 'drop-cancel', side: 'right', at: 0.5, files: [{ name: 'Sunset.png', size: photo.length }], device: 'Test Phone', thumb })
    check('the glow comes up at the edge', await until(async () => (await glow())?.level > 0.35, 4000), JSON.stringify(await glow()))
    const w = await overlayWin()
    const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds)
    check('over the whole screen', !!w && w.visible && w.bounds.x <= area.x && w.bounds.y <= area.y && w.bounds.x + w.bounds.width >= area.x + area.width && w.bounds.y + w.bounds.height >= area.y + area.height, JSON.stringify({ w, area }))
    await shot('approach')
    await post('/drop/cancel', { id: 'drop-cancel' })
    check('it fades when the file goes back', await until(async () => (await overlayWin())?.visible === false, 5000), JSON.stringify(await glow()))

    // ---- A photo, flicked across ----
    await post('/drop/approach', { id: 'drop-photo', side: 'right', at: 0.45, files: [{ name: 'Sunset.png', size: photo.length }], device: 'Test Phone', thumb })
    await sleep(700)
    const sent = put('drop-photo', 'Sunset.png', photo)
    let sawThumb = null
    await until(async () => {
      const g = await glow()
      if (g?.thumbs) sawThumb = g
      return !!sawThumb
    }, 3000)
    check('the photo comes out of the light', !!sawThumb && sawThumb.label === 'Sunset.png', JSON.stringify(sawThumb))
    await sleep(300)
    await shot('arrive')
    const res = await (await sent).json()
    check('it is saved whole', res.ok && fs.existsSync(path.join(FOLDER, 'Sunset.png')) && fs.readFileSync(path.join(FOLDER, 'Sunset.png')).equals(photo), JSON.stringify(res))
    check('then flies into the island', await until(async () => ['land', 'idle'].includes((await glow())?.phase), 3000), JSON.stringify(await glow()))
    await sleep(350)
    await shot('land')
    check('the island shows it', await until(async () => (await card())?.state === 'done', 5000), JSON.stringify(await card()))
    const c = await card()
    check('from your phone, where it went', !!c && c.text.includes('From Test Phone') && c.text.includes('Sunset.png') && c.text.includes(`Saved to ${path.basename(FOLDER)}`), c?.text)
    await page.screenshot({ path: path.join(OUT, 'drop-card.png') }).catch(() => {})
    check('and the glow goes away', await until(async () => (await overlayWin())?.visible === false, 6000))

    // ---- The same name again, sent without the gesture ----
    const again = await (await put('drop-again', 'Sunset.png', photo)).json()
    check('never over another file', again.ok && again.name === 'Sunset (2).png' && fs.existsSync(path.join(FOLDER, 'Sunset.png')), JSON.stringify(again))
    await until(async () => (await overlayWin())?.visible === false, 6000)

    // ---- A big one, slowly: it carries on in the island ----
    const big = Buffer.alloc(600_000, 7)
    await post('/drop/approach', { id: 'drop-slow', side: 'left', at: 0.5, files: [{ name: 'Holiday.mp4', size: big.length }], device: 'Test Phone' })
    const slow = new ReadableStream({
      async start(ctrl) {
        for (let i = 0; i < 12; i++) {
          ctrl.enqueue(big.subarray(i * 50_000, (i + 1) * 50_000))
          await sleep(450)
        }
        ctrl.close()
      },
    })
    const slowSent = fetch(`${BASE}/drop/file?id=drop-slow&index=0&name=Holiday.mp4&size=${big.length}`, { method: 'PUT', headers: auth(), body: slow, duplex: 'half' })
    check('a slow one moves into the island and shows how far it’s got', await until(async () => (await card())?.state === 'working', 7000), JSON.stringify(await card()))
    const slowRes = await (await slowSent).json()
    check('and finishes there', slowRes.ok && (await until(async () => (await card())?.state === 'done' && (await card()).text.includes('Holiday.mp4'), 5000)), JSON.stringify(await card()))
    await until(async () => (await overlayWin())?.visible === false, 6000)

    // ---- One that breaks off ----
    await post('/drop/approach', { id: 'drop-broken', side: 'right', at: 0.5, files: [{ name: 'Notes.pdf', size: 400_000 }], device: 'Test Phone' })
    const ctl = new AbortController()
    const broken = new ReadableStream({
      async start(c) {
        c.enqueue(Buffer.alloc(100_000, 1))
        await sleep(600)
        ctl.abort()
      },
    })
    await fetch(`${BASE}/drop/file?id=drop-broken&index=0&name=Notes.pdf&size=400000`, { method: 'PUT', headers: auth(), body: broken, duplex: 'half', signal: ctl.signal }).catch(() => {})
    check('a file that breaks off says so', await until(async () => (await card())?.state === 'error', 5000), JSON.stringify(await card()))
    check('and leaves nothing behind', !fs.readdirSync(FOLDER).some((n) => n.includes('Notes') || n.endsWith('.part')), fs.readdirSync(FOLDER).join(', '))

    // ---- Settings: on, where files go, the QR to pair ----
    await page.evaluate(() => window.island.openSettings('drop'))
    let settings = null
    await until(() => (settings = app.windows().find((p) => p.url().includes('settings.html'))), 8000)
    await settings.waitForSelector('#drop .service-status.ok', { timeout: 8000 })
    check('Settings says it’s ready', (await settings.textContent('#drop .service-status.ok')).includes(`port ${PORT}`))
    await settings.click('#drop button:has-text("Show QR")')
    check('and shows the QR to pair a phone', await settings.waitForSelector('#drop img.connected-qr', { timeout: 5000 }).then(() => true, () => false))
    await settings.locator('#drop').screenshot({ path: path.join(OUT, 'drop-settings.png') }).catch(() => {})
  } catch (e) {
    check('unexpected error', false, e.message)
    await page.screenshot({ path: path.join(OUT, 'drop-failure.png') }).catch(() => {})
  }

  await app.close().catch(() => {})
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError/.test(l))
  console.log('app log:', errs.length ? errs.slice(0, 6).join(' | ') : 'clean')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
