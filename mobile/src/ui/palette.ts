/**
 * The app's two palettes and how one is chosen (no React here, so it can be
 * tested on its own). The look: a calm grey page, plain white cards with a
 * soft shadow, near-black words and one grey, and a single accent (the orb's
 * colour, coral unless you changed it) for what's chosen, what to do and the
 * numbers drawn.
 */

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
  /** The strongest button (the accent) and its label. */
  primary: string
  onPrimary: string
  /** The one colour: the chosen tab, what to do, the numbers drawn. Follows the orb. */
  accent: string
  accentSoft: string
  /** Two lighter steps of it, for charts. */
  accentMid: string
  accentPale: string
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
  /** Cards lift a little off the page: a wide, faint shadow. */
  shadow: { boxShadow: string }
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
  bg: '#131211',
  card: '#1e1d1b',
  card2: '#282623',
  line: 'rgba(255,245,235,0.075)',
  lineStrong: 'rgba(255,245,235,0.14)',
  text: '#f4f1ee',
  text2: '#a39d97',
  text3: '#736d68',
  fill: 'rgba(255,245,235,0.075)',
  fillPressed: 'rgba(255,245,235,0.045)',
  primary: '#fa7455',
  onPrimary: '#ffffff',
  accent: '#fa7455',
  accentSoft: 'rgba(250,116,85,0.2)',
  accentMid: '#b9573f',
  accentPale: '#4a2a22',
  green: '#5fd058',
  red: '#ff6b5e',
  orange: '#ffa23a',
  yellow: '#ffd60a',
  blue: '#5aa9ff',
  violet: '#c58af9',
  cyan: '#64d2ff',
  pink: '#ff6b8e',
  bar: '#2a2825',
  scrim: 'rgba(0,0,0,0.55)',
  statusBar: 'light',
  shadow: { boxShadow: '0 10px 30px rgba(0,0,0,0.35)' },
  iso: {
    paper: '#1e1d1b',
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
  bg: '#f1f1f1',
  card: '#ffffff',
  card2: '#f4f4f4',
  line: 'rgba(29,29,29,0.075)',
  lineStrong: 'rgba(29,29,29,0.14)',
  text: '#1d1d1d',
  text2: '#7f7f7f',
  text3: '#a8a8a8',
  fill: 'rgba(29,29,29,0.055)',
  fillPressed: 'rgba(29,29,29,0.035)',
  primary: '#fa7455',
  onPrimary: '#ffffff',
  accent: '#fa7455',
  accentSoft: 'rgba(250,116,85,0.14)',
  accentMid: '#fb9479',
  accentPale: '#f6d9d1',
  green: '#3fb44a',
  red: '#e5484d',
  orange: '#e8890c',
  yellow: '#d9a400',
  blue: '#2f7de1',
  violet: '#9b4dca',
  cyan: '#1a9bd7',
  pink: '#e8325a',
  bar: '#ffffff',
  scrim: 'rgba(0,0,0,0.32)',
  statusBar: 'dark',
  shadow: { boxShadow: '0 10px 30px rgba(30,20,10,0.06), 0 1px 2px rgba(30,20,10,0.04)' },
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

// ---- The accent ----

/** The accent when the orb is its own colour. */
export const CORAL = '#fa7455'
/** Orbit's own colour on the island: the same coral, a shade lighter (as it's drawn, not as it's written on). */
const ORBIT = '#ff8a65'

const HEX = /^#[0-9a-f]{6}$/i

/** A colour as the island sends it ("#rrggbb"), or null. Pure. */
export function cleanColor(c: unknown): string | null {
  return typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : null
}

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const hexOf = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`

/** One colour mixed into another: 0 is all `a`, 1 is all `b`. Pure. */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a)
  const y = rgbOf(b)
  return hexOf(x.map((v, i) => v + (y[i] - v) * t))
}

/** How light a colour is to the eye, 0 (black) to 1 (white). Pure. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * A colour kept where it can be seen on the theme's cards and written on:
 * one too pale for a light page is deepened, one too dark for a dark page
 * is lifted. Pure.
 */
export function seen(hex: string, dark: boolean): string {
  let c = hex
  for (let i = 0; i < 8; i++) {
    const l = luminance(c)
    if (dark && l < 0.16) c = mix(c, '#ffffff', 0.18)
    else if (!dark && l > 0.62) c = mix(c, '#000000', 0.12)
    else break
  }
  return c
}

const tinted = new Map<string, Palette>()

/**
 * A palette in the orb's colour: the accent, its two lighter steps, and the
 * strongest button. Coral for Orbit's own colour (and when nothing is known
 * yet). The same palette object for the same colour, so styles are made once.
 * Pure.
 */
export function withAccent(base: Palette, color: string | null | undefined): Palette {
  const c = cleanColor(color)
  if (!c || c === ORBIT || c === CORAL) return base
  const key = `${base.dark ? 'd' : 'l'}${c}`
  const known = tinted.get(key)
  if (known) return known
  const accent = seen(c, base.dark)
  const [r, g, b] = rgbOf(accent)
  const ground = base.dark ? base.bg : '#ffffff'
  const made: Palette = {
    ...base,
    accent,
    primary: accent,
    onPrimary: luminance(accent) > 0.4 ? '#1d1d1d' : '#ffffff',
    accentSoft: `rgba(${r},${g},${b},${base.dark ? 0.2 : 0.14})`,
    accentMid: mix(accent, ground, 0.27),
    accentPale: mix(accent, ground, 0.76),
  }
  tinted.set(key, made)
  return made
}
