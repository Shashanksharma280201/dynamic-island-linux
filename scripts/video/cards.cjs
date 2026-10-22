// Draws the launch video's still frames from HTML, with the app's own font:
// the title and end cards (16:9 and square), and, for each beat of the square
// video, its background with the beat's headline above where the footage goes.
//   electron scripts/video/cards.cjs OUT_DIR   (under xvfb-run)
// Writes OUT_DIR/cards/<name>.png (and social.png, the repository's social
// preview). Reads scripts/video/launch.json.
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const out = path.join(process.argv[2] || 'video-out', 'cards')
fs.mkdirSync(out, { recursive: true })
const beats = JSON.parse(fs.readFileSync(path.join(__dirname, 'launch.json'), 'utf8'))
const font = 'file://' + path.join(__dirname, '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
const REPO = 'github.com/shashanksharma280201/dynamic-island-linux'
const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/shashanksharma280201/dynamic-island-linux/main/scripts/install.sh | bash'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const page = (w, h, body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url(${JSON.stringify(font)}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
body { font-family: Inter, sans-serif; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  background: radial-gradient(${w * 0.7}px ${h * 0.7}px at 18% 18%, #3b2a8f 0%, transparent 62%), radial-gradient(${w * 0.6}px ${h * 0.6}px at 86% 92%, #0e6b8c 0%, transparent 62%), linear-gradient(135deg, #141428, #0b1020 60%, #071a24); }
.pill { display: inline-flex; align-items: center; justify-content: center; gap: 14px; background: #000; border-radius: 999px; box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.14); }
.pill i { display: block; border-radius: 50%; }
.chips { display: flex; gap: 14px; justify-content: center; }
.chips span { padding: 10px 22px; border-radius: 999px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); font-weight: 550; }
.kicker { color: #9fb4ff; text-transform: uppercase; letter-spacing: .16em; font-weight: 650; }
code { font-family: 'DejaVu Sans Mono', monospace; color: #d8f5d0; }
${extra}
</style></head><body>${body}</body></html>`

// A black capsule with album art and a waveform, like the island at rest with music.
const capsule = (k) => `<div class="pill" style="height:${56 * k}px;padding:0 ${22 * k}px">
  <i style="width:${34 * k}px;height:${34 * k}px;border-radius:${9 * k}px;background:linear-gradient(135deg,#ff9f0a,#e8590c)"></i>
  ${[0.5, 0.9, 0.65, 1, 0.7, 0.45].map((v) => `<i style="width:${5 * k}px;height:${30 * v * k}px;border-radius:${3 * k}px;background:#ff9f0a"></i>`).join('')}
</div>`

function titleCard(b, w, h) {
  const k = Math.min(w, h) / 1080
  return page(w, h, `${capsule(1.6 * k)}
    <div style="font-size:${132 * k}px;font-weight:780;letter-spacing:-.03em;margin-top:${54 * k}px;line-height:1">${esc(b.title)}</div>
    <div style="font-size:${40 * k}px;color:#c9d2ea;margin-top:${22 * k}px;font-weight:450">${esc(b.sub)}</div>
    <div class="chips" style="margin-top:${40 * k}px;font-size:${24 * k}px"><span>Open source</span><span>MIT</span><span>Free</span></div>`)
}

function endCard(b, w, h) {
  const k = Math.min(w, h) / 1080
  const square = w === h
  return page(w, h, `<div class="kicker" style="font-size:${22 * k}px">Dynamic Island 0.4</div>
    <div style="font-size:${104 * k}px;font-weight:780;letter-spacing:-.03em;margin-top:${18 * k}px;line-height:1.02">${esc(b.title)}</div>
    <div style="margin-top:${40 * k}px;font-size:${(square ? 27 : 36) * k}px;font-weight:600;padding:${16 * k}px ${30 * k}px;border-radius:${18 * k}px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18)">${esc(b.sub)}</div>
    <div style="margin-top:${34 * k}px;font-size:${(square ? 15 : 19) * k}px;max-width:${w * 0.86}px;padding:${14 * k}px ${22 * k}px;border-radius:${14 * k}px;background:rgba(5,8,20,.7);border:1px solid rgba(255,255,255,.12)"><code>${esc(INSTALL)}</code></div>
    <div class="chips" style="margin-top:${36 * k}px;font-size:${24 * k}px"><span>Linux</span><span>macOS</span><span>Windows</span></div>`)
}

// The square video: the beat's headline on top, the footage (1080 x 608) at y 236, captions below.
function squareBack(b) {
  return page(
    1080,
    1080,
    `<div class="top"><div class="brand"><span class="dot"></span>Dynamic Island</div><div class="head">${esc(b.title)}</div></div><div class="hole"></div>`,
    `body { justify-content: flex-start; }
     .top { height: 236px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
     .brand { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 650; color: #9fb4ff; letter-spacing: .04em; }
     .dot { width: 46px; height: 18px; border-radius: 999px; background: #000; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
     .head { font-size: 58px; font-weight: 760; letter-spacing: -.02em; }
     .hole { width: 1080px; height: 608px; background: #000; }`,
  )
}

app.disableHardwareAcceleration()
// One card at a time: closing one mustn't quit before the next.
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  // The repository's social preview (GitHub, LinkedIn and X show it with a link).
  const jobs = [
    [
      'social',
      1280,
      640,
      page(1280, 640, `${capsule(1.15)}
        <div style="font-size:96px;font-weight:780;letter-spacing:-.03em;margin-top:34px;line-height:1">Dynamic Island</div>
        <div style="font-size:30px;color:#c9d2ea;margin-top:16px;font-weight:450">Music, messages, Claude Code and your files, on the edge of your screen</div>
        <div class="chips" style="margin-top:28px;font-size:19px"><span>Linux</span><span>macOS</span><span>Windows</span><span>Open source</span></div>`),
    ],
  ]
  for (const b of beats) {
    if (b.card === 'title') jobs.push([`${b.id}-wide`, 1920, 1080, titleCard(b, 1920, 1080)], [`${b.id}-square`, 1080, 1080, titleCard(b, 1080, 1080)])
    else if (b.card === 'end') jobs.push([`${b.id}-wide`, 1920, 1080, endCard(b, 1920, 1080)], [`${b.id}-square`, 1080, 1080, endCard(b, 1080, 1080)])
    else jobs.push([`${b.id}-square`, 1080, 1080, squareBack(b)])
  }
  for (const [name, w, h, html] of jobs) {
    const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true, webPreferences: { offscreen: true } })
    const file = path.join(os.tmpdir(), `island-card-${process.pid}-${name}.html`)
    fs.writeFileSync(file, html)
    await win.loadFile(file)
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    await new Promise((r) => setTimeout(r, 300))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h })
    fs.writeFileSync(path.join(out, `${name}.png`), img.resize({ width: w, height: h }).toPNG())
    win.destroy()
    fs.rmSync(file, { force: true })
    console.log(name)
  }
  app.quit()
})
