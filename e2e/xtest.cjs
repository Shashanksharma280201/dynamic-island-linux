// Drive the real X pointer (XTest) in root coordinates:
//   node xtest.cjs X Y            move
//   node xtest.cjs drag X1 Y1 X2 Y2 [steps]   press at 1, move in steps, release at 2
//   node xtest.cjs dnd X1 Y1 X2 Y2   drag and drop between apps (XDND): slower, hovers before letting go
//   node xtest.cjs key ctrl+i     press and release a key combo (real X key events)
//   node xtest.cjs type "hello"   type lowercase letters, digits and spaces (real X key events)
//   node xtest.cjs click X Y      move there and click the left button
//   node xtest.cjs focus          print the window that has keyboard focus
//   node xtest.cjs steal          another window takes keyboard focus (like clicking into an app)
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
    } else if (args[0] === 'dnd') {
      // Press, move past the drag threshold so the source starts a drag, then
      // travel in small steps (each one an XDND position), hover, let go.
      const [x1, y1, x2, y2] = args.slice(1).map(Number)
      move(x1, y1)
      await sleep(300)
      xt.FakeInput(xt.ButtonPress, 1, 0, root, 0, 0)
      await sleep(100)
      for (let i = 1; i <= 6; i++) {
        move(x1 + i * 4, y1 + i * 2)
        await sleep(40)
      }
      await sleep(400)
      const steps = 40
      for (let i = 1; i <= steps; i++) {
        move(x1 + 24 + ((x2 - x1 - 24) * i) / steps, y1 + 12 + ((y2 - y1 - 12) * i) / steps)
        await sleep(30)
      }
      for (let i = 0; i < 10; i++) {
        move(x2 + (i % 2 ? 2 : -2), y2)
        await sleep(80)
      }
      await sleep(300)
      xt.FakeInput(xt.ButtonRelease, 1, 0, root, 0, 0)
      await sleep(500)
    } else if (args[0] === 'steal') {
      // Another app takes the keyboard: map a small window and focus it.
      const wid = X.AllocID()
      X.CreateWindow(wid, root, 0, 0, 200, 100, 0, 0, 0, 0, { backgroundPixel: 0xdddddd })
      X.MapWindow(wid)
      await sleep(200)
      X.SetInputFocus(wid, 1)
      await sleep(1500)
      X.DestroyWindow(wid)
      await sleep(100)
    } else if (args[0] === 'focus') {
      X.GetInputFocus((e, f) => {
        console.log(String(f.focus))
        X.terminate()
      })
      return
    } else if (args[0] === 'click') {
      move(Number(args[1]), Number(args[2]))
      await sleep(300)
      xt.FakeInput(xt.ButtonPress, 1, 0, root, 0, 0)
      await sleep(50)
      xt.FakeInput(xt.ButtonRelease, 1, 0, root, 0, 0)
      await sleep(100)
    } else if (args[0] === 'type') {
      const min = display.min_keycode
      const max = display.max_keycode
      const map = await new Promise((res, rej) =>
        X.GetKeyboardMapping(min, max - min, (e, m) => (e ? rej(e) : res(m))),
      )
      for (const ch of args[1]) {
        const i = map.findIndex((row) => row[0] === ch.charCodeAt(0))
        if (i < 0) throw new Error('no keycode for ' + ch)
        xt.FakeInput(xt.KeyPress, i + min, 0, root, 0, 0)
        await sleep(15)
        xt.FakeInput(xt.KeyRelease, i + min, 0, root, 0, 0)
        await sleep(15)
      }
      await sleep(100)
    } else if (args[0] === 'key') {
      // keysyms: letters are their ASCII codes; Control_L = 0xffe3
      const parts = args[1].toLowerCase().split('+')
      const named = { ctrl: 0xffe3, shift: 0xffe1, alt: 0xffe9, escape: 0xff1b, enter: 0xff0d }
      const syms = parts.map((p) => named[p] ?? p.charCodeAt(0))
      const min = display.min_keycode
      const max = display.max_keycode
      const map = await new Promise((res, rej) =>
        X.GetKeyboardMapping(min, max - min, (e, m) => (e ? rej(e) : res(m))),
      )
      const codes = syms.map((sym) => {
        const i = map.findIndex((row) => row.includes(sym))
        if (i < 0) throw new Error('no keycode for keysym ' + sym)
        return i + min
      })
      for (const c of codes) xt.FakeInput(xt.KeyPress, c, 0, root, 0, 0)
      await sleep(50)
      for (const c of [...codes].reverse()) xt.FakeInput(xt.KeyRelease, c, 0, root, 0, 0)
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
