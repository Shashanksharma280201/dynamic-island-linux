// A small "Files" window for the tour's drag actions scene: a folder with a few
// documents to drag out, like a file manager. FILES_DIR holds them; FILES_AT is
// "x,y,width,height" (screen units). Prints "ready" and each icon's middle on
// screen ({"name": [x, y]}), so the tour knows where to press.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const dir = process.env.FILES_DIR
const [x, y, width, height] = (process.env.FILES_AT || '64,470,540,200').split(',').map(Number)
const COLOR = { pdf: '#ff453a', docx: '#0a84ff', png: '#bf5af2', jpg: '#bf5af2', md: '#8e8e93', xlsx: '#30d158', csv: '#30d158' }
const files = fs
  .readdirSync(dir)
  .filter((f) => !f.startsWith('.'))
  .sort()
  .slice(0, 5)
  .map((name) => {
    const ext = path.extname(name).slice(1).toLowerCase()
    return { name, ext, color: COLOR[ext] ?? '#8e8e93' }
  })

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url(${JSON.stringify('file://' + path.join(__dirname, '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'))}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; font-family: Inter, sans-serif; cursor: default; user-select: none; }
.win { position: absolute; inset: 0; border-radius: 14px; background: rgba(28, 28, 34, .94); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 20px 50px rgba(0,0,0,.45); overflow: hidden; }
.bar { height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: rgba(255,255,255,.05); border-bottom: 1px solid rgba(255,255,255,.08); color: rgba(255,255,255,.9); font-size: 13px; font-weight: 600; }
.dot { width: 11px; height: 11px; border-radius: 50%; }
.grid { display: flex; gap: 18px; padding: 18px 20px; }
.f { width: 92px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: rgba(255,255,255,.88); font-size: 11.5px; text-align: center; line-height: 1.25; }
.doc { position: relative; width: 46px; height: 58px; border-radius: 5px 13px 5px 5px; background: linear-gradient(180deg, #fafafc, #e9e9ef); box-shadow: 0 6px 14px rgba(0,0,0,.35); }
.doc i { position: absolute; left: 9px; right: 9px; top: 14px; height: 22px; background: repeating-linear-gradient(#c9c9d1 0 2px, transparent 2px 7px); }
.doc b { position: absolute; left: -7px; bottom: 8px; padding: 2px 5px; border-radius: 4px; font-size: 9px; font-weight: 750; color: #fff; letter-spacing: .03em; }
</style></head><body><div class="win">
<div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span style="margin-left:8px">Downloads</span></div>
<div class="grid">${files
  .map((f) => `<div class="f" draggable="true" data-name="${f.name}"><div class="doc"><i></i><b style="background:${f.color}">${f.ext.toUpperCase()}</b></div><span>${f.name}</span></div>`)
  .join('')}</div></div>
<script>
const { ipcRenderer } = require('electron')
// What follows the pointer while dragging: the same document, drawn bigger.
function picture(ext, color) {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4
  g.fillStyle = '#f4f4f8'
  g.beginPath(); g.roundRect(22, 10, 54, 72, [6, 16, 6, 6]); g.fill()
  g.shadowColor = 'transparent'
  g.fillStyle = '#c9c9d1'
  for (let i = 0; i < 4; i++) g.fillRect(32, 26 + i * 8, 34, 2.5)
  g.fillStyle = color
  g.beginPath(); g.roundRect(14, 58, 40, 16, 4); g.fill()
  g.fillStyle = '#fff'; g.font = 'bold 10px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(ext.toUpperCase(), 34, 70)
  return c.toDataURL('image/png')
}
for (const el of document.querySelectorAll('.f')) {
  el.addEventListener('dragstart', (e) => {
    e.preventDefault()
    const b = el.querySelector('b')
    ipcRenderer.send('drag', { name: el.dataset.name, icon: picture(b.textContent, b.style.background) })
  })
}
const spots = {}
for (const el of document.querySelectorAll('.f .doc')) {
  const r = el.getBoundingClientRect()
  spots[el.parentElement.dataset.name] = [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
}
ipcRenderer.send('spots', spots)
</script></body></html>`

app.whenReady().then(() => {
  const win = new BrowserWindow({ x, y, width, height, frame: false, transparent: true, resizable: false, hasShadow: false, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } })
  ipcMain.on('drag', (e, { name, icon }) => {
    console.log('dragging', name)
    e.sender.startDrag({ file: path.join(dir, name), icon: nativeImage.createFromDataURL(icon) })
  })
  ipcMain.on('spots', (_e, spots) => {
    const b = win.getBounds()
    const abs = Object.fromEntries(Object.entries(spots).map(([k, [sx, sy]]) => [k, [b.x + sx, b.y + sy]]))
    console.log(`ready ${JSON.stringify(abs)}`)
  })
  win.once('ready-to-show', () => win.showInactive())
  // From a file, so the page may load the bundled font.
  const page = path.join(os.tmpdir(), `island-files-${process.pid}.html`)
  fs.writeFileSync(page, html)
  win.loadFile(page)
})
app.on('window-all-closed', () => app.quit())
