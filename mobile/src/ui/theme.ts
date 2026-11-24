import { createContext, createElement, useContext, type ReactNode } from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import { DARK, paletteFor, withAccent, type Palette, type ThemePref } from './palette'

export { CORAL, DARK, LIGHT, cleanColor, paletteFor, withAccent, type IsoPalette, type Palette, type ThemePref } from './palette'
export { FONT, fitSize, fontOf } from './font'

const ThemeContext = createContext<Palette>(DARK)

/** The colours in use now. */
export const useTheme = (): Palette => useContext(ThemeContext)

/** Light, dark or the phone's own, in the orb's colour, for everything inside. */
export function ThemeProvider({ pref, accent, children }: { pref: ThemePref; accent?: string | null; children: ReactNode }) {
  const system = useColorScheme()
  return createElement(ThemeContext.Provider, { value: withAccent(paletteFor(pref, system), accent) }, children)
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

export const extOf = (name: string) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 5) : 'FILE'
}
