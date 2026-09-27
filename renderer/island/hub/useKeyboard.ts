import { useEffect, useRef } from 'react'

/**
 * The island is normally unfocusable (it must never steal focus from the app
 * you're using). Text fields call `take()` when clicked to get keyboard focus
 * for the island, and `release()` when done; it is released on unmount too.
 */
export function useKeyboard(onTyping: (on: boolean) => void) {
  const active = useRef(false)
  const take = () => {
    if (active.current) return
    active.current = true
    onTyping(true)
    window.island.setFocus(true)
  }
  const release = () => {
    if (!active.current) return
    active.current = false
    onTyping(false)
    window.island.setFocus(false)
  }
  useEffect(() => release, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { take, release }
}
