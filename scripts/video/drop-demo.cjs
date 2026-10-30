// Records Phone Drop on a mountain wallpaper: this script plays the phone (as
// e2e/drop.cjs does) and sends a photo, a PDF and a slow video while ffmpeg
// records the screen. Run it under Xvfb with xcompmgr installed:
//
//   xvfb-run -a -s "-screen 0 1920x1080x24" dbus-run-session -- node scripts/video/drop-demo.cjs out.mp4
const { _electron } = require('playwright-core')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const zlib = require('zlib')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.resolve(process.argv[2] || 'phone-drop.mp4')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-drop-demo-'))
const USER_DATA = path.join(TMP, 'profile')
const FOLDER = path.join(TMP, 'Downloads')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const TOKEN = 'demo-' + 'd'.repeat(40)
const PORT = 22000 + Math.floor(Math.random() * 20000)
const BASE = `http://127.0.0.1:${PORT}`
fs.mkdirSync(USER_DATA, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A little landscape photo as a PNG: sky, sun, a ridge and its reflection. */
function photo(w, h, { top, bottom, sun, ridge, seed }) {
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  const raw = Buffer.alloc((w * 3 + 1) * h)
  const horizon = h * 0.66
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const u = x / w
      const line = horizon - h * (0.18 + 0.1 * Math.sin(u * 7 + seed) + 0.06 * Math.sin(u * 17 + seed * 2) + 0.03 * Math.sin(u * 41))
      const yy = y < horizon ? y : 2 * horizon - y
      let c
      if (yy < line) {
        c = mix(top, bottom, yy / horizon)
        const d = Math.hypot(x - w * 0.68, yy - horizon * 0.55) / (h * 0.09)
        if (d < 1) c = mix(sun, c, d * d)
        else if (d < 3) c = mix(c, sun, 0.25 * (1 - (d - 1) / 2))
      } else c = mix(ridge, [10, 18, 26], Math.min(1, (yy - line) / (h * 0.3)))
      if (y >= horizon) c = mix(c, [12, 30, 44], 0.35 + 0.05 * Math.sin(y * 1.3))
      const i = y * (w * 3 + 1) + 1 + x * 3
      raw[i] = c[0]
      raw[i + 1] = c[1]
      raw[i + 2] = c[2]
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const auth = { Authorization: `Bearer ${TOKEN}` }
const approach = (id, side, at, name, size, thumb) =>
  fetch(`${BASE}/drop/approach`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, side, at, files: [{ name, size }], device: 'Pixel 9', thumb }) })
const send = (id, name, body, chunkMs = 0) => {
  const stream = new ReadableStream({
    async start(c) {
      const n = chunkMs ? 16 : 1
      const step = Math.ceil(body.length / n)
      for (let i = 0; i < n; i++) {
        c.enqueue(body.subarray(i * step, (i + 1) * step))
        if (chunkMs) await sleep(chunkMs)
      }
      c.close()
    },
  })
  return fetch(`${BASE}/drop/file?id=${id}&index=0&name=${encodeURIComponent(name)}&size=${body.length}`, { method: 'PUT', headers: auth, body: stream, duplex: 'half' })
}

;(async () => {
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'top' }, drop: { on: true }, character: { id: 'orbit', name: 'Nova' } }))
  const frost = photo(480, 320, { top: [24, 74, 104], bottom: [150, 210, 225], sun: [255, 250, 235], ridge: [40, 70, 92], seed: 1 })
  const golden = photo(480, 320, { top: [70, 40, 90], bottom: [255, 170, 110], sun: [255, 236, 170], ridge: [60, 36, 50], seed: 4 })
  const thumbOf = (png) => 'data:image/png;base64,' + png.toString('base64')

  const compositor = spawn('xcompmgr', ['-n'], { stdio: 'ignore' })
  compositor.on('error', () => console.log('xcompmgr not found: the glow will show on black'))
  await sleep(400)
  const desk = await _electron.launch({ executablePath: ELECTRON, args: [path.join(__dirname, 'desktop-app.cjs'), '--no-sandbox'], env: { ...process.env, DESKTOP_PAGE: 'wallpaper.html' } })
  await (await desk.firstWindow()).waitForLoadState()
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, HOME: TMP, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_BACKDROP: 'off', DI_NO_GREETING: '1', DI_DROP_TOKEN: TOKEN, DI_DROP_PORT: String(PORT), DI_DROP_FOLDER: FOLDER },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.capsule', { timeout: 20000 })
  await sleep(2500)
  const { width, height } = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds)

  const rec = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${width}x${height}`, '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', OUT], { stdio: ['pipe', 'inherit', 'inherit'] })
  await sleep(1200)

  // A photo, from the phone on the right.
  await approach('demo-frost', 'right', 0.42, 'Highland frost.png', frost.length, thumbOf(frost))
  await sleep(1300)
  await send('demo-frost', 'Highland frost.png', frost)
  await sleep(3800)

  // A PDF, a little lower.
  const pdf = Buffer.alloc(240_000, 37)
  await approach('demo-pdf', 'right', 0.6, 'Q4 Report.pdf', pdf.length)
  await sleep(1100)
  await send('demo-pdf', 'Q4 Report.pdf', pdf)
  await sleep(3800)

  // Another photo.
  await approach('demo-golden', 'right', 0.5, 'Golden hour.png', golden.length, thumbOf(golden))
  await sleep(1100)
  await send('demo-golden', 'Golden hour.png', golden)
  await sleep(3600)

  // A video, slowly: it goes on in the island.
  const video = Buffer.alloc(3_000_000, 5)
  await approach('demo-video', 'right', 0.45, 'Waterfall.mp4', video.length)
  await sleep(1000)
  await send('demo-video', 'Waterfall.mp4', video, 380)
  await sleep(3500)

  rec.stdin.write('q')
  await new Promise((r) => rec.on('exit', r))
  await app.close().catch(() => {})
  await desk.close().catch(() => {})
  compositor.kill()
  console.log(`recorded ${OUT}`)
  process.exit(0)
})()
