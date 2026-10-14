import { desktopCapturer, screen } from 'electron'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { frontWindow } from './terminal'

export type FrontWindow = NonNullable<Awaited<ReturnType<typeof frontWindow>>>

/** What's attached: the window's title, and a screenshot of it if one could be taken. */
export type Attachment = { title: string; path: string | null; preview: string | null }

const KEEP = 20


/**
 * A screenshot of the window you were in: the window itself if the system
 * lists it, else that part of the screen. Saved in `dir` (the newest few kept).
 */
export async function captureWindow(w: FrontWindow, dir: string): Promise<Attachment> {
  let img: Electron.NativeImage | null = null
  try {
    const wins = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1600, height: 1200 }, fetchWindowIcons: false })
    const src = wins.find((s) => s.id.startsWith(`window:${w.xid}:`))
    if (src && !src.thumbnail.isEmpty()) img = src.thumbnail
  } catch {
    // no window capture here
  }
  if (!img) {
    try {
      const d = screen.getDisplayMatching(w.rect)
      const scale = d.scaleFactor
      const screens = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: d.size.width * scale, height: d.size.height * scale } })
      const src = screens.find((s) => s.display_id === String(d.id)) ?? screens[0]
      if (src && !src.thumbnail.isEmpty()) {
        const x = Math.max(0, w.rect.x - d.bounds.x)
        const y = Math.max(0, w.rect.y - d.bounds.y)
        const width = Math.min(w.rect.width, d.bounds.width - x)
        const height = Math.min(w.rect.height, d.bounds.height - y)
        if (width > 8 && height > 8) img = src.thumbnail.crop({ x: Math.round(x * scale), y: Math.round(y * scale), width: Math.round(width * scale), height: Math.round(height * scale) })
      }
    } catch {
      // no screen capture either (e.g. Wayland without a portal)
    }
  }
  if (!img || img.isEmpty()) return { title: w.title, path: null, preview: null }
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `window-${Date.now()}.png`)
  writeFileSync(path, img.toPNG(), { mode: 0o600 })
  // Only the newest few stay.
  try {
    const old = readdirSync(dir).filter((f) => f.startsWith('window-')).sort().slice(0, -KEEP)
    for (const f of old) rmSync(join(dir, f), { force: true })
  } catch {
    // fine
  }
  return { title: w.title, path, preview: img.resize({ width: 220 }).toDataURL() }
}
