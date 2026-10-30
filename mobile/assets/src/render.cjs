// Renders the app's icons from SVG (run with Electron: electron render.cjs).
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const glyph = fs.readFileSync(path.join(__dirname, 'glyph.svg'), 'utf8')
const defs = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f6f8c"/><stop offset="1" stop-color="#7fd0e0"/></linearGradient>
  <radialGradient id="light" cx="1" cy="0.5" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.28" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.5" stop-color="#dff3ff" stop-opacity="0.6"/><stop offset="0.68" stop-color="#b9e6ff" stop-opacity="0.18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <radialGradient id="prism" cx="1" cy="0.5" r="0.95"><stop offset="0.3" stop-color="#8ce1ff" stop-opacity="0"/><stop offset="0.45" stop-color="#8ce1ff" stop-opacity="0.6"/><stop offset="0.57" stop-color="#78ffbe" stop-opacity="0.5"/><stop offset="0.66" stop-color="#ffe278" stop-opacity="0.45"/><stop offset="0.75" stop-color="#ff8c96" stop-opacity="0.4"/><stop offset="0.85" stop-color="#ce78ff" stop-opacity="0.35"/><stop offset="1" stop-color="#7a6eff" stop-opacity="0"/></radialGradient>
</defs>`
const art = (bg, scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}
  ${bg ? '<rect width="1024" height="1024" fill="#0b0c0f"/>' : ''}
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <rect width="1024" height="1024" fill="url(#prism)"/>
    <rect width="1024" height="1024" fill="url(#light)"/>
    ${glyph}
  </g></svg>`
const mono = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(512 512) scale(0.62) translate(-512 -512)"><g transform="translate(470 520) rotate(-9)"><rect x="-170" y="-205" width="340" height="410" rx="54" fill="#fff"/></g>
  <path d="M1024 330 A 190 190 0 0 0 1024 694 Z" fill="#fff"/></g></svg>`
const jobs = [
  ['icon.png', art(true, 1)],
  ['android-icon-foreground.png', art(false, 0.62)],
  ['android-icon-monochrome.png', mono],
  ['splash-icon.png', art(false, 0.8)],
  ['favicon.png', art(true, 1)],
]
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  for (const [name, svg] of jobs) {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`))
    await new Promise((r) => setTimeout(r, 300))
    const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
    const out = name === 'favicon.png' ? img.resize({ width: 48, height: 48 }) : img
    fs.writeFileSync(path.join(__dirname, '..', name), out.toPNG())
  }
  app.exit(0)
})
