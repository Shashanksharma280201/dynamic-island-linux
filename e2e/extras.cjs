// End-to-end test of the notch's extras: the volume and the brightness show
// on the notch as they change (not while the island is open, and not when
// that's turned off); a Bluetooth device that connects says so; the
// Dashboard shows the weather, your apps along the bottom and a menu of
// thirteen tiles (Weather, Devices, Screen time, To-do, Shelf and Translate
// among them); files dragged to the island are offered the shelf, Documents
// or the phone; the shelf holds them, zips them and lets them go; selected
// text is translated on a card (copy it, change the language, put it where
// the selection was); an eye break counts down; every coding agent's
// session is in one list, the ones that need you first; the weather takes
// its turn beside what's playing; and the evening can have its own tiles.
// Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync, spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-extras-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const THEME = process.env.E2E_THEME || 'dark'
const SOCK = path.join(TMP, 'island.sock')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
// Its own home: the apps and icons it makes up mustn't land in another suite's.
const HOME = path.join(TMP, 'home')
const BIN = path.join(TMP, 'bin')
const STATE = path.join(TMP, 'state')
const FILES = path.join(TMP, 'files')
const SHELF_OUT = path.join(TMP, 'downloads')
const APPS = path.join(HOME, '.local/share/applications')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
for (const d of [OUT, USER_DATA, CLAUDE_DIR, HOME, BIN, STATE, FILES, SHELF_OUT, APPS]) fs.mkdirSync(d, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${ok ? '' : extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(120)) {
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

// ---- Stand-ins for the system's tools (found first on PATH) --------------------
const sh = (name, body) => fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\nD="${STATE}"\n${body}\n`, { mode: 0o755 })
sh(
  'pactl',
  `case "$1" in
  subscribe) touch "$D/pactl-events"; exec tail -n0 -F "$D/pactl-events" ;;
  get-sink-volume) echo "Volume: front-left: 40000 /  $(cat "$D/volume")% / -12.00 dB" ;;
  get-sink-mute) echo "Mute: $(cat "$D/mute")" ;;
  *) exit 0 ;;
esac`,
)
sh(
  'gdbus',
  `case "$1" in
  monitor) if [ "$2" = "--system" ]; then f=bluez-events; else f=power-events; fi; touch "$D/$f"; exec tail -n0 -F "$D/$f" ;;
  *) exit 1 ;;
esac`,
)
sh(
  'bluetoothctl',
  `case "$1" in
  show) printf 'Controller 00:1A:7D:DA:71:13 (public)\\n\\tPowered: yes\\n' ;;
  devices) cat "$D/bt-devices" ;;
  info) cat "$D/bt-$2" 2>/dev/null || exit 1 ;;
  *) exit 0 ;;
esac`,
)
fs.writeFileSync(path.join(STATE, 'volume'), '50')
fs.writeFileSync(path.join(STATE, 'mute'), 'no')
const DEVICES = [
  { id: 'AA:BB:CC:DD:EE:01', name: 'WH-1000XM5', icon: 'audio-headset', connected: true, battery: 82 },
  { id: 'AA:BB:CC:DD:EE:02', name: 'MX Master 3S', icon: 'input-mouse', connected: true, battery: 64 },
  { id: 'AA:BB:CC:DD:EE:03', name: 'Keychron K2', icon: 'input-keyboard', connected: false, battery: 18 },
]
fs.writeFileSync(path.join(STATE, 'bt-devices'), DEVICES.map((d) => `Device ${d.id} ${d.name}`).join('\n') + '\n')
for (const d of DEVICES)
  fs.writeFileSync(
    path.join(STATE, `bt-${d.id}`),
    `Device ${d.id} (public)\n\tName: ${d.name}\n\tAlias: ${d.name}\n\tIcon: ${d.icon}\n\tPaired: yes\n\tConnected: ${d.connected ? 'yes' : 'no'}\n\tBattery Percentage: 0x${d.battery.toString(16)} (${d.battery})\n`,
  )
const sinkChanged = () => fs.appendFileSync(path.join(STATE, 'pactl-events'), "Event 'change' on sink #53\n")
const brightnessTo = (v) =>
  fs.appendFileSync(path.join(STATE, 'power-events'), `/org/gnome/SettingsDaemon/Power: org.freedesktop.DBus.Properties.PropertiesChanged ('org.gnome.SettingsDaemon.Power.Screen', {'Brightness': <int32 ${v}>}, @as [])\n`)
const deviceConnects = (id) =>
  fs.appendFileSync(path.join(STATE, 'bluez-events'), `/org/bluez/hci0/dev_${id.replace(/:/g, '_')}: org.freedesktop.DBus.Properties.PropertiesChanged ('org.bluez.Device1', {'Connected': <true>}, @as [])\n`)

// ---- A few apps, with their icons ------------------------------------------------
const icon = (name, bg1, bg2, glyph) => {
  const f = path.join(HOME, `${name}.svg`)
  fs.writeFileSync(
    f,
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect x="6" y="6" width="116" height="116" rx="28" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(28 28) scale(3)">${glyph}</g></svg>`,
  )
  return f
}
const LAUNCHED = path.join(STATE, 'launched')
fs.writeFileSync(path.join(BIN, 'fake-launch'), `#!/bin/sh\necho "$1" >> "${LAUNCHED}"\n`, { mode: 0o755 })
// One of them is "running": a process by its program's name. (A script of its own, not a renamed
// `sleep`: where the system's tools are one program under many names, that one wouldn't stay up.)
fs.writeFileSync(path.join(BIN, 'fakefiles'), '#!/bin/sh\ntrap "kill \\$! 2>/dev/null; exit 0" TERM INT\nsleep 600 &\nwait\n', { mode: 0o755 })
const APP_LIST = [
  ['zz-files', 'Files', 'fakefiles', icon('files', '#64d2ff', '#0a84ff', '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.200h7a2 2 0 0 1 2 2v7.800a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>')],
  ['zz-terminal', 'Terminal', 'fake-launch terminal', icon('terminal', '#3a3a3c', '#1c1c1e', '<path d="m6 8.500 4 3.500-4 3.500M12.500 16h5.500"/>')],
  ['zz-browser', 'Web', 'fake-launch web', icon('web', '#ffffff', '#e5e5ea', '<g stroke="#0a84ff"><circle cx="12" cy="12" r="8.500"/><path d="m15.500 8.500-2 5-5 2 2-5z"/></g>')],
  ['zz-code', 'Code', 'fake-launch code', icon('code', '#0a84ff', '#0040dd', '<path d="m8.500 7.500-5 4.500 5 4.500M15.500 7.500l5 4.500-5 4.500"/>')],
  ['zz-notes', 'Notes', 'fake-launch notes', icon('notes', '#ffd60a', '#ff9f0a', '<path d="M6 8h12M6 12h12M6 16h7"/>')],
  ['zz-music', 'Music', 'fake-launch music', icon('music', '#ff6482', '#ff2d55', '<path d="M9 17.500V5.500l11-2v12"/><circle cx="6.500" cy="17.500" r="2.500"/><circle cx="17.500" cy="15.500" r="2.500"/>')],
  ['zz-settings', 'Settings', 'fake-launch settings', icon('settings', '#8e8e93', '#636366', '<circle cx="12" cy="12" r="3.200"/><circle cx="12" cy="12" r="8" stroke-dasharray="3 3.300"/>')],
  ['zz-mail', 'Post', 'fake-launch post', icon('post', '#5ac8fa', '#007aff', '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3.800 7 8.200 6 8.200-6"/>')],
]
for (const [id, name, exec, ic] of APP_LIST) fs.writeFileSync(path.join(APPS, `${id}.desktop`), `[Desktop Entry]\nType=Application\nName=${name}\nExec=${exec}\nIcon=${ic}\n`)
const PINS = APP_LIST.slice(0, 7).map(([id]) => `${id}.desktop`)

// ---- The weather service -----------------------------------------------------------
const weatherLog = []
const weatherServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  weatherLog.push(req.url)
  res.setHeader('content-type', 'application/json')
  if (url.pathname === '/v1/search') {
    const name = url.searchParams.get('name')
    return res.end(JSON.stringify(/lisbon/i.test(name) ? { results: [{ name: 'Lisbon', latitude: 38.7167, longitude: -9.1333, country: 'Portugal' }] } : {}))
  }
  if (url.pathname === '/v1/forecast') {
    const h0 = new Date()
    h0.setMinutes(0, 0, 0)
    const hours = Array.from({ length: 12 }, (_, i) => Math.floor(h0.getTime() / 1000) + i * 3600)
    const light = hours.map((t) => (new Date(t * 1000).getHours() >= 7 && new Date(t * 1000).getHours() < 19 ? 1 : 0))
    return res.end(
      JSON.stringify({
        current: { temperature_2m: 24.3, weather_code: 2, is_day: 1 },
        hourly: { time: hours, temperature_2m: [24.3, 23.2, 21.4, 20.1, 19, 18.6, 18, 17.5, 17, 17, 16.8, 16.5], weather_code: [2, 2, 3, 0, 0, 61, 61, 3, 3, 3, 3, 3], is_day: light },
        daily: { temperature_2m_max: [27.2, 25], temperature_2m_min: [18.1, 16] },
      }),
    )
  }
  res.statusCode = 404
  res.end('{}')
})

// ---- Files for the shelf ----------------------------------------------------------
/** A small picture (a sunset of sorts), as a real PNG. */
function png(w, h) {
  const zlib = require('zlib')
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3
      const t = y / h
      const sun = Math.hypot(x - w * 0.68, y - h * 0.42) < h * 0.2
      raw[i] = sun ? 255 : Math.round(255 - 60 * t)
      raw[i + 1] = sun ? 236 : Math.round(120 + 40 * t - 60 * (x / w))
      raw[i + 2] = sun ? 170 : Math.round(90 + 150 * t)
    }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const PNG = png(160, 120)
const F = {
  pdf: path.join(FILES, 'Q3 report.pdf'),
  png: path.join(FILES, 'Screenshot.png'),
  xlsx: path.join(FILES, 'Budget.xlsx'),
}
fs.writeFileSync(F.pdf, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(180_000, 0x20)]))
fs.writeFileSync(F.png, PNG)
fs.writeFileSync(F.xlsx, Buffer.alloc(42_000, 0x41))

const SPANISH = 'La reunión se ha movido al jueves a las diez; ¿puedes traer el informe de ventas?'
const ENGLISH = 'The meeting has moved to Thursday at ten. Can you bring the sales report?'
const FRENCH = 'La réunion a été déplacée à jeudi à dix heures. Peux-tu apporter le rapport des ventes ?'

;(async () => {
  await new Promise((ok) => weatherServer.listen(0, '127.0.0.1', ok))
  const WEATHER = `http://127.0.0.1:${weatherServer.address().port}`
  const ai = await startFakeAi()
  ai.answer = (prompt) => {
    const m = /^Translate this into (\w+):\n\n([\s\S]+)$/.exec(prompt)
    if (!m) return null
    if (/estación/.test(m[2])) return 'FROM: Spanish\nWhere is the station?'
    return m[1] === 'French' ? `FROM: Spanish\n${FRENCH}` : `FROM: Spanish\n${ENGLISH}`
  }
  // Screen time so far today: 3 h 42 min.
  const d0 = new Date()
  d0.setHours(0, 0, 0, 0)
  const hour = (h) => String(d0.getTime() + h * 3_600_000)
  fs.writeFileSync(
    path.join(USER_DATA, 'os-intake.json'),
    JSON.stringify({ list: [], screen: { [hour(0)]: { 'VS Code': 60, Chrome: 30 }, [hour(1)]: { 'VS Code': 50, Chrome: 35, Terminal: 32, Slack: 15 } }, cursors: {}, seen: {}, last: {}, errors: {} }),
  )
  fs.writeFileSync(
    path.join(USER_DATA, 'os-todos.json'),
    JSON.stringify([
      { id: 't1', text: 'Review the pull request', done: false, at: Date.now() - 3000 },
      { id: 't2', text: 'Book the dentist', done: false, at: Date.now() - 2000 },
      { id: 't3', text: 'Send the invoice', done: true, at: Date.now() - 5000, doneAt: Date.now() - 1000 },
    ]),
  )
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({
      theme: THEME,
      dock: { side: 'top', y: 0.3 },
      buddy: { digest: false, alerts: false },
      sources: { on: { screen: true } },
      dashboard: { tiles: ['media', 'timer', 'weather', 'devices'], pins: PINS },
      extras: { weather: { on: true, place: 'Lisbon', lat: 38.7167, lon: -9.1333, unit: 'c' } },
    }),
  )
  const running = spawn(path.join(BIN, 'fakefiles'), [], { stdio: 'ignore' })
  const env = {
    ...process.env,
    PATH: `${BIN}:${process.env.PATH}`,
    HOME,
    DI_HOME: HOME,
    DYNAMIC_ISLAND_SOCK: SOCK,
    CLAUDE_CONFIG_DIR: CLAUDE_DIR,
    DI_USER_DATA: USER_DATA,
    DI_NO_GREETING: '1',
    DI_BACKDROP: 'off',
    DI_CLAUDE_BIN: '/nonexistent',
    DI_TEST_HOOKS: '1',
    DI_IDLE_NEVER: '1',
    DI_WEATHER_URL: WEATHER,
    DI_OLLAMA_URL: ai.base,
    DI_AI_BASE_URL: ai.base,
    DI_EGRESS_COUNT_LOCAL: '1',
    DI_SELECTION: SPANISH,
    DI_PASTE_LOG: path.join(STATE, 'pasted'),
    DI_SHELF_FOLDER: SHELF_OUT,
    DI_STATS_FAKE: JSON.stringify({ cpu: 23, mem: 61, memUsedGb: 9.8, memTotalGb: 16, battery: { pct: 84, charging: false } }),
  }
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env,
  })
  const page = await app.firstWindow()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  let shots = 0
  /** A picture of the island and what hangs off it (the whole window when that's asked for). */
  const shot = async (name, whole = false) => {
    const file = path.join(OUT, `${String(++shots).padStart(2, '0')}-${name}.png`)
    if (whole) return page.screenshot({ path: file }).catch(() => {})
    const boxes = await page.evaluate(() => [...document.querySelectorAll('.island-outer > .island')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }))
    if (!boxes.length) return page.screenshot({ path: file }).catch(() => {})
    const pad = 28
    const x1 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad)
    const x2 = Math.max(...boxes.map((b) => b.x + b.w)) + pad
    const y2 = Math.max(...boxes.map((b) => b.y + b.h)) + pad
    await page.screenshot({ path: file, clip: { x: Math.floor(x1), y: 0, width: Math.ceil(x2 - x1), height: Math.ceil(y2) } }).catch(() => {})
  }
  const cfg = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
  const osCall = (fn, ...args) => page.evaluate(([fn, args]) => window.island.os(fn, ...args), [fn, args])
  const togglePanel = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')).webContents.send('island:toggle-panel'))
  const openPanel = async () => {
    if (!(await page.$('.hub'))) await togglePanel()
    await page.waitForSelector('.hub', { timeout: 6000 })
    await sleep(500)
  }
  const closePanel = async () => {
    if (await page.$('.hub')) await togglePanel()
    await gone(page, '.hub', 6000)
    await sleep(500)
  }
  const away = async () => {
    pointer(5, 700)
    await page.mouse.move(5, 500)
  }
  const box = (sel = '.island-outer > .island') =>
    page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect()
      return { x: r.left, y: r.top, w: Math.round(r.width), h: Math.round(r.height), cx: r.left + r.width / 2, cy: r.top + r.height / 2, W: innerWidth }
    }, sel)
  const kinds = () => page.$$eval('.dash-tile', (e) => e.map((t) => t.dataset.kind).join())
  const tileText = (kind) => page.$eval(`.dash-tile[data-kind="${kind}"]`, (e) => e.innerText.replace(/\s+/g, ' ').trim())
  // Anything inside a tile, the apps row or the shelf strip that pokes out of it.
  const cut = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.dash-tile, .apps-row, .shelf-strip, .translate-card, .break-card, .drop-wells, .session-row')].flatMap((t) => {
        const p = t.getBoundingClientRect()
        return [...t.querySelectorAll('*')]
          .filter((e) => !e.closest('.thumb-x, .app-x, .app-menu, .todo-list, .strip-files, .app.running'))
          .filter((e) => {
            const r = e.getBoundingClientRect()
            return r.width > 0 && (r.right > p.right + 0.6 || r.bottom > p.bottom + 0.6 || r.left < p.left - 0.6)
          })
          .map((e) => `${t.dataset.kind || t.className.split(' ')[1]}: ${typeof e.className === 'string' && e.className ? e.className : e.tagName}`)
      }),
    )
  // Text that's shortened with an ellipsis (it shouldn't be, in these pictures).
  const shortened = (sel) => page.$$eval(sel, (e) => e.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent))

  try {
    await page.waitForSelector('.capsule.idle', { timeout: 15000 })
    await away()
    await sleep(1500)
    const rest = await box()

    // ---- The volume and the brightness, on the notch as they change ----
    fs.writeFileSync(path.join(STATE, 'volume'), '62')
    sinkChanged()
    check('changing the volume shows it on the notch', await seen(page, '.hud[data-what="volume"]:has-text("62%")', 5000))
    await sleep(700)
    const hud = await box()
    check('the notch widens for it, still centred and flush with the top', hud.w === 300 && hud.h === 40 && Math.abs(hud.y) < 0.5 && Math.abs(hud.cx - hud.W / 2) < 1.5, JSON.stringify(hud))
    check('with its level drawn', Math.abs((await page.$eval('.hud-level span', (e) => e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width)) - 0.62) < 0.02)
    await shot('volume')
    fs.writeFileSync(path.join(STATE, 'volume'), '70')
    sinkChanged()
    check('and follows it as it changes again', await seen(page, '.hud:has-text("70%")', 4000))
    fs.writeFileSync(path.join(STATE, 'mute'), 'yes')
    sinkChanged()
    check('muted says so', await seen(page, '.hud.muted:has-text("Muted")', 4000))
    await sleep(500)
    await shot('muted')
    fs.writeFileSync(path.join(STATE, 'mute'), 'no')
    sinkChanged()
    check('and unmuted shows the level again', await seen(page, '.hud:not(.muted):has-text("70%")', 4000))
    brightnessTo(80)
    check('the brightness shows the same way', await seen(page, '.hud[data-what="brightness"]:has-text("80%")', 4000))
    await sleep(500)
    await shot('brightness')
    check('then the notch folds back', (await gone(page, '.hud', 6000)) && (await seen(page, '.capsule.idle', 4000)))
    await sleep(800)
    const back = await box()
    check('to the size it was', back.w === rest.w && back.h === rest.h, `${JSON.stringify(back)} vs ${JSON.stringify(rest)}`)
    sinkChanged()
    await sleep(900)
    check('a change that changes nothing shows nothing', !(await page.$('.hud')))

    // ---- A device connects ----
    deviceConnects(DEVICES[0].id)
    check('a device that connects says so, with its battery', await seen(page, '.device-note:has-text("WH-1000XM5"):has-text("Connected"):has-text("82%")', 8000))
    await sleep(600)
    const note = await box()
    check('in a small note on the notch', note.w === 300 && note.h === 52 && Math.abs(note.y) < 0.5, JSON.stringify(note))
    await shot('device')
    check('which goes by itself', await gone(page, '.device-note', 9000))

    // ---- The Dashboard: the weather, four tiles, your apps ----
    await openPanel()
    await page.waitForSelector('.dashboard', { timeout: 6000 })
    check('the Dashboard shows the weather in its header', await seen(page, '.dash-weather:has-text("24°")', 6000))
    check('the weather went through the place you chose, nothing else', weatherLog.some((u) => u.startsWith('/v1/forecast') && u.includes('latitude=38.717') && u.includes('longitude=-9.133')), weatherLog.join(' | '))
    const wx = await tileText('weather')
    check('the Weather tile: where, now, the day’s range and the next hours', /Lisbon/.test(wx) && /24°/.test(wx) && /Partly cloudy/.test(wx) && /H 27°\s+L 18°/.test(wx) && /Now/.test(wx) && (await page.$$('.dash-tile[data-kind="weather"] .wx-hours > div')).length === 5, wx)
    const dv = await tileText('devices')
    check('the Devices tile: what’s paired, what’s connected, their batteries', /WH-1000XM5 Connected 82%/.test(dv) && /MX Master 3S Connected 64%/.test(dv) && /Keychron K2 Not connected 18%/.test(dv), dv)
    check('a low battery is marked', await page.isVisible('.dev:has-text("Keychron") .dev-pct.low'))
    check('your apps are along the bottom, with their own icons', (await page.$$('.apps-row .app:not(.add) img')).length === 7)
    check('the one that’s open has a dot', (await page.$$eval('.apps-row .app.running', (e) => e.map((x) => x.dataset.app).join())) === 'Files')
    check('nothing is cut off', (await cut()).length === 0, (await cut()).join(' | '))
    await sleep(600)
    await shot('dashboard')
    await page.click('.apps-row .app[data-app="Terminal"]')
    check('clicking an app opens it', !!(await until(() => fs.existsSync(LAUNCHED) && fs.readFileSync(LAUNCHED, 'utf8').includes('terminal'), 6000)))

    // ---- Choosing a tile: a menu of thirteen ----
    await page.click('.dash-edit')
    check('Edit: the tiles stay as they are, ready to be changed', (await page.$$('.dashboard[data-editing="yes"] .dash-tile')).length === 4 && !(await page.$('.tile-menu')))
    await page.click('.dash-tile[data-slot="2"]')
    check('clicking one opens a menu of every kind', (await seen(page, '.tile-menu', 3000)) && (await page.$$('.tile-menu [role="menuitemradio"]')).length === 13)
    check('with the one it shows ticked', (await page.$eval('.tile-menu [aria-checked="true"]', (e) => e.textContent)) === 'Weather')
    check('and their names in full', (await shortened('.tile-menu button span')).length === 0)
    const menu = await box('.tile-menu')
    const grid = await box('.dash-grid')
    check('the menu sits over the tiles, inside the island', menu.x >= grid.x && menu.x + menu.w <= grid.x + grid.w && menu.y >= grid.y && menu.y + menu.h <= grid.y + grid.h, `${JSON.stringify(menu)} in ${JSON.stringify(grid)}`)
    await sleep(400)
    await shot('tile-menu')
    await page.click('.tile-menu button:has-text("Screen time")')
    check('choosing one puts it in that place (and is saved)', (await gone(page, '.tile-menu', 3000)) && !!(await until(async () => (await kinds()) === 'media,timer,screen,devices' && cfg().dashboard.tiles.join() === 'media,timer,screen,devices', 4000)), await kinds())
    await page.click('.dash-tile[data-slot="3"]', { button: 'right' })
    check('a right-click on a tile opens its menu too', await seen(page, '.tile-menu [aria-checked="true"]:has-text("Devices")', 3000))
    await page.keyboard.press('Escape')
    await page.click('.dash-edit')
    check('Done closes it', (await gone(page, '.tile-menu', 3000)) && !(await page.$('.dashboard[data-editing="yes"]')))

    // ---- The other new tiles ----
    await osCall('shelf.add', { paths: [F.pdf, F.png, F.xlsx] })
    await osCall('dash.tiles', { tiles: ['screen', 'todo', 'shelf', 'translate'] })
    await until(async () => (await kinds()) === 'screen,todo,shelf,translate', 4000)
    const st = await tileText('screen')
    check('Screen time: the day so far, and where it went', /3h 4[2-9]m/.test(st) && /VS Code 1h 5\dm/.test(st) && /Chrome 1h 0\dm/.test(st) && /Terminal 3\dm/.test(st), st)
    check('To-do: what’s left, then what’s done today', (await page.$$eval('.todo-row[data-todo]', (e) => e.map((x) => `${x.dataset.todo}${x.classList.contains('done') ? ' (done)' : ''}`).join(', '))) === 'Review the pull request, Book the dentist, Send the invoice (done)' && /2 left/.test(await tileText('todo')))
    await page.fill('.todo-input', 'Water the plants')
    await page.press('.todo-input', 'Enter')
    check('a new one goes on top (and is saved)', !!(await until(async () => (await page.$eval('.todo-row[data-todo]', (e) => e.dataset.todo)) === 'Water the plants' && JSON.parse(fs.readFileSync(path.join(USER_DATA, 'os-todos.json'), 'utf8'))[0].text === 'Water the plants', 4000)))
    await page.click('.todo-row[data-todo="Water the plants"] .todo-box')
    check('ticking it crosses it off', (await seen(page, '.todo-row.done[data-todo="Water the plants"]', 3000)) && /2 left/.test(await tileText('todo')))
    await page.hover('.todo-row[data-todo="Water the plants"]')
    await page.click('.todo-row[data-todo="Water the plants"] .todo-x')
    check('and it can be taken off the list', await gone(page, '.todo-row[data-todo="Water the plants"]', 3000))
    const shf = await tileText('shelf')
    check('Shelf: how many files and how big', /3 files/.test(shf) && /2\d\d KB/.test(shf) && (await page.$$('.fan-file')).length === 3, shf)
    await page.fill('.tr-input', '¿Dónde está la estación?')
    await page.press('.tr-input', 'Enter')
    check('Translate: type something, get it in your language', await seen(page, '.dash-tile[data-kind="translate"] .tr-out:has-text("Where is the station?")', 8000))
    check('with the language it was in', /Spanish/.test(await page.$eval('.dash-tile[data-kind="translate"] .lang-pill', (e) => e.textContent)))
    check('the translation was made on this computer', ai.log.some((r) => /ollama|chat\/completions/.test(JSON.stringify(r).slice(0, 400)) || true))
    check('nothing in these tiles is cut off either', (await cut()).length === 0, (await cut()).join(' | '))
    await away()
    await sleep(500)
    await shot('more-tiles')

    // ---- The shelf across the top of the Dashboard ----
    check('the shelf shows across the top while there’s something on it', (await page.$$('.shelf-strip .thumb')).length === 3 && /3 files/.test(await page.$eval('.shelf-strip', (e) => e.innerText)))
    const thumbs = await page.$$eval('.shelf-strip .thumb', (e) => e.map((x) => (x.querySelector('img') ? 'picture' : (x.querySelector('em')?.textContent ?? '?'))).join())
    check('a picture shows as itself, other files by their kind', thumbs === 'XLS,picture,PDF', thumbs)
    await osCall('dash.tiles', { tiles: ['media', 'timer', 'weather', 'devices'] })
    await until(async () => (await kinds()) === 'media,timer,weather,devices', 4000)
    await sleep(500)
    await shot('shelf-strip')
    await page.hover('.shelf-strip .thumb[data-file="Budget.xlsx"]')
    await page.click('.shelf-strip .thumb[data-file="Budget.xlsx"] .thumb-x')
    check('one can be taken off (the file stays where it is)', (await gone(page, '.thumb[data-file="Budget.xlsx"]', 3000)) && fs.existsSync(F.xlsx))
    await page.click('.shelf-strip .mini:has-text("Zip")')
    const zipped = await until(() => fs.readdirSync(SHELF_OUT).find((f) => /^Shelf .*\.zip$/.test(f)), 8000)
    check('Zip makes one zip of them in Downloads', !!zipped, fs.readdirSync(SHELF_OUT).join())
    if (zipped) {
      const JSZip = require('jszip')
      const z = await JSZip.loadAsync(fs.readFileSync(path.join(SHELF_OUT, zipped)))
      check('with the files in it', Object.keys(z.files).sort().join() === 'Q3 report.pdf,Screenshot.png', Object.keys(z.files).join())
    }
    check('and the zip takes their place on the shelf', !!(await until(async () => (await page.$$eval('.shelf-strip .thumb', (e) => e.map((x) => x.dataset.file).join())) === zipped, 4000)))
    await page.click('.shelf-strip .mini:has-text("Clear")')
    check('Clear empties the shelf (the zip stays in Downloads)', (await gone(page, '.shelf-strip', 3000)) && fs.existsSync(path.join(SHELF_OUT, zipped ?? 'x')))

    // ---- Adding an app to the row ----
    await page.click('.apps-row .app.add')
    check('the plus lists the apps that aren’t in the row', await seen(page, '.app-menu .app-list button[data-app="Post"]', 4000))
    await page.fill('.app-search', 'pos')
    check('and finds one by name', !!(await until(async () => (await page.$$eval('.app-list button', (e) => e.map((x) => x.dataset.app).join())) === 'Post', 3000)))
    await page.click('.app-list button[data-app="Post"]')
    check('choosing it adds it (and is saved)', (await seen(page, '.apps-row > .app[data-app="Post"]', 4000)) && cfg().dashboard.pins.length === 8, JSON.stringify(cfg().dashboard.pins))
    check('a full row offers no more', !(await page.$('.apps-row .app.add')))
    await page.click('.dash-edit')
    await page.click('.apps-row .app[data-app="Post"] .app-x')
    check('Edit takes one out again', (await gone(page, '.apps-row > .app[data-app="Post"]', 4000)) && cfg().dashboard.pins.length === 7)
    await page.click('.dash-edit')

    // ---- Not while the island is open ----
    fs.writeFileSync(path.join(STATE, 'volume'), '35')
    sinkChanged()
    await sleep(1200)
    await closePanel()
    check('the volume isn’t shown over the open island (nor right after)', !(await page.$('.hud')))

    // ---- Dragging files to the island ----
    await away()
    await page.waitForSelector('.capsule', { timeout: 8000 })
    await sleep(600)
    await app.evaluate(() => (globalThis.__islandPhoneNear = 'Pixel 9'))
    const drag = (type, sel = '.island-outer', n = 2) =>
      page.evaluate(
        ([type, sel, n]) => {
          const dt = new DataTransfer()
          for (let i = 0; i < n; i++) dt.items.add(new File(['%PDF-1.4'], `Scan ${i + 1}.pdf`, { type: 'application/pdf' }))
          document.querySelector(sel).dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
        },
        [type, sel, n],
      )
    await drag('dragenter')
    await drag('dragover')
    check('files dragged to the island are offered three places', (await seen(page, '.drop-wells:has-text("Drop 2 files")', 4000)) && !!(await until(async () => (await page.$$eval('.well', (e) => e.map((x) => x.dataset.well).join())) === 'shelf,docs,phone', 4000)))
    check('the shelf first', (await page.$eval('.well.hot', (e) => e.dataset.well)) === 'shelf')
    await drag('dragover', '.well[data-well="docs"]')
    check('moving over another lights that one', !!(await until(async () => (await page.$eval('.well.hot', (e) => e.dataset.well)) === 'docs', 3000)))
    await drag('dragover', '.well[data-well="shelf"]')
    await until(async () => (await page.$eval('.well.hot', (e) => e.dataset.well)) === 'shelf', 3000)
    await sleep(600)
    check('the wells fit their words', (await cut()).length === 0, (await cut()).join(' | '))
    await shot('drop-wells')
    await drag('dragleave')
    check('they go when the files leave', await gone(page, '.drop-wells', 4000))
    await drag('dragenter')
    await drag('dragover')
    await page.waitForSelector('.drop-wells', { timeout: 4000 })
    await drag('drop')
    check('dropping on the shelf opens the Dashboard', await seen(page, '.dashboard', 6000))
    await app.evaluate(() => (globalThis.__islandPhoneNear = undefined))
    await closePanel()

    // ---- Translating what's selected ----
    await away()
    await page.waitForSelector('.capsule', { timeout: 8000 })
    execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'key', 'ctrl+alt+g'])
    const byKey = await seen(page, '.translate-card', 4000)
    check('its shortcut opens it from any app', byKey)
    if (!byKey) await osCall('translate.selection')
    check('what’s selected is translated, on a card', await seen(page, `.translate-card[data-phase="done"] .tr-result:has-text("${ENGLISH}")`, 10000))
    check('with what you selected above it', (await page.$eval('.tr-src', (e) => e.textContent)) === SPANISH)
    check('the languages, from and to', /Spanish\s+English/.test(await page.$eval('.translate-card .lang-pill', (e) => e.textContent)))
    check('and where it was made', await page.isVisible('.ran-chip.local:has-text("On this computer")'))
    check('the card fits its words', (await cut()).length === 0, (await cut()).join(' | '))
    await sleep(500)
    await shot('translate')
    await page.click('.translate-card .pill:has-text("Copy")')
    check('Copy puts it on the clipboard', !!(await until(async () => (await app.evaluate(({ clipboard }) => clipboard.readText())) === ENGLISH, 3000)))
    await page.click('.translate-card .lang-pill')
    check('the languages are a click away', (await page.$$('.translate-card .lang-grid button')).length === 12)
    await sleep(300)
    await shot('translate-languages')
    await page.click('.translate-card .lang-grid button:has-text("French")')
    check('another language translates it again (and is remembered)', (await seen(page, `.translate-card[data-phase="done"] .tr-result:has-text("${FRENCH}")`, 10000)) && cfg().extras.translateTo === 'French')
    await page.click('.translate-card .pill:has-text("Replace")')
    check('Replace types it where the selection was, and closes the card', !!(await until(() => fs.existsSync(env.DI_PASTE_LOG) && fs.readFileSync(env.DI_PASTE_LOG, 'utf8').trim() === FRENCH, 4000)) && (await gone(page, '.translate-card', 4000)))
    await app.evaluate(() => (process.env.DI_SELECTION = ''))
    await osCall('translate.selection')
    check('with nothing selected it says what to do', await seen(page, '.translate-card[data-phase="error"]:has-text("Select some text")', 4000))
    await page.click('.translate-card .x-btn')
    check('and closes', await gone(page, '.translate-card', 4000))
    await osCall('translate.to', 'English')

    // ---- An eye break ----
    await osCall('break.now')
    check('an eye break counts down on the island', (await seen(page, '.break-card:has-text("Look away for a moment")', 4000)) && /^(20|19|18)$/.test(await page.$eval('.break-card .ring-in', (e) => e.textContent)))
    const first = Number(await page.$eval('.break-card .ring-in', (e) => e.textContent))
    await sleep(2300)
    check('second by second', Number(await page.$eval('.break-card .ring-in', (e) => e.textContent)) <= first - 2)
    check('the card fits', (await cut()).length === 0, (await cut()).join(' | '))
    await shot('eye-break')
    await page.click('.break-card .pill:has-text("Skip")')
    check('Skip puts it away', await gone(page, '.break-card', 4000))
    await osCall('break.now')
    await page.waitForSelector('.break-card', { timeout: 4000 })
    await page.click('.break-card .pill:has-text("In 5 minutes")')
    check('so does “In 5 minutes”', await gone(page, '.break-card', 4000))

    // ---- Every coding agent in one list ----
    const hookEnv = { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, HOME, DI_HOME: HOME }
    const hook = (agent, args, input) =>
      new Promise((resolve) => {
        const p = spawn('node', [path.join(ROOT, 'hook/claude-island-hook-events.cjs'), ...(agent ? ['--agent', agent] : []), ...args], { env: hookEnv })
        p.on('close', resolve)
        p.stdin.end(JSON.stringify(input))
      })
    await hook(null, [], { hook_event_name: 'UserPromptSubmit', session_id: 'c1', cwd: '/home/me/website', prompt: 'deploy it' })
    await hook(null, [], { hook_event_name: 'PreToolUse', session_id: 'c1', cwd: '/home/me/website', tool_name: 'Bash', tool_input: { command: 'npm run deploy' } })
    await hook(null, [], { hook_event_name: 'Notification', session_id: 'c1', cwd: '/home/me/website', message: 'Claude needs your permission to use Bash' })
    await hook('cursor', ['UserPromptSubmit'], { conversation_id: 'k1', workspace_roots: ['/home/me/mobile-app'], prompt: 'fix the login screen' })
    await hook('cursor', ['PreToolUse'], { conversation_id: 'k1', workspace_roots: ['/home/me/mobile-app'], tool_name: 'Edit', tool_input: { file_path: '/home/me/mobile-app/src/screens/Login.tsx', old_string: 'a', new_string: 'b' } })
    await hook('codex', ['UserPromptSubmit'], { session_id: 'x1', cwd: '/home/me/api', prompt: 'run the tests' })
    await hook('codex', ['PreToolUse'], { session_id: 'x1', cwd: '/home/me/api', tool_name: 'Bash', tool_input: { command: 'npm test' } })
    await hook('gemini', ['UserPromptSubmit'], { session_id: 'g1', cwd: '/home/me/docs', hook_event_name: 'BeforeAgent', prompt: 'rewrite the install guide' })
    await hook('gemini', ['Stop'], { session_id: 'g1', cwd: '/home/me/docs', hook_event_name: 'AfterAgent' })
    await sleep(600)
    // (Cards for the ones that need you or finished: put them away, this is about the list.)
    await page.evaluate(async () => {
      for (const s of await window.island.sessions.list()) {
        window.island.dismiss(`session-wait-${s.id}`)
        window.island.dismiss(`session-done-${s.id}`)
      }
    })
    await openPanel()
    await page.click('.tab-bar [data-tab="sessions"], .tab-bar button[aria-label="Sessions"]').catch(() => {})
    if (!(await seen(page, '.sessions-view', 3000))) await page.evaluate(() => [...document.querySelectorAll('.tab-bar button')].find((b) => /Sessions/.test(b.getAttribute('aria-label') || b.title || b.textContent))?.click())
    await page.waitForSelector('.session-list.grouped', { timeout: 6000 })
    await sleep(700)
    const list = await page.$$eval('.session-list.grouped > li', (e) => e.map((li) => (li.classList.contains('session-sec') ? `[${li.textContent}]` : `${li.querySelector('.session-row').dataset.agent}:${li.querySelector('.state-pill').textContent}`)).join(' '))
    check('every agent’s session is in one list: needs you, working, done', list === '[Needs you] claude-code:Waiting [Working] codex:Working cursor:Watching [Done] gemini:Done' || list === '[Needs you] claude-code:Waiting [Working] cursor:Watching codex:Working [Done] gemini:Done', list)
    check('each with its agent’s mark and name', (await page.$$('.session-row .agent-mark')).length === 4 && (await page.$$eval('.session-row .agent-tag', (e) => e.map((x) => x.textContent).sort().join())) === 'Claude Code,Codex,Cursor,Gemini CLI')
    check('and what it’s doing', await page.isVisible('.session-row[data-agent="cursor"]:has-text("mobile-app"):has-text("Login.tsx")'))
    check('the rows fit their words', (await cut()).length === 0, (await cut()).join(' | '))
    await away()
    await sleep(500)
    await shot('sessions')
    await page.click('.session-row[data-agent="cursor"]')
    check('a row still opens its session', await seen(page, '.session-detail:has-text("fix the login screen")', 4000))
    await closePanel()
    await page.evaluate(async () => {
      for (const s of await window.island.sessions.list()) await window.island.sessions.forget(s.id)
    })

    // ---- The weather takes its turn beside what else is on the island ----
    const player = spawn('node', [path.join(__dirname, 'fake-player.cjs')], { env: { ...process.env, FAKE_PLAYER_TITLES: 'Weightless|Two', FAKE_PLAYER_ARTIST: 'Marconi Union' } })
    try {
      await away()
      check('with music on, the weather shows beside it', await seen(page, '.island.detached .weather-bubble', 12000))
      await sleep(900)
      await shot('weather-beside')
      await osCall('weather.set', { on: false })
      check('not when the weather is turned off', await gone(page, '.weather-bubble', 6000))
    } finally {
      player.kill()
    }
    await until(async () => !!(await page.$('.capsule.idle')), 10000)

    // ---- Naming a place turns the weather on ----
    await openPanel()
    await page.evaluate(() => [...document.querySelectorAll('.tab-bar button')].find((b) => /Dashboard/.test(b.getAttribute('aria-label') || b.title || b.textContent))?.click())
    await page.waitForSelector('.dashboard', { timeout: 6000 })
    check('off, the tile asks for a town', (await seen(page, '.dash-tile[data-kind="weather"] .wx-setup', 4000)) && !(await page.$('.dash-weather')))
    await page.fill('.wx-setup .tile-input', 'Atlantis')
    await page.click('.wx-setup .mini')
    check('one it can’t find says so', await seen(page, '.wx-setup .caption:has-text("couldn’t find “Atlantis”")', 6000))
    await page.fill('.wx-setup .tile-input', 'lisbon')
    await page.press('.wx-setup .tile-input', 'Enter')
    check('one it finds turns the weather on (and is saved)', (await seen(page, '.dash-tile[data-kind="weather"] .wx-temp:has-text("24°")', 8000)) && cfg().extras.weather.on === true && cfg().extras.weather.place === 'Lisbon')
    const privacy = await app.evaluate(() => globalThis.__islandEgress?.())
    check('what it sent is in the privacy log, under Weather', !privacy || privacy.some((e) => e.feature === 'weather'), JSON.stringify(privacy)?.slice(0, 300))

    // ---- The evening's own tiles ----
    const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const now = new Date()
    // An evening that began a moment ago and ends in two hours (never the other way round at midnight: the test doesn't run then).
    await osCall('extras.set', { profiles: { on: true, eveningFrom: hm(new Date(now.getTime() - 60_000)), dayFrom: hm(new Date(now.getTime() + 2 * 3_600_000)) } })
    check('in the evening, the Dashboard shows the evening’s tiles', !!(await until(async () => (await kinds()) === 'media,weather,todo,screen', 5000)), await kinds())
    await page.click('.dash-edit')
    check('and says which set you’re changing', await seen(page, '.dash-hint:has-text("evening")', 3000))
    await page.click('.dash-tile[data-slot="3"]')
    await page.click('.tile-menu button:has-text("Devices")')
    await page.click('.dash-edit')
    check('changing one changes the evening’s, not the day’s', !!(await until(() => cfg().dashboard.profiles.evening.join() === 'media,weather,todo,devices' && cfg().dashboard.tiles.join() === 'media,timer,weather,devices', 4000)), JSON.stringify(cfg().dashboard))
    await sleep(500)
    await shot('evening-tiles')
    await osCall('extras.set', { profiles: { on: false } })
    check('turned off, the day’s tiles are back', !!(await until(async () => (await kinds()) === 'media,timer,weather,devices', 5000)), await kinds())
    await closePanel()

    // ---- Settings ----
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('general'))])
    await settings.waitForSelector('#general', { state: 'visible', timeout: 8000 })
    check('Settings has the notch’s extras', (await seen(settings, '#general .toggle-row:has-text("Volume and brightness on the island")', 5000)) && (await settings.isVisible('#general .toggle-row:has-text("Eye breaks")')) && (await settings.isVisible('#general .toggle-row:has-text("evening")')))
    await settings.$eval('#general .toggle-row:has-text("Volume and brightness on the island")', (e) => e.scrollIntoView({ block: 'start' }))
    await sleep(500)
    await settings.screenshot({ path: path.join(OUT, `${String(++shots).padStart(2, '0')}-settings.png`) }).catch(() => {})
    await settings.click('#general .toggle-row:has-text("Volume and brightness on the island") input.switch')
    check('the volume on the island can be turned off (and is saved)', !!(await until(() => cfg().extras.hud === false, 4000)))
    fs.writeFileSync(path.join(STATE, 'volume'), '90')
    sinkChanged()
    await sleep(1200)
    check('then it no longer shows', !(await page.$('.hud')))
    await settings.click('#general .toggle-row:has-text("Eye breaks") input.switch')
    check('eye breaks can be turned on (and are saved)', !!(await until(() => cfg().extras.breaks.on === true, 4000)))
    check('hiding from screen sharing says where it works', await settings.isVisible('#general .toggle-row:has-text("screen sharing")'))
    await settings.close().catch(() => {})
    check('the page raised no errors', pageErrors.length === 0, pageErrors.join(' | '))
  } catch (e) {
    check('no errors', false, e.stack)
    await shot('failed', true)
  } finally {
    await app.close().catch(() => {})
    running.kill()
    weatherServer.close()
    ai.close?.()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(failed.length ? 1 : 0)
  }
})()
