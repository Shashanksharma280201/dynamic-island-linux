import { ipcMain } from 'electron'
import type { WallpaperConfig } from '@shared/wallpaper'
import type { Wallpapers } from './wallpaper'
import { WALLPAPER } from './wallpaperChannels'

const SITES = ['pexels', 'unsplash', 'pixabay'] as const

/** Settings → Wallpaper. */
export function wireWallpaper(
  w: Wallpapers,
  o: {
    setOptions: (patch: Partial<Pick<WallpaperConfig, 'pauseCovered' | 'pauseBattery'>>) => void
    setKey: (site: (typeof SITES)[number], key: string) => void
    openFolder: () => void
    openUrl: (url: string) => void
  },
): void {
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const err = (r: { error: string } | object) => ('error' in r ? r.error : null)
  ipcMain.handle(WALLPAPER.SEARCH, (_e, query, kind) => w.search(text(query), kind === 'video' ? 'video' : 'image'))
  ipcMain.handle(WALLPAPER.SET, async (_e, id) => err(await w.set(text(id))))
  ipcMain.handle(WALLPAPER.ANIMATION, async (_e, id) => err(await w.animation(text(id))))
  ipcMain.handle(WALLPAPER.UNDO, async () => err(await w.undo()))
  ipcMain.handle(WALLPAPER.RESTORE, async () => err(await w.restore()))
  ipcMain.handle(WALLPAPER.OPTIONS, (_e, patch) => {
    const p: Partial<Pick<WallpaperConfig, 'pauseCovered' | 'pauseBattery'>> = {}
    if (typeof patch?.pauseCovered === 'boolean') p.pauseCovered = patch.pauseCovered
    if (typeof patch?.pauseBattery === 'boolean') p.pauseBattery = patch.pauseBattery
    o.setOptions(p)
  })
  ipcMain.handle(WALLPAPER.KEY, (_e, site, key) => {
    if (SITES.includes(site)) o.setKey(site, text(key).trim().slice(0, 200))
  })
  ipcMain.handle(WALLPAPER.OPEN_FOLDER, () => o.openFolder())
  ipcMain.handle(WALLPAPER.OPEN_PAGE, (_e, url) => o.openUrl(text(url)))
}
