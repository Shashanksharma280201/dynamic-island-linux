import { File, Paths } from 'expo-file-system'

export { DEFAULT_PREFS, cleanPrefs, type Prefs } from './prefsShape'
import { DEFAULT_PREFS, cleanPrefs, type Prefs } from './prefsShape'

export function loadPrefs(): Prefs {
  try {
    const f = new File(Paths.document, 'prefs.json')
    if (!f.exists) return { ...DEFAULT_PREFS }
    return cleanPrefs(JSON.parse(f.textSync()))
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(p: Prefs): void {
  new File(Paths.document, 'prefs.json').write(JSON.stringify(p))
}
