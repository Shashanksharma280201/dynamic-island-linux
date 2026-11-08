import { nativeImage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/** Where an icon name might be, best size first (Yaru is Ubuntu's own). Pure. */
export function iconCandidates(name: string, home: string): string[] {
  if (isAbsolute(name)) return [name]
  const themes = ['Yaru', 'hicolor', 'Adwaita']
  const roots = [join(home, '.local/share/icons'), '/usr/share/icons', '/var/lib/flatpak/exports/share/icons', '/var/lib/snapd/desktop/icons']
  const sizes = ['48x48', '64x64', '128x128', '256x256', '32x32', 'scalable']
  const out: string[] = []
  for (const root of roots)
    for (const theme of themes)
      for (const size of sizes) {
        const ext = size === 'scalable' ? 'svg' : 'png'
        out.push(join(root, theme, size, 'apps', `${name}.${ext}`))
      }
  // Snaps put their icons straight in the icons folder; some apps use pixmaps.
  out.push(join('/var/lib/snapd/desktop/icons', `${name}.png`), join('/usr/share/pixmaps', `${name}.png`), join('/usr/share/pixmaps', `${name}.svg`))
  return out
}

const cache = new Map<string, string | null>()

/** An app's icon as a data: URL for the command bar, or null. */
export function iconUrl(name: string, home: string): string | null {
  if (!name) return null
  const hit = cache.get(name)
  if (hit !== undefined) return hit
  let url: string | null = null
  for (const f of iconCandidates(name, home)) {
    if (!existsSync(f)) continue
    try {
      if (f.endsWith('.svg')) {
        const svg = readFileSync(f)
        if (svg.length < 400_000) url = `data:image/svg+xml;base64,${svg.toString('base64')}`
      } else {
        const img = nativeImage.createFromPath(f)
        if (!img.isEmpty()) url = img.resize({ width: 56, height: 56, quality: 'good' }).toDataURL()
      }
    } catch {
      url = null
    }
    if (url) break
  }
  cache.set(name, url)
  return url
}
