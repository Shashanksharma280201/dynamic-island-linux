/** The app's two palettes and how one is chosen (no React here, so it can be tested on its own). */

/** Light, dark, or as the phone is set. */
export type ThemePref = 'system' | 'light' | 'dark'

/**
 * Every colour the app uses, by what it's for. Two palettes with the same
 * names: screens never say "white", they say `text` or `primary`.
 */
export type Palette = {
  dark: boolean
  /** The page behind everything. */
  bg: string
  /** Cards and grouped lists. */
  card: string
  /** Inside a card: fields, wells, code. */
  card2: string
  /** Hairlines and card edges. */
  line: string
  lineStrong: string
  text: string
  text2: string
  text3: string
  /** A quiet button or chip, and a row being pressed. */
  fill: string
  fillPressed: string
  /** The strongest button (white on dark, ink on light) and its label. */
  primary: string
  onPrimary: string
  /** Links, switches, the chosen thing. */
  accent: string
  accentSoft: string
  green: string
  red: string
  orange: string
  yellow: string
  blue: string
  violet: string
  cyan: string
  pink: string
  /** The floating tab bar and sheets. */
  bar: string
  scrim: string
  /** The status bar's icons. */
  statusBar: 'light' | 'dark'
  /** Cards lift a little off a light page; on dark the hairline does it. */
  shadow: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number }
  /** The isometric figures (Anatomy's four-tone shading). */
  iso: IsoPalette
}

/** Anatomy's figure tones, for both themes (kit/iso.css). */
export type IsoPalette = {
  paper: string
  face: string
  top: string
  shades: [string, string, string, string]
  litTop: string
  litShade: string
  hi: string
  mid: string
  lo: string
  faint: string
  lit: string
  halo: string
  haloOpacity: number
  dot: string
  red: string
  green: string
  blue: string
  amber: string
}

export const DARK: Palette = {
  dark: true,
  bg: '#0a0a0d',
  card: '#14151a',
  card2: '#1c1d23',
  line: 'rgba(255,255,255,0.075)',
  lineStrong: 'rgba(255,255,255,0.14)',
  text: '#f4f4f6',
  text2: 'rgba(235,235,245,0.64)',
  text3: 'rgba(235,235,245,0.38)',
  fill: 'rgba(255,255,255,0.08)',
  fillPressed: 'rgba(255,255,255,0.05)',
  primary: '#ffffff',
  onPrimary: '#0a0a0c',
  accent: '#0a84ff',
  accentSoft: 'rgba(10,132,255,0.18)',
  green: '#30d158',
  red: '#ff453a',
  orange: '#ff9f0a',
  yellow: '#ffd60a',
  blue: '#0a84ff',
  violet: '#bf5af2',
  cyan: '#64d2ff',
  pink: '#ff375f',
  bar: 'rgba(22,23,28,0.97)',
  scrim: 'rgba(0,0,0,0.55)',
  statusBar: 'light',
  shadow: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  iso: {
    paper: '#14151a',
    face: '#1b1b1d',
    top: '#1e1e21',
    shades: ['#0f0f11', '#131315', '#17171a', '#1a1a1d'],
    litTop: '#2a2a2e',
    litShade: '#202023',
    hi: '#d4d4d8',
    mid: '#6a6a70',
    lo: '#3e3e44',
    faint: '#2a2a2f',
    lit: '#ffffff',
    halo: '#000000',
    haloOpacity: 0.85,
    dot: '#e6e6e6',
    red: '#ff6b6b',
    green: '#6be0a0',
    blue: '#6b9bff',
    amber: '#ffc46b',
  },
}

export const LIGHT: Palette = {
  dark: false,
  bg: '#f4f5f8',
  card: '#ffffff',
  card2: '#eceef2',
  line: 'rgba(15,15,25,0.08)',
  lineStrong: 'rgba(15,15,25,0.14)',
  text: '#111114',
  text2: 'rgba(60,60,67,0.74)',
  text3: 'rgba(60,60,67,0.46)',
  fill: 'rgba(118,118,128,0.12)',
  fillPressed: 'rgba(118,118,128,0.08)',
  primary: '#111114',
  onPrimary: '#ffffff',
  accent: '#007aff',
  accentSoft: 'rgba(0,122,255,0.12)',
  green: '#28a745',
  red: '#e5342b',
  orange: '#f08c00',
  yellow: '#e0a800',
  blue: '#007aff',
  violet: '#9b4dca',
  cyan: '#1a9bd7',
  pink: '#e8325a',
  bar: 'rgba(255,255,255,0.97)',
  scrim: 'rgba(0,0,0,0.32)',
  statusBar: 'dark',
  shadow: { shadowColor: '#14142a', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  iso: {
    paper: '#ffffff',
    face: '#ffffff',
    top: '#ffffff',
    shades: ['#dcdcd9', '#e5e5e2', '#ededea', '#f4f4f1'],
    litTop: '#ffffff',
    litShade: '#eeeeeb',
    hi: '#26262a',
    mid: '#8a8a8f',
    lo: '#b4b4b8',
    faint: '#d4d4d6',
    lit: '#000000',
    halo: '#8a8a80',
    haloOpacity: 0.32,
    dot: '#3a3a3e',
    red: '#e5484d',
    green: '#30a46c',
    blue: '#3e63dd',
    amber: '#d08700',
  },
}

/** The palette for a choice and what the phone is set to. Pure. */
export function paletteFor(pref: ThemePref, system: 'light' | 'dark' | null | undefined): Palette {
  if (pref === 'light') return LIGHT
  if (pref === 'dark') return DARK
  return system === 'light' ? LIGHT : DARK
}
