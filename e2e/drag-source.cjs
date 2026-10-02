// A tiny app to drag a file out of, like a file manager, for testing drops on
// the island with real drag and drop (XDND). Run with Electron; the file is
// DRAG_FILE. Prints "ready" once it can be dragged from.
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
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  })
  const html = `<body style="margin:0;background:#e5e5ea;font:18px sans-serif">
    <div id="f" draggable="true" style="width:240px;height:120px;display:flex;align-items:center;justify-content:center">${path.basename(file)}</div>
    <script>
      document.getElementById('f').addEventListener('dragstart', (e) => { e.preventDefault(); require('electron').ipcRenderer.send('drag') })
    </script></body>`
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  ipcMain.on('drag', (e) => e.sender.startDrag({ file, icon: icon() }))
  win.webContents.on('did-finish-load', () => console.log('ready'))
})
app.on('window-all-closed', () => app.quit())
