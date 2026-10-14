/** Which screen the island lives on. */

export type DisplayInfo = {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
}

/** 'primary', 'cursor' (the display with the pointer), or one display's key. */
export type DisplayPref = string

/** A display's key: its name, size and place, so it's found again after a replug. Pure. */
export function displayKey(d: DisplayInfo): string {
  return `${d.label || 'Display'}|${d.bounds.width}x${d.bounds.height}|${d.bounds.x},${d.bounds.y}`
}

/** "DELL U2720Q · 2560×1440", or "Display 2 · 1920×1080" when it has no name. Pure. */
export function displayName(d: DisplayInfo, i: number): string {
  return `${d.label || `Display ${i + 1}`} · ${d.bounds.width}×${d.bounds.height}${d.primary ? ' (main)' : ''}`
}

/**
 * The display to use: the one you picked (or, if it's gone, one with the same
 * name and size), the one with the pointer, or the main one. Pure.
 */
export function pickDisplay(all: DisplayInfo[], pref: DisplayPref, cursorId?: number): DisplayInfo | undefined {
  const primary = all.find((d) => d.primary) ?? all[0]
  if (pref === 'cursor') return all.find((d) => d.id === cursorId) ?? primary
  if (pref === 'primary' || !pref) return primary
  const exact = all.find((d) => displayKey(d) === pref)
  if (exact) return exact
  const [label, size] = pref.split('|')
  return all.find((d) => (d.label || 'Display') === label && `${d.bounds.width}x${d.bounds.height}` === size) ?? primary
}

/** A saved choice, checked. Pure. */
export function parseDisplayPref(raw: unknown): DisplayPref {
  return typeof raw === 'string' && raw.length <= 200 && (raw === 'primary' || raw === 'cursor' || raw.split('|').length === 3) ? raw : 'primary'
}
