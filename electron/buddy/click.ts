// @ts-expect-error - x11 ships no types
import x11 from 'x11'

/**
 * Click at a spot on the screen (X11 device pixels), as the mouse would:
 * move there, press and let go. Only ever after you said yes on the island.
 */
export function clickAt(x: number, y: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.env.DISPLAY) return reject(new Error('Clicking for you needs X11 (Ubuntu on Xorg).'))
    const timer = setTimeout(() => reject(new Error('X11 timed out')), 3000)
    x11.createClient((err: unknown, display: any) => {
      if (err || !display) {
        clearTimeout(timer)
        return reject(err ?? new Error('no display'))
      }
      const X = display.client
      const root = display.screen[0].root
      X.on('error', () => {})
      X.require('xtest', (e: unknown, xt: any) => {
        clearTimeout(timer)
        if (e || !xt) {
          X.terminate()
          return reject(new Error('XTest isn’t available'))
        }
        const px = Math.round(x)
        const py = Math.round(y)
        xt.FakeInput(xt.MotionNotify, 0, 0, root, px, py)
        xt.FakeInput(xt.ButtonPress, 1, 0, root, px, py)
        xt.FakeInput(xt.ButtonRelease, 1, 0, root, px, py)
        // Make sure it was sent before letting go of the connection.
        X.GetInputFocus(() => {
          setTimeout(() => X.terminate(), 50)
          resolve()
        })
      })
    })
  })
}
