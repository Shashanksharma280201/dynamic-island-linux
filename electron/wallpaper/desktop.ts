import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export type Desktop = 'gnome' | 'cinnamon' | 'mate' | 'kde' | 'xfce' | 'unknown'

/** Which desktop this is, from XDG_CURRENT_DESKTOP ("ubuntu:GNOME", "X-Cinnamon"…). Pure. */
export function desktopOf(env: NodeJS.ProcessEnv): Desktop {
  const d = `${env.XDG_CURRENT_DESKTOP ?? ''}:${env.DESKTOP_SESSION ?? ''}`.toLowerCase()
  if (d.includes('cinnamon')) return 'cinnamon'
  if (d.includes('mate')) return 'mate'
  if (d.includes('kde') || d.includes('plasma')) return 'kde'
  if (d.includes('xfce')) return 'xfce'
  if (/gnome|ubuntu|unity|budgie|pantheon|pop|zorin|cosmic/.test(d)) return 'gnome'
  return 'unknown'
}

export type Cmd = { bin: string; args: string[]; optional?: boolean }

/** The commands that make `file` the background on a desktop. Pure. */
export function setCommands(desktop: Desktop, file: string, gsettings = 'gsettings'): Cmd[] {
  const uri = pathToFileURL(file).toString()
  switch (desktop) {
    case 'gnome':
      return [
        { bin: gsettings, args: ['set', 'org.gnome.desktop.background', 'picture-uri', uri] },
        // GNOME 42 and later keep a second picture for dark style.
        { bin: gsettings, args: ['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri], optional: true },
        { bin: gsettings, args: ['set', 'org.gnome.desktop.background', 'picture-options', 'zoom'], optional: true },
      ]
    case 'cinnamon':
      return [
        { bin: gsettings, args: ['set', 'org.cinnamon.desktop.background', 'picture-uri', uri] },
        { bin: gsettings, args: ['set', 'org.cinnamon.desktop.background', 'picture-options', 'zoom'], optional: true },
      ]
    case 'mate':
      return [
        { bin: gsettings, args: ['set', 'org.mate.background', 'picture-filename', file] },
        { bin: gsettings, args: ['set', 'org.mate.background', 'picture-options', 'zoom'], optional: true },
      ]
    case 'kde':
      return [{ bin: 'plasma-apply-wallpaperimage', args: [file] }]
    case 'xfce':
      return [{ bin: 'sh', args: ['-c', `for p in $(xfconf-query -c xfce4-desktop -l | grep -E 'last-image$'); do xfconf-query -c xfce4-desktop -p "$p" -s ${JSON.stringify(file)}; done`] }]
    default:
      return []
  }
}

/** The commands that read the background now, to put it back later. Pure. */
export function getCommands(desktop: Desktop, gsettings = 'gsettings'): { key: string; cmd: Cmd }[] {
  switch (desktop) {
    case 'gnome':
      return [
        { key: 'picture-uri', cmd: { bin: gsettings, args: ['get', 'org.gnome.desktop.background', 'picture-uri'] } },
        { key: 'picture-uri-dark', cmd: { bin: gsettings, args: ['get', 'org.gnome.desktop.background', 'picture-uri-dark'] } },
        { key: 'picture-options', cmd: { bin: gsettings, args: ['get', 'org.gnome.desktop.background', 'picture-options'] } },
      ]
    case 'cinnamon':
      return [{ key: 'picture-uri', cmd: { bin: gsettings, args: ['get', 'org.cinnamon.desktop.background', 'picture-uri'] } }]
    case 'mate':
      return [{ key: 'picture-filename', cmd: { bin: gsettings, args: ['get', 'org.mate.background', 'picture-filename'] } }]
    default:
      return []
  }
}

/** gsettings prints strings quoted: 'file:///a b.jpg' → file:///a b.jpg. Pure. */
export function unquote(out: string): string {
  const t = out.trim()
  return t.length >= 2 && t.startsWith("'") && t.endsWith("'") ? t.slice(1, -1).replace(/\\'/g, "'") : t
}

export type Run = (cmd: Cmd) => Promise<{ ok: boolean; out: string; err: string }>

export const run: Run = (cmd) =>
  new Promise((resolve) => execFile(cmd.bin, cmd.args, { timeout: 10_000 }, (e, out, err) => resolve({ ok: !e, out: String(out), err: String(err || e?.message || '') })))

/** Sets and reads the desktop background (Linux desktops). */
export class DesktopBackground {
  readonly desktop: Desktop

  constructor(
    private readonly o: { env?: NodeJS.ProcessEnv; run?: Run; gsettings?: string } = {},
  ) {
    const env = o.env ?? process.env
    this.desktop = process.platform === 'linux' || env.DI_GSETTINGS ? desktopOf(env) : 'unknown'
  }

  supported(): boolean {
    return this.desktop !== 'unknown'
  }

  private get gs(): string {
    return this.o.gsettings ?? (this.o.env ?? process.env).DI_GSETTINGS ?? 'gsettings'
  }

  /** Make `file` the background. An error to show, or null. */
  async set(file: string): Promise<string | null> {
    const cmds = setCommands(this.desktop, file, this.gs)
    if (!cmds.length) return 'Changing the background isn’t supported on this desktop yet.'
    for (const c of cmds) {
      const r = await (this.o.run ?? run)(c)
      if (!r.ok && !c.optional) return `Couldn’t set the background: ${r.err.trim().split('\n')[0] || 'unknown error'}`
    }
    return null
  }

  /** The background now, as saved settings (JSON), to restore later. */
  async save(): Promise<string> {
    const out: Record<string, string> = {}
    for (const g of getCommands(this.desktop, this.gs)) {
      const r = await (this.o.run ?? run)(g.cmd)
      if (r.ok && r.out.trim()) out[g.key] = unquote(r.out)
    }
    return Object.keys(out).length ? JSON.stringify({ desktop: this.desktop, ...out }) : ''
  }

  /** Put back what save() returned. */
  async restore(saved: string): Promise<string | null> {
    let s: Record<string, string>
    try {
      s = JSON.parse(saved)
    } catch {
      return 'Nothing to put back.'
    }
    const schema = { gnome: 'org.gnome.desktop.background', cinnamon: 'org.cinnamon.desktop.background', mate: 'org.mate.background' }[s.desktop as 'gnome']
    if (!schema) return 'Nothing to put back.'
    for (const [key, value] of Object.entries(s)) {
      if (key === 'desktop') continue
      await (this.o.run ?? run)({ bin: this.gs, args: ['set', schema, key, value], optional: true })
    }
    return null
  }
}
