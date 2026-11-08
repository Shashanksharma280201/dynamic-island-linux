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
}

export const DESKTOP_DEFAULTS: DesktopConfig = { applied: false, dock: true, buttonsLeft: false, original: {}, commandBar: true }

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
}
