// Start the freshly built island in the background and let it replace the
// running one (`--replace`), on Linux, macOS and Windows alike.
const { spawn } = require('node:child_process')
const path = require('node:path')
const electron = require('electron') // the path of the Electron binary, from Node
const child = spawn(electron, [path.resolve(__dirname, '..'), '--replace'], { detached: true, stdio: 'ignore', windowsHide: true })
child.unref()
console.log('Dynamic Island restarted.')
