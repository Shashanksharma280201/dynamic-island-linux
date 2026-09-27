// Move the real X pointer (XTest) to x,y in root coordinates.
const x11 = require('x11')
const [x, y] = process.argv.slice(2).map(Number)
x11.createClient((err, display) => {
  if (err) throw err
  const X = display.client
  X.require('xtest', (err, xt) => {
    if (err) throw err
    xt.FakeInput(xt.MotionNotify, 0, 0, display.screen[0].root, x, y)
    X.QueryPointer(display.screen[0].root, (e, p) => {
      console.log('pointer', p.rootX, p.rootY)
      X.terminate()
    })
  })
})
