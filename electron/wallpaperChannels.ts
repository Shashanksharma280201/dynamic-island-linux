/** IPC channels for Settings → Wallpaper. */
export const WALLPAPER = {
  SEARCH: 'wallpaper:search', // (query, kind) -> { items, errors }
  SET: 'wallpaper:set', // (id) -> error | null
  ANIMATION: 'wallpaper:animation', // (id) -> error | null
  UNDO: 'wallpaper:undo', // -> error | null
  RESTORE: 'wallpaper:restore', // -> error | null
  OPTIONS: 'wallpaper:options', // ({ pauseCovered?, pauseBattery? })
  KEY: 'wallpaper:key', // (site, key | '')
  OPEN_FOLDER: 'wallpaper:open-folder',
  OPEN_PAGE: 'wallpaper:open-page', // (https url)
} as const
