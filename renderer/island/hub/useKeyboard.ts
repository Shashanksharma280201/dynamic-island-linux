import { useEffect, useRef } from 'react'

// Fields currently holding the keyboard. The island keeps keyboard focus while
// any of them does, so moving from one field to another never drops it.
const holders = new Set<symbol>()

// Is a mouse button down inside the island right now?
let pointerDown = false
window.addEventListener('pointerdown', () => (pointerDown = true), true)
window.addEventListener('pointerup', () => (pointerDown = false), true)
window.addEventListener('blur', () => (pointerDown = false))

/**
 * Run `fn` once the current click has finished. Handing keyboard focus back
 * to another app in the middle of a click makes Chromium drop the click (so
 * e.g. pressing Stop right after typing would do nothing).
 */
function afterClick(fn: () => void): void {
  if (!pointerDown) return fn()
  let done = false
  const run = () => {
    if (done) return
    done = true
    window.removeEventListener('pointerup', up, true)
    setTimeout(fn, 0)
  }
  const up = () => run()
  window.addEventListener('pointerup', up, true)
  setTimeout(run, 1500)
}

/**
 * The island is normally unfocusable (it must never steal focus from the app
 * you're using). Text fields call `take()` when clicked to get keyboard focus
 * for the island, and `release()` when done; it is released on unmount too.
 */
export function useKeyboard(onTyping: (on: boolean) => void) {
  const id = useRef(Symbol('field')).current
  const active = useRef(false)
  const take = () => {
    if (!active.current) {
      active.current = true
      onTyping(true)
    }
    holders.add(id)
    // Ask every time: focus may have moved to another app since the last click.
    window.island.setFocus(true)
  }
  const releaseNow = () => {
    if (!active.current) return
    active.current = false
    onTyping(false)
    holders.delete(id)
    if (holders.size === 0) window.island.setFocus(false)
  }
  const release = () => afterClick(releaseNow)
  useEffect(() => {
    // You clicked into another app: stop "typing" so the island can close.
    window.addEventListener('blur', releaseNow)
    return () => {
      window.removeEventListener('blur', releaseNow)
      releaseNow()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { take, release }
}
