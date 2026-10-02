// The desktop behind the island in the tour video: one full-screen window
// showing desktop.html, which ignores the mouse so drags never move it.
const { app, BrowserWindow, screen } = require('electron')
const path = require('path')
app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().bounds
  const w = new BrowserWindow({ x: 0, y: 0, width, height, frame: false, type: 'desktop', focusable: false, resizable: false, movable: false, backgroundColor: '#0b1020' })
  w.setIgnoreMouseEvents(true)
  w.loadFile(path.join(__dirname, 'desktop.html'))
})
