// A stand-in app for the dictation e2e test: an X window with the WM_CLASS
// given on the command line that takes the keyboard and prints each key it
// gets ("KEY <keysym> <modifier state>"), so the test sees the paste keystroke.
//   node fake-keys-app.cjs gedit
const x11 = require('x11')
const cls = process.argv[2] || 'gedit'
x11.createClient((err, display) => {
  if (err) throw err
  const X = display.client
  const root = display.screen[0].root
  const wid = X.AllocID()
  X.CreateWindow(wid, root, 600, 300, 300, 200, 0, 0, 0, 0, { backgroundPixel: 0xeeeeee, eventMask: x11.eventMask.KeyPress | x11.eventMask.Exposure })
  const name = Buffer.from(`${cls}\0${cls}\0`, 'latin1')
  X.ChangeProperty(0, wid, 67 /* WM_CLASS */, 31 /* STRING */, 8, name)
  X.MapWindow(wid)
  const min = display.min_keycode
  X.GetKeyboardMapping(min, display.max_keycode - min, (e, map) => {
    setTimeout(() => {
      X.SetInputFocus(wid, 1)
      console.log(`window ${wid}`)
    }, 200)
    X.on('event', (ev) => {
      if (ev.name !== 'KeyPress') return
      const sym = map[ev.keycode - min]?.[0] ?? 0
      console.log(`KEY ${sym.toString(16)} ${ev.buttons}`)
    })
  })
})
