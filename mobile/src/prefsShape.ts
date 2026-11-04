import type { ThemePref } from './ui/palette'

/** The app's own settings, kept on the phone. */
export type Prefs = {
  /** Keep the link to the computer alive in the background (an ongoing notification). */
  background: boolean
  /** Show the computer's notifications on this phone too. */
  computerNotes: boolean
  /** Light, dark, or as the phone is set. */
  theme: ThemePref
}

export const DEFAULT_PREFS: Prefs = { background: true, computerNotes: false, theme: 'system' }

/** Whatever was saved, with anything missing or odd set back to its default. Pure. */
export function cleanPrefs(p: any): Prefs {
  const d = DEFAULT_PREFS
  return {
    background: typeof p?.background === 'boolean' ? p.background : d.background,
    computerNotes: typeof p?.computerNotes === 'boolean' ? p.computerNotes : d.computerNotes,
    theme: p?.theme === 'light' || p?.theme === 'dark' || p?.theme === 'system' ? p.theme : d.theme,
  }
}
