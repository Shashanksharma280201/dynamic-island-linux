// Drive the real X pointer (XTest) in root coordinates:
//   node xtest.cjs X Y            move
//   node xtest.cjs drag X1 Y1 X2 Y2 [steps]   press at 1, move in steps, release at 2
//   node xtest.cjs child X Y      move, then print the top-level window that
//                                 receives input there (honours input shapes)
const x11 = require('x11')
const args = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

x11.createClient((err, display) => {
  if (err) throw err
  const X = display.client
  const root = display.screen[0].root
  X.require('xtest', async (err, xt) => {
    if (err) throw err
    const move = (x, y) => xt.FakeInput(xt.MotionNotify, 0, 0, root, Math.round(x), Math.round(y))
    if (args[0] === 'drag') {
      const [x1, y1, x2, y2, steps = 20] = args.slice(1).map(Number)
      move(x1, y1)
      await sleep(300) // let the island's cursor loop make it interactive
      xt.FakeInput(xt.ButtonPress, 1, 0, root, 0, 0)
      await sleep(50)
      for (let i = 1; i <= steps; i++) {
        move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps)
        await sleep(25)
      }
      await sleep(100)
      xt.FakeInput(xt.ButtonRelease, 1, 0, root, 0, 0)
      await sleep(100)
    } else if (args[0] === 'child') {
      move(Number(args[1]), Number(args[2]))
      await sleep(100)
    } else {
      move(Number(args[0]), Number(args[1]))
    }
    X.QueryPointer(root, (e, p) => {
      if (args[0] === 'child') console.log(String(p.child))
      else console.log('pointer', p.rootX, p.rootY)
      X.terminate()
    })
  })
})
