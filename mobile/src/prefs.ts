import { File, Paths } from 'expo-file-system'

/** The app's own settings, kept on the phone. */
export type Prefs = {
  /** Keep the link to the computer alive in the background (an ongoing notification). */
  background: boolean
  /** Show the computer's notifications on this phone too. */
  computerNotes: boolean
}

const DEFAULTS: Prefs = { background: true, computerNotes: false }

export function loadPrefs(): Prefs {
  try {
    const f = new File(Paths.document, 'prefs.json')
    if (!f.exists) return { ...DEFAULTS }
    const p = JSON.parse(f.textSync())
    return { background: typeof p.background === 'boolean' ? p.background : DEFAULTS.background, computerNotes: typeof p.computerNotes === 'boolean' ? p.computerNotes : DEFAULTS.computerNotes }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePrefs(p: Prefs): void {
  new File(Paths.document, 'prefs.json').write(JSON.stringify(p))
}
