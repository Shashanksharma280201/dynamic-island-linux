// A stand-in terminal for the sessions e2e test: it opens an X window owned by
// its own process (as a terminal emulator would), prints the window id, and
// runs a "claude" child that fires the real session hook, through a shell as
// Claude Code does, for every hook input written to stdin (one JSON a line).
//   node fake-terminal.cjs          the terminal
//   node fake-terminal.cjs claude   the agent inside it (started by the terminal)
const { spawn } = require('child_process')
const path = require('path')
const readline = require('readline')

const HOOK = path.resolve(__dirname, '../hook/claude-island-hook-events.cjs')

if (process.argv[2] === 'claude') {
  // Hooks run one after another, in order, like Claude Code's.
  let chain = Promise.resolve()
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    chain = chain.then(
      () =>
        new Promise((resolve) => {
          const p = spawn('sh', ['-c', `node ${JSON.stringify(HOOK)}`], { stdio: ['pipe', 'ignore', 'inherit'] })
          p.on('close', () => {
            console.log('sent')
            resolve()
          })
          p.stdin.end(line)
        }),
    )
  })
  return
}

const x11 = require('x11')
x11.createClient((err, display) => {
  if (err) throw err
  const X = display.client
  const root = display.screen[0].root
  const wid = X.AllocID()
  X.CreateWindow(wid, root, 40, 600, 480, 300, 0, 0, 0, 0, { backgroundPixel: 0x1e1e1e })
  X.InternAtom(false, '_NET_WM_PID', (e, atom) => {
    const pid = Buffer.alloc(4)
    pid.writeUInt32LE(process.pid)
    X.ChangeProperty(0, wid, atom, 6 /* CARDINAL */, 32, pid)
    X.MapWindow(wid)
    const claude = spawn(process.execPath, [__filename, 'claude'], { stdio: ['pipe', 'inherit', 'inherit'], env: process.env })
    console.log(`window ${wid} claude ${claude.pid}`)
    process.stdin.pipe(claude.stdin)
    process.stdin.on('end', () => {
      claude.stdin.end()
      claude.on('close', () => process.exit(0))
    })
  })
})
