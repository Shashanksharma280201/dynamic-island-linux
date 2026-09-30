// Records a one-second 320x240 WebM from a canvas into $CLIP_OUT (used by
// e2e/messages.cjs as a stand-in WhatsApp video), then quits.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
  await w.loadURL('about:blank')
  const b64 = await w.webContents.executeJavaScript(`new Promise((resolve) => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240
    const g = c.getContext('2d'); let t = 0
    const draw = () => { g.fillStyle = 'hsl(' + (t++ * 6) + ',80%,55%)'; g.fillRect(0, 0, 320, 240) }
    const timer = setInterval(draw, 30); draw()
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' })
    const parts = []
    rec.ondataavailable = (e) => parts.push(e.data)
    rec.onstop = async () => {
      clearInterval(timer)
      const buf = await new Blob(parts, { type: 'video/webm' }).arrayBuffer()
      let s = ''; const u = new Uint8Array(buf)
      for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
      resolve(btoa(s))
    }
    rec.start(); setTimeout(() => rec.stop(), 1000)
  })`)
  fs.writeFileSync(process.env.CLIP_OUT, Buffer.from(b64, 'base64'))
  app.quit()
})
