import { createContext, createElement, useContext, type ReactNode } from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import { DARK, paletteFor, type Palette, type ThemePref } from './palette'

export { DARK, LIGHT, paletteFor, type IsoPalette, type Palette, type ThemePref } from './palette'

const ThemeContext = createContext<Palette>(DARK)

/** The colours in use now. */
export const useTheme = (): Palette => useContext(ThemeContext)

/** Light, dark or the phone's own, for everything inside. */
export function ThemeProvider({ pref, children }: { pref: ThemePref; children: ReactNode }) {
  const system = useColorScheme()
  return createElement(ThemeContext.Provider, { value: paletteFor(pref, system) }, children)
}

/**
 * Styles that follow the theme: `const useS = themed((C) => ({ … }))` beside
 * a component, `const s = useS()` inside it. Made once per palette.
 */
export function themed<S extends Parameters<typeof StyleSheet.create>[0]>(make: (C: Palette) => S & Parameters<typeof StyleSheet.create>[0]): () => Readonly<S> {
  const made = new Map<Palette, Readonly<S>>()
  return function useThemed(): Readonly<S> {
    const C = useTheme()
    const known = made.get(C)
    if (known) return known
    const styles = StyleSheet.create(make(C)) as Readonly<S>
    made.set(C, styles)
    return styles
  }
}

/** A file type's colour on its tile (as on the island). */
export function kindColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return '#bf5af2'
  if (['mp4', 'mov', 'mkv', 'webm', '3gp'].includes(ext)) return '#ff375f'
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac'].includes(ext)) return '#ff9f0a'
  if (ext === 'pdf') return '#ff453a'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '#0a84ff'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '#30d158'
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return '#ff9f0a'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'apk'].includes(ext)) return '#a2845e'
  return '#8e8e93'
}

export const extOf = (name: string) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 5) : 'FILE'
}
