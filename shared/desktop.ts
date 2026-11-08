/** Ubuntu in the island's look, and the command bar (Settings › Desktop). */
export type DesktopConfig = {
  /** The look is applied now (and `original` holds what to put back). */
  applied: boolean
  /** The Dock at the bottom, like macOS's. */
  dock: boolean
  /** Window buttons on the left. */
  buttonsLeft: boolean
  /** What was there before, "schema key" -> value, for Undo. */
  original: Record<string, string>
  /** The command bar's shortcut is on. */
  commandBar: boolean
  /** Blur my Shell, when it's installed. */
  blur: boolean
  /** Just Perfection hides the top bar's clock (the island has the top centre). */
  hideClock: boolean
}

export const DESKTOP_DEFAULTS: DesktopConfig = { applied: false, dock: true, buttonsLeft: false, original: {}, commandBar: true, blur: true, hideClock: false }

export function parseDesktopConfig(raw: any): DesktopConfig {
  const r = raw && typeof raw === 'object' ? raw : {}
  const original: Record<string, string> = {}
  if (r.original && typeof r.original === 'object')
    for (const [k, v] of Object.entries(r.original)) if (typeof v === 'string' && /^[\w.-]+ [\w-]+$/.test(k)) original[k] = v
  return {
    applied: r.applied === true && Object.keys(original).length > 0,
    dock: typeof r.dock === 'boolean' ? r.dock : DESKTOP_DEFAULTS.dock,
    buttonsLeft: r.buttonsLeft === true,
    original,
    commandBar: typeof r.commandBar === 'boolean' ? r.commandBar : DESKTOP_DEFAULTS.commandBar,
    blur: typeof r.blur === 'boolean' ? r.blur : DESKTOP_DEFAULTS.blur,
    hideClock: r.hideClock === true,
  }
}

export type DesktopView = {
  applied: boolean
  dock: boolean
  buttonsLeft: boolean
  /** What the last apply changed, and what this desktop couldn't. */
  last: { changed: string[]; skipped: string[] } | null
  commandBar: boolean
  commandKey: string
  /** gsettings works here (GNOME). */
  supported: boolean
  /** GNOME extensions that finish the look: installed or not, and whether it's used. */
  extensions: ExtensionView[]
  blur: boolean
  hideClock: boolean
}

export type ExtensionId = 'blur' | 'perfection'

export type ExtensionView = {
  id: ExtensionId
  name: string
  what: string
  installed: boolean
  /** Installed by the island in this session: GNOME starts it after you log in again. */
  justInstalled: boolean
  /** Downloading or installing now. */
  busy: boolean
  error: string | null
}

/** The GNOME extensions the look uses (from extensions.gnome.org). */
export const EXTENSIONS: { id: ExtensionId; uuid: string; name: string; what: string; schema: string }[] = [
  { id: 'blur', uuid: 'blur-my-shell@aunetx', name: 'Blur my Shell', what: 'Blurs the top bar, the overview and the Dock over what’s behind them, like macOS’s glass.', schema: 'org.gnome.shell.extensions.blur-my-shell' },
  { id: 'perfection', uuid: 'just-perfection-desktop@just-perfection', name: 'Just Perfection', what: 'Hides the top bar’s clock, so the island has the top centre to itself.', schema: 'org.gnome.shell.extensions.just-perfection' },
]

/** A GSettings string list ("['a', 'b']", "@as []") as an array. Pure. */
export function parseStrv(v: string): string[] {
  const t = v.trim().replace(/^@as\s*/, '')
  if (!t.startsWith('[') || !t.endsWith(']')) return []
  const out: string[] = []
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g
  for (let m = re.exec(t); m; m = re.exec(t)) out.push((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
  return out
}

/** An array as a GSettings string list. Pure. */
export function strv(list: string[]): string {
  return `[${list.map((x) => `'${x.replace(/(['\\])/g, '\\$1')}'`).join(', ')}]`
}

/** Is this "schema key" one of the extensions' (or which extensions GNOME runs)? Pure. */
export function extensionKey(id: string): boolean {
  return id.startsWith('org.gnome.shell ') || EXTENSIONS.some((e) => id.startsWith(`${e.schema} `) || id.startsWith(`${e.schema}.`))
}
