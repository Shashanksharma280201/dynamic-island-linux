import { useEffect, useRef } from 'react'

/**
 * The island is normally unfocusable (it must never steal focus from the app
 * you're using). Text fields call `take()` when clicked to get keyboard focus
 * for the island, and `release()` when done; it is released on unmount too.
 */
export function useKeyboard(onTyping: (on: boolean) => void) {
  const active = useRef(false)
  const take = () => {
    if (!active.current) {
      active.current = true
      onTyping(true)
    }
    // Ask every time: focus may have moved to another app since the last click.
    window.island.setFocus(true)
  }
  const release = () => {
    if (!active.current) return
    active.current = false
    onTyping(false)
    window.island.setFocus(false)
  }
  useEffect(() => {
    // You clicked into another app: stop "typing" so the island can close.
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('blur', release)
      release()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { take, release }
}
