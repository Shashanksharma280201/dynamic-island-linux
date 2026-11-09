import { execFile } from 'node:child_process'
import { EXTENSIONS, parseStrv, strv } from '@shared/desktop'

/**
 * Ubuntu in the island's look, in one click and back in one click: light or
 * dark and the accent (Yaru's own accent themes on 22.04), the Dock at the
 * bottom like macOS's, and window buttons on the left. Only gsettings, no
 * root; what was there before is kept so Undo puts it back exactly.
 */

export type LookSetting = {
  schema: string
  key: string
  value: string
  /** What it does, in words ('' to leave it out of the list). */
  what: string
  /** An extension's own schemas (they aren't in the system's list). */
  schemadir?: string
  /** For a string list: add these, or take these out, of what's there now. */
  addToList?: string[]
  removeFromList?: string[]
}

/** Yaru's accent for the island's (Ubuntu 22.04 has these). Pure. */
export function yaruAccent(accent: string): string {
  const map: Record<string, string> = { blue: 'blue', purple: 'purple', pink: 'magenta', red: 'red', orange: '', yellow: 'olive', green: 'sage', graphite: 'bark' }
  return map[accent] ?? 'blue'
}

/** The settings that make Ubuntu look like the island. Pure. */
export function lookSettings(o: { accent: string; dark: boolean; dock: boolean; buttonsLeft: boolean; extensions?: ExtensionFolders }): LookSetting[] {
  const a = yaruAccent(o.accent)
  const theme = `Yaru${a ? `-${a}` : ''}${o.dark ? '-dark' : ''}`
  const q = (s: string) => `'${s}'`
  const out: LookSetting[] = [
    { schema: 'org.gnome.desktop.interface', key: 'color-scheme', value: q(o.dark ? 'prefer-dark' : 'default'), what: o.dark ? 'Dark style' : 'Light style' },
    { schema: 'org.gnome.desktop.interface', key: 'gtk-theme', value: q(theme), what: `Apps in ${theme}` },
    { schema: 'org.gnome.desktop.interface', key: 'icon-theme', value: q(`Yaru${a ? `-${a}` : ''}`), what: 'Icons to match' },
  ]
  if (o.dock) {
    const d = 'org.gnome.shell.extensions.dash-to-dock'
    out.push(
      { schema: d, key: 'dock-position', value: q('BOTTOM'), what: 'The Dock at the bottom' },
      { schema: d, key: 'extend-height', value: 'false', what: 'Only as wide as its icons' },
      { schema: d, key: 'dock-fixed', value: 'false', what: 'Out of the way of windows' },
      { schema: d, key: 'intellihide', value: 'true', what: 'Hides when a window needs the room' },
      { schema: d, key: 'dash-max-icon-size', value: '44', what: 'Icons a little bigger' },
    )
  }
  if (o.buttonsLeft) out.push({ schema: 'org.gnome.desktop.wm.preferences', key: 'button-layout', value: q('close,minimize,maximize:'), what: 'Window buttons on the left' })
  return [...out, ...extensionSettings(o.extensions ?? {})]
}

/** The extensions that are installed and wanted: each its folder, or null. */
export type ExtensionFolders = { bar?: string | null; blur?: string | null; clock?: string | null }

/** Turn on the extensions that are installed and wanted, hide the top bar (Mac-style) and the clock. Pure. */
export function extensionSettings(o: ExtensionFolders): LookSetting[] {
  const bar = EXTENSIONS.find((e) => e.id === 'hidebar')!
  const blur = EXTENSIONS.find((e) => e.id === 'blur')!
  const perf = EXTENSIONS.find((e) => e.id === 'perfection')!
  const on = [o.bar ? bar : null, o.blur ? blur : null, o.clock ? perf : null].filter((e): e is (typeof EXTENSIONS)[number] => !!e)
  if (!on.length) return []
  const uuids = on.map((e) => e.uuid)
  const out: LookSetting[] = [
    { schema: 'org.gnome.shell', key: 'disable-user-extensions', value: 'false', what: '' },
    { schema: 'org.gnome.shell', key: 'disabled-extensions', value: '', removeFromList: uuids, what: '' },
    { schema: 'org.gnome.shell', key: 'enabled-extensions', value: '', addToList: uuids, what: `${on.map((e) => e.name).join(' and ')} on` },
  ]
  if (o.bar) {
    // Like a Mac's menu bar set to hide: always hidden (not just when a window
    // is under it), back while the pointer pushes against the top edge or in
    // the overview.
    const s = { schema: bar.schema, schemadir: `${o.bar}/schemas` }
    out.push(
      { ...s, key: 'mouse-sensitive', value: 'true', what: 'The top bar hidden until you push the pointer against the top edge' },
      { ...s, key: 'enable-intellihide', value: 'false', what: '' },
      { ...s, key: 'show-in-overview', value: 'true', what: '' },
      { ...s, key: 'mouse-triggers-overview', value: 'false', what: '' },
    )
  }
  if (o.clock) out.push({ schema: perf.schema, key: 'clock-menu', value: 'false', schemadir: `${o.clock}/schemas`, what: 'The top bar’s clock hidden' })
  return out
}

type Run = (args: string[]) => Promise<{ ok: boolean; out: string }>

export class DesktopLook {
  constructor(
    private gsettings = process.env.DI_GSETTINGS || 'gsettings',
    private runner?: Run,
  ) {}

  private run(args: string[], schemadir?: string): Promise<{ ok: boolean; out: string }> {
    const a = schemadir ? ['--schemadir', schemadir, ...args] : args
    if (this.runner) return this.runner(a)
    return new Promise((resolve) => execFile(this.gsettings, a, { timeout: 5000 }, (e, out) => resolve({ ok: !e, out: String(out).trim() })))
  }

  /** Which schemas this desktop has (the Dock's needs Ubuntu Dock; an extension's, the extension). */
  private async have(settings: LookSetting[]): Promise<Set<string>> {
    const r = await this.run(['list-schemas'])
    const all = new Set(r.out.split('\n').map((s) => s.trim()))
    const out = new Set<string>()
    for (const s of settings) {
      if (out.has(s.schema)) continue
      if (s.schemadir ? (await this.run(['list-keys', s.schema], s.schemadir)).ok : all.has(s.schema)) out.add(s.schema)
    }
    return out
  }

  /** Apply the look; returns what was there before (to undo), and what was changed. */
  async apply(settings: LookSetting[], before: Record<string, string> = {}): Promise<{ original: Record<string, string>; changed: string[]; skipped: string[] }> {
    const have = await this.have(settings)
    const original: Record<string, string> = { ...before }
    const changed: string[] = []
    const skipped: string[] = []
    for (const s of settings) {
      if (!have.has(s.schema)) {
        if (s.what) skipped.push(s.what)
        continue
      }
      const id = `${s.schema} ${s.key}`
      const cur = await this.run(['get', s.schema, s.key], s.schemadir)
      // Keep the first original: applying again (another accent) mustn't lose it.
      if (!(id in original) && cur.ok) original[id] = cur.out
      let value = s.value
      if (s.addToList || s.removeFromList) {
        const list = cur.ok ? parseStrv(cur.out) : []
        const next = [...list.filter((x) => !s.removeFromList?.includes(x)), ...(s.addToList ?? []).filter((x) => !list.includes(x))]
        value = strv(next)
      }
      const r = await this.run(['set', s.schema, s.key, value], s.schemadir)
      if (!s.what) continue
      if (r.ok) changed.push(s.what)
      else skipped.push(s.what)
    }
    return { original, changed, skipped }
  }

  /** Put back what was there before (an extension's keys need its schema folder: `dirs`, by schema). */
  async undo(original: Record<string, string>, dirs: Record<string, string> = {}): Promise<number> {
    let n = 0
    for (const [id, value] of Object.entries(original)) {
      const [schema, key] = id.split(' ')
      if ((await this.run(['set', schema, key, value], dirs[schema])).ok) n++
    }
    return n
  }
}
