import { useEffect, useState } from 'react'
import { DEFAULT_SHORTCUTS, shortcutLabel, type ShortcutId, type Shortcuts } from '@shared/shortcuts'

const MAC = navigator.userAgent.includes('Macintosh')

// One copy for the whole island, fed by the main process.
let current: Shortcuts = DEFAULT_SHORTCUTS
const listeners = new Set<(k: Shortcuts) => void>()
window.island?.onKeys?.((k) => {
  current = k
  for (const l of listeners) l(k)
})

/** The global shortcuts as they're set now. */
export function useShortcuts(): Shortcuts {
  const [keys, setKeys] = useState(current)
  useEffect(() => {
    listeners.add(setKeys)
    setKeys(current)
    return () => void listeners.delete(setKeys)
  }, [])
  return keys
}

/** "Ctrl+Alt+Y" for a shortcut as it's set now. */
export function useShortcutLabel(id: ShortcutId): string {
  return shortcutLabel(useShortcuts()[id], MAC)
}
