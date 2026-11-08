/** The accent colours, as macOS has them, for dark and light. */
export const ACCENTS = [
  { id: 'blue', name: 'Blue', dark: '#0a84ff', light: '#007aff' },
  { id: 'purple', name: 'Purple', dark: '#bf5af2', light: '#a550d0' },
  { id: 'pink', name: 'Pink', dark: '#ff375f', light: '#e8336b' },
  { id: 'red', name: 'Red', dark: '#ff453a', light: '#e0352b' },
  { id: 'orange', name: 'Orange', dark: '#ff9f0a', light: '#e07a00' },
  { id: 'yellow', name: 'Yellow', dark: '#ffd60a', light: '#c79a00' },
  { id: 'green', name: 'Green', dark: '#30d158', light: '#20a038' },
  { id: 'graphite', name: 'Graphite', dark: '#98989d', light: '#6e6e73' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

/** The accent by its id; blue when unknown. Pure. */
export function accentOf(id: string | undefined): (typeof ACCENTS)[number] {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]
}

/** The island in light and dark: matching the theme, or always dark like a notch. */
export type IslandTheme = 'match' | 'dark'

/** How the island looks: light or dark now, and the accent's two shades. */
export type IslandLook = { theme: 'light' | 'dark'; accent: { dark: string; light: string } }

/** The island's look from the settings and whether the desktop is dark now. Pure. */
export function islandLook(island: IslandTheme, dark: boolean, accent: string): IslandLook {
  const a = accentOf(accent)
  return { theme: island === 'dark' || dark ? 'dark' : 'light', accent: { dark: a.dark, light: a.light } }
}
