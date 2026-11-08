import { nativeTheme } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'

export type ThemePref = 'system' | 'light' | 'dark'

/** Light or dark from GNOME's settings (color-scheme, else the GTK theme's name); null when unknown. Pure. */
export function darkFrom(colorScheme: string, gtkTheme: string): boolean | null {
  const cs = colorScheme.replace(/'/g, '').trim()
  if (cs === 'prefer-dark') return true
  if (cs === 'prefer-light') return false
  const g = gtkTheme.replace(/'/g, '').trim().toLowerCase()
  if (g && !g.includes('/')) return g.includes('dark')
  return cs === 'default' ? false : null
}

/**
 * Light or dark, as you set it (Settings → General), or following the desktop:
 * GNOME's style is read with gsettings and watched, and passed to Electron, so
 * pages that follow `prefers-color-scheme` (Settings) switch with it.
 */
export class SystemTheme {
  private dark: boolean | null = null
  private monitor: ChildProcess | null = null

  constructor(
    private readonly pref: () => ThemePref,
    private readonly onChange: () => void,
    private readonly gsettings = process.env.DI_GSETTINGS || 'gsettings',
  ) {}

  start(): void {
    // The desktop's theme changed in a way Electron noticed itself.
    nativeTheme.on('updated', () => this.onChange())
    if (process.platform !== 'linux' && !process.env.DI_GSETTINGS) return this.apply()
    void this.read()
    try {
      const m = spawn(this.gsettings, ['monitor', 'org.gnome.desktop.interface'], { stdio: ['ignore', 'pipe', 'ignore'] })
      m.on('error', () => {})
      m.stdout.on('data', (d: Buffer) => {
        if (/color-scheme|gtk-theme/.test(d.toString())) void this.read()
      })
      this.monitor = m
    } catch {
      // no gsettings: Electron's own guess stays
    }
    this.apply()
  }

  stop(): void {
    this.monitor?.kill()
    this.monitor = null
  }

  /** Is it dark now? */
  isDark(): boolean {
    return nativeTheme.shouldUseDarkColors
  }

  apply(): void {
    const p = this.pref()
    const source = p !== 'system' ? p : this.dark === null ? 'system' : this.dark ? 'dark' : 'light'
    if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source
    this.onChange()
  }

  private get(key: string): Promise<string> {
    return new Promise((resolve) => execFile(this.gsettings, ['get', 'org.gnome.desktop.interface', key], { timeout: 3000 }, (e, out) => resolve(e ? '' : String(out))))
  }

  private async read(): Promise<void> {
    const [cs, gtk] = await Promise.all([this.get('color-scheme'), this.get('gtk-theme')])
    const dark = darkFrom(cs, gtk)
    if (dark === this.dark) return
    this.dark = dark
    this.apply()
  }
}
