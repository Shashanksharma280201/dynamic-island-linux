import { execFile } from 'node:child_process'

/**
 * Ubuntu in the island's look, in one click and back in one click: light or
 * dark and the accent (Yaru's own accent themes on 22.04), the Dock at the
 * bottom like macOS's, and window buttons on the left. Only gsettings, no
 * root; what was there before is kept so Undo puts it back exactly.
 */

export type LookSetting = { schema: string; key: string; value: string; what: string }

/** Yaru's accent for the island's (Ubuntu 22.04 has these). Pure. */
export function yaruAccent(accent: string): string {
  const map: Record<string, string> = { blue: 'blue', purple: 'purple', pink: 'magenta', red: 'red', orange: '', yellow: 'olive', green: 'sage', graphite: 'bark' }
  return map[accent] ?? 'blue'
}

/** The settings that make Ubuntu look like the island. Pure. */
export function lookSettings(o: { accent: string; dark: boolean; dock: boolean; buttonsLeft: boolean }): LookSetting[] {
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
  return out
}

type Run = (args: string[]) => Promise<{ ok: boolean; out: string }>

export class DesktopLook {
  constructor(
    private gsettings = process.env.DI_GSETTINGS || 'gsettings',
    private runner?: Run,
  ) {}

  private run(args: string[]): Promise<{ ok: boolean; out: string }> {
    if (this.runner) return this.runner(args)
    return new Promise((resolve) => execFile(this.gsettings, args, { timeout: 5000 }, (e, out) => resolve({ ok: !e, out: String(out).trim() })))
  }

  /** Which schemas this desktop has (the Dock's needs Ubuntu Dock). */
  private async have(schemas: string[]): Promise<Set<string>> {
    const r = await this.run(['list-schemas'])
    const all = new Set(r.out.split('\n').map((s) => s.trim()))
    return new Set(schemas.filter((s) => all.has(s)))
  }

  /** Apply the look; returns what was there before (to undo), and what was changed. */
  async apply(settings: LookSetting[], before: Record<string, string> = {}): Promise<{ original: Record<string, string>; changed: string[]; skipped: string[] }> {
    const have = await this.have([...new Set(settings.map((s) => s.schema))])
    const original: Record<string, string> = { ...before }
    const changed: string[] = []
    const skipped: string[] = []
    for (const s of settings) {
      if (!have.has(s.schema)) {
        skipped.push(s.what)
        continue
      }
      const id = `${s.schema} ${s.key}`
      // Keep the first original: applying again (another accent) mustn't lose it.
      if (!(id in original)) {
        const cur = await this.run(['get', s.schema, s.key])
        if (cur.ok) original[id] = cur.out
      }
      const r = await this.run(['set', s.schema, s.key, s.value])
      if (r.ok) changed.push(s.what)
      else skipped.push(s.what)
    }
    return { original, changed, skipped }
  }

  /** Put back what was there before. */
  async undo(original: Record<string, string>): Promise<number> {
    let n = 0
    for (const [id, value] of Object.entries(original)) {
      const [schema, key] = id.split(' ')
      if ((await this.run(['set', schema, key, value])).ok) n++
    }
    return n
  }
}
