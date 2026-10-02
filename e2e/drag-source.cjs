// A tiny app to drag a file out of, like a file manager, for testing drops on
// the island with real drag and drop (XDND). Run with Electron; the file is
// DRAG_FILE. Prints "ready" once its window is on screen, then what happens.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const path = require('path')

const file = process.env.DRAG_FILE
// A 16 x 16 square to show under the pointer (BGRA).
const icon = () => nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 0xc0), { width: 16, height: 16 })

app.whenReady().then(() => {
  const win = new BrowserWindow({
    x: 40,
    y: 400,
    width: 240,
    height: 120,
    frame: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  })
  const html = `<body style="margin:0;background:#e5e5ea;font:18px sans-serif">
    <div id="f" draggable="true" style="width:240px;height:120px;display:flex;align-items:center;justify-content:center">${path.basename(file)}</div>
    <script>
      const { ipcRenderer } = require('electron')
      const f = document.getElementById('f')
      f.addEventListener('mousedown', () => ipcRenderer.send('log', 'pressed'))
      f.addEventListener('dragstart', (e) => { e.preventDefault(); ipcRenderer.send('drag') })
    </script></body>`
  ipcMain.on('log', (_e, m) => console.log(m))
  ipcMain.on('drag', (e) => {
    console.log('dragging')
    e.sender.startDrag({ file, icon: icon() })
  })
  win.once('ready-to-show', () => {
    win.show()
    // Mapped and painted: it can take the pointer now.
    setTimeout(() => console.log(`ready ${JSON.stringify(win.getBounds())}`), 300)
  })
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
})
app.on('window-all-closed', () => app.quit())
