import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EXTENSIONS } from '@shared/desktop'
import type { Egress } from './privacy'

/** Where GNOME looks for extensions: yours first, then the system's. */
export function extensionDirs(home: string): string[] {
  return [join(home, '.local/share/gnome-shell/extensions'), '/usr/share/gnome-shell/extensions', '/usr/local/share/gnome-shell/extensions']
}

/** An installed extension's folder, or null. */
export function findExtension(uuid: string, home: string): string | null {
  for (const d of extensionDirs(home)) {
    const dir = join(d, uuid)
    if (existsSync(join(dir, 'metadata.json'))) return dir
  }
  return null
}

/** Each installed extension's schema folder, by schema (to put its keys back). */
export function extensionSchemaDirs(home: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of EXTENSIONS) {
    const dir = findExtension(e.uuid, home)
    if (dir && existsSync(join(dir, 'schemas'))) out[e.schema] = join(dir, 'schemas')
  }
  return out
}

const run = (bin: string, args: string[], timeout = 60_000) =>
  new Promise<{ ok: boolean; out: string; err: string }>((resolve) => execFile(bin, args, { timeout }, (e, out, err) => resolve({ ok: !e, out: String(out), err: String(err || (e as Error | null)?.message || '') })))

/**
 * Gets an extension from extensions.gnome.org (the version for this GNOME)
 * and installs it with GNOME's own `gnome-extensions install`. GNOME starts
 * it after you log in again.
 */
export class ExtensionInstaller {
  constructor(
    private o: {
      egress: Pick<Egress, 'blocked' | 'note'>
      base?: string
      gnomeExtensions?: string
      gnomeShell?: string
    },
  ) {}

  private get base(): string {
    return this.o.base || 'https://extensions.gnome.org'
  }

  /** GNOME's major version ("42"), or null. */
  async shellVersion(): Promise<string | null> {
    const r = await run(this.o.gnomeShell || 'gnome-shell', ['--version'], 5000)
    return /(\d+)(\.\d+)?/.exec(r.out)?.[1] ?? null
  }

  /** An error to show, or null when it's installed. */
  async install(uuid: string): Promise<string | null> {
    const ext = EXTENSIONS.find((e) => e.uuid === uuid)
    if (!ext) return 'That isn’t an extension the island uses.'
    const host = new URL(this.base).host
    const paused = this.o.egress.blocked(host)
    if (paused) return paused
    const version = await this.shellVersion()
    if (!version) return 'GNOME Shell wasn’t found here.'
    this.o.egress.note('desktop', host, `which version of ${ext.name} works with GNOME ${version}`)
    let info: { download_url?: string }
    try {
      const r = await fetch(`${this.base}/extension-info/?uuid=${encodeURIComponent(uuid)}&shell_version=${version}`, { signal: AbortSignal.timeout(20_000) })
      if (r.status === 404) return `There’s no version of ${ext.name} for GNOME ${version}.`
      if (!r.ok) return `extensions.gnome.org answered ${r.status}.`
      info = (await r.json()) as { download_url?: string }
    } catch (e) {
      return `Couldn’t reach extensions.gnome.org (${(e as Error).message}).`
    }
    if (!info.download_url || !info.download_url.startsWith('/')) return `There’s no version of ${ext.name} for GNOME ${version}.`
    const zip = join(mkdtempSync(join(tmpdir(), 'island-ext-')), `${uuid}.zip`)
    try {
      const r = await fetch(`${this.base}${info.download_url}`, { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) return `The download failed (${r.status}).`
      writeFileSync(zip, Buffer.from(await r.arrayBuffer()))
    } catch (e) {
      return `The download failed (${(e as Error).message}).`
    }
    const r = await run(this.o.gnomeExtensions || 'gnome-extensions', ['install', '--force', zip])
    if (!r.ok) return `GNOME couldn’t install it: ${r.err.trim().split('\n')[0].slice(0, 200) || 'gnome-extensions failed'}.`
    return null
  }
}
