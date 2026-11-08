/**
 * Wallpapers: photos and videos found on the web, and the island's own
 * animations, set as the desktop background. Pure pieces: what a search
 * result is, reading each site's answer, ranking, the config.
 */

export type WallKind = 'image' | 'video' | 'animation'

export type WallSource = 'openverse' | 'wikimedia' | 'pexels' | 'unsplash' | 'pixabay' | 'island' | 'file'

/** A photo, video or animation that can become the background. */
export type WallItem = {
  /** `<source>:<id>`, unique across sources. */
  id: string
  source: WallSource
  kind: WallKind
  title: string
  /** A small picture of it (https, or island-media:// once saved). */
  thumb: string
  /** The full photo or video file (for animations, the animation's name). */
  url: string
  width: number
  height: number
  author?: string
  authorUrl?: string
  license?: string
  /** Its page on the site it came from. */
  page?: string
  /** Seconds, for videos. */
  duration?: number
  /** Unsplash asks to be told when a photo is used. */
  pingUrl?: string
  /** Where it was saved on this computer, once set. */
  file?: string
  /** When it was last set (ms). */
  setAt?: number
}

/** The island's own animations, drawn live on the desktop. */
export const ANIMATIONS = [
  { id: 'glow', title: 'Soft glow', note: 'Slow, soft colour, like a modern Mac', colors: ['#5b4bdb', '#c83a8f', '#f08a4b'] },
  { id: 'aurora', title: 'Aurora', note: 'Northern lights over a dark sky', colors: ['#06121f', '#1fbf8f', '#6a5cff'] },
  { id: 'waves', title: 'Waves', note: 'Layers of sea at dusk', colors: ['#0b1d3a', '#1f6f9f', '#f2a65a'] },
  { id: 'stars', title: 'Starfield', note: 'Stars drifting past', colors: ['#03040a', '#2a2f55', '#ffffff'] },
  { id: 'gradient', title: 'Gradient', note: 'One gentle gradient that shifts through the day', colors: ['#1d2b64', '#f8cdda', '#0f9b8e'] },
] as const

export type AnimationId = (typeof ANIMATIONS)[number]['id']

export function isAnimation(id: string): id is AnimationId {
  return ANIMATIONS.some((a) => a.id === id)
}

/** An animation as a wallpaper item. Pure. */
export function animationItem(id: AnimationId): WallItem {
  const a = ANIMATIONS.find((x) => x.id === id)!
  return { id: `island:${id}`, source: 'island', kind: 'animation', title: a.title, thumb: '', url: id, width: 0, height: 0, author: 'Dynamic Island' }
}

export type WallKeys = { pexels: string; unsplash: string; pixabay: string }

export type WallpaperConfig = {
  /** What's on the desktop now (set by the island), or null. */
  current: WallItem | null
  /** Live wallpapers rest while a window covers the whole screen. */
  pauseCovered: boolean
  /** ...and while the computer runs on battery. */
  pauseBattery: boolean
  /** Your own keys for better photo and video sites (encrypted, see secrets.ts). */
  keys: WallKeys
  /** The desktop's own background before the island first changed it, to put back. */
  original: string
}

export const WALLPAPER_DEFAULTS: WallpaperConfig = { current: null, pauseCovered: true, pauseBattery: true, keys: { pexels: '', unsplash: '', pixabay: '' }, original: '' }

/** A saved item, checked. Pure. */
export function parseWallItem(raw: any): WallItem | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || typeof raw.url !== 'string' || typeof raw.title !== 'string') return null
  if (!['image', 'video', 'animation'].includes(raw.kind)) return null
  const n = (v: unknown) => (Number.isFinite(v) ? Number(v) : 0)
  const s = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return {
    id: raw.id,
    source: (['openverse', 'wikimedia', 'pexels', 'unsplash', 'pixabay', 'island', 'file'].includes(raw.source) ? raw.source : 'file') as WallSource,
    kind: raw.kind,
    title: raw.title.slice(0, 200),
    thumb: typeof raw.thumb === 'string' ? raw.thumb : '',
    url: raw.url,
    width: n(raw.width),
    height: n(raw.height),
    author: s(raw.author),
    authorUrl: s(raw.authorUrl),
    license: s(raw.license),
    page: s(raw.page),
    duration: raw.duration === undefined ? undefined : n(raw.duration),
    pingUrl: s(raw.pingUrl),
    file: s(raw.file),
    setAt: raw.setAt === undefined ? undefined : n(raw.setAt),
  }
}

/** The wallpaper section of the config, checked. Pure. */
export function parseWallpaperConfig(raw: any): WallpaperConfig {
  const c: WallpaperConfig = { ...WALLPAPER_DEFAULTS, keys: { ...WALLPAPER_DEFAULTS.keys } }
  if (!raw || typeof raw !== 'object') return c
  c.current = parseWallItem(raw.current)
  if (typeof raw.pauseCovered === 'boolean') c.pauseCovered = raw.pauseCovered
  if (typeof raw.pauseBattery === 'boolean') c.pauseBattery = raw.pauseBattery
  for (const k of ['pexels', 'unsplash', 'pixabay'] as const) if (typeof raw.keys?.[k] === 'string') c.keys[k] = raw.keys[k]
  if (typeof raw.original === 'string') c.original = raw.original
  return c
}

// ------------------------------------------------------- reading sites ----

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
/** https only (http is upgraded), except this computer's own addresses (tests). Pure. */
const https = (u: string): string =>
  /^https:\/\//.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u) ? u : /^http:\/\//.test(u) ? u.replace(/^http:/, 'https:') : ''
/** A title from words like "aerial-view-of-mountains" or a file name. Pure. */
const tidy = (t: string): string =>
  t
    .replace(/^File:/i, '')
    .replace(/\.(jpe?g|png|webp|tiff?|gif|webm|ogv|mp4)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled'

/** Openverse (openly licensed photos; no key). Pure. */
export function parseOpenverse(json: any): WallItem[] {
  const out: WallItem[] = []
  for (const r of Array.isArray(json?.results) ? json.results : []) {
    const url = https(str(r.url))
    if (!url || !r.id) continue
    out.push({
      id: `openverse:${r.id}`,
      source: 'openverse',
      kind: 'image',
      title: tidy(str(r.title)),
      thumb: https(str(r.thumbnail)) || url,
      url,
      width: num(r.width),
      height: num(r.height),
      author: str(r.creator) || undefined,
      authorUrl: https(str(r.creator_url)) || undefined,
      license: r.license ? `${String(r.license).toUpperCase()}${r.license_version ? ` ${r.license_version}` : ''}` : undefined,
      page: https(str(r.foreign_landing_url)) || undefined,
    })
  }
  return out
}

/** Wikimedia Commons (photos and videos; no key), from a generator=search query with imageinfo. Pure. */
export function parseWikimedia(json: any, kind: 'image' | 'video'): WallItem[] {
  const pages = json?.query?.pages
  const list: any[] = Array.isArray(pages) ? pages : pages && typeof pages === 'object' ? Object.values(pages) : []
  const out: WallItem[] = []
  for (const p of list.sort((a, b) => num(a.index) - num(b.index))) {
    const info = Array.isArray(p.imageinfo) ? p.imageinfo[0] : null
    if (!info) continue
    const mime = str(info.mime)
    const isVideo = mime.startsWith('video/')
    if ((kind === 'video') !== isVideo || (!isVideo && !/^image\/(jpeg|png|webp)$/.test(mime))) continue
    const meta = info.extmetadata ?? {}
    const plain = (v: any) => str(v?.value).replace(/<[^>]+>/g, '').trim()
    const url = https(str(info.url))
    if (!url) continue
    out.push({
      id: `wikimedia:${p.pageid ?? p.title}`,
      source: 'wikimedia',
      kind,
      title: tidy(plain(meta.ObjectName) || str(p.title)),
      thumb: https(str(info.thumburl)) || (isVideo ? '' : url),
      url,
      width: num(info.width),
      height: num(info.height),
      author: plain(meta.Artist) || undefined,
      license: plain(meta.LicenseShortName) || undefined,
      page: https(str(info.descriptionurl)) || undefined,
      duration: isVideo ? num(info.duration) || undefined : undefined,
    })
  }
  return out
}

/** Pexels photos (key). Pure. */
export function parsePexelsPhotos(json: any): WallItem[] {
  return (Array.isArray(json?.photos) ? json.photos : [])
    .filter((p: any) => p?.id && p.src)
    .map(
      (p: any): WallItem => ({
        id: `pexels:${p.id}`,
        source: 'pexels',
        kind: 'image',
        title: tidy(str(p.alt) || 'Photo on Pexels'),
        thumb: https(str(p.src.medium) || str(p.src.small)),
        url: https(str(p.src.original) || str(p.src.large2x)),
        width: num(p.width),
        height: num(p.height),
        author: str(p.photographer) || undefined,
        authorUrl: https(str(p.photographer_url)) || undefined,
        license: 'Pexels License',
        page: https(str(p.url)) || undefined,
      }),
    )
    .filter((i: WallItem) => i.url)
}

/** The video file to download: mp4, the smallest one at least `minHeight` tall (else the biggest). Pure. */
export function pickVideoFile<T extends { width?: number; height?: number; link?: string; url?: string; file_type?: string }>(files: T[], minHeight: number): T | null {
  const mp4 = files.filter((f) => (f.link || f.url) && (!f.file_type || f.file_type === 'video/mp4') && num(f.height) > 0)
  if (!mp4.length) return null
  const big = mp4.filter((f) => num(f.height) >= minHeight).sort((a, b) => num(a.height) - num(b.height))
  return big[0] ?? mp4.sort((a, b) => num(b.height) - num(a.height))[0]
}

/** Pexels videos (key). `minHeight`: the screen's height. Pure. */
export function parsePexelsVideos(json: any, minHeight = 1080): WallItem[] {
  const out: WallItem[] = []
  for (const v of Array.isArray(json?.videos) ? json.videos : []) {
    const f = pickVideoFile(Array.isArray(v?.video_files) ? v.video_files : [], minHeight)
    if (!v?.id || !f) continue
    out.push({
      id: `pexels:v${v.id}`,
      source: 'pexels',
      kind: 'video',
      title: tidy(str(v.url).split('/').filter(Boolean).pop()?.replace(/-\d+$/, '').replace(/-/g, ' ') || 'Video on Pexels'),
      thumb: https(str(v.image)),
      url: https(str(f.link)),
      width: num(f.width),
      height: num(f.height),
      author: str(v.user?.name) || undefined,
      authorUrl: https(str(v.user?.url)) || undefined,
      license: 'Pexels License',
      page: https(str(v.url)) || undefined,
      duration: num(v.duration) || undefined,
    })
  }
  return out.filter((i) => i.url)
}

/** Unsplash photos (key). Pure. */
export function parseUnsplash(json: any): WallItem[] {
  return (Array.isArray(json?.results) ? json.results : [])
    .filter((p: any) => p?.id && p.urls)
    .map(
      (p: any): WallItem => ({
        id: `unsplash:${p.id}`,
        source: 'unsplash',
        kind: 'image',
        title: tidy(str(p.description) || str(p.alt_description) || 'Photo on Unsplash'),
        thumb: https(str(p.urls.small) || str(p.urls.thumb)),
        // A large, sharp version (the raw file can be enormous).
        url: https(str(p.urls.raw)) ? `${https(str(p.urls.raw))}${str(p.urls.raw).includes('?') ? '&' : '?'}w=3840&q=85&fm=jpg&fit=max` : https(str(p.urls.full)),
        width: num(p.width),
        height: num(p.height),
        author: str(p.user?.name) || undefined,
        authorUrl: https(str(p.user?.links?.html)) || undefined,
        license: 'Unsplash License',
        page: https(str(p.links?.html)) || undefined,
        pingUrl: https(str(p.links?.download_location)) || undefined,
      }),
    )
    .filter((i: WallItem) => i.url)
}

/** Pixabay photos (key). Pure. */
export function parsePixabayImages(json: any): WallItem[] {
  return (Array.isArray(json?.hits) ? json.hits : [])
    .filter((h: any) => h?.id && (h.largeImageURL || h.webformatURL))
    .map(
      (h: any): WallItem => ({
        id: `pixabay:${h.id}`,
        source: 'pixabay',
        kind: 'image',
        title: tidy(str(h.tags) || 'Photo on Pixabay'),
        thumb: https(str(h.webformatURL) || str(h.previewURL)),
        url: https(str(h.imageURL) || str(h.fullHDURL) || str(h.largeImageURL)),
        width: num(h.imageWidth),
        height: num(h.imageHeight),
        author: str(h.user) || undefined,
        license: 'Pixabay Content License',
        page: https(str(h.pageURL)) || undefined,
      }),
    )
    .filter((i: WallItem) => i.url)
}

/** Pixabay videos (key). Pure. */
export function parsePixabayVideos(json: any, minHeight = 1080): WallItem[] {
  const out: WallItem[] = []
  for (const h of Array.isArray(json?.hits) ? json.hits : []) {
    const sizes = h?.videos && typeof h.videos === 'object' ? Object.values(h.videos) : []
    const f = pickVideoFile(sizes as any[], minHeight)
    if (!h?.id || !f) continue
    out.push({
      id: `pixabay:v${h.id}`,
      source: 'pixabay',
      kind: 'video',
      title: tidy(str(h.tags) || 'Video on Pixabay'),
      thumb: https(str((f as any).thumbnail)) || https(str((h.videos?.tiny as any)?.thumbnail)),
      url: https(str((f as any).url)),
      width: num(f.width),
      height: num(f.height),
      author: str(h.user) || undefined,
      license: 'Pixabay Content License',
      page: https(str(h.pageURL)) || undefined,
      duration: num(h.duration) || undefined,
    })
  }
  return out.filter((i) => i.url)
}

/**
 * Best first: big enough for the screen, landscape like it, from the sites
 * with the best wallpapers. Too-small ones are dropped. Pure.
 */
export function rankWalls(items: WallItem[], screen: { width: number; height: number }): WallItem[] {
  const want = screen.width / Math.max(1, screen.height)
  const SITE: Record<string, number> = { unsplash: 1.25, pexels: 1.2, pixabay: 1.1, wikimedia: 1, openverse: 0.95 }
  const seen = new Set<string>()
  const scored: { item: WallItem; score: number }[] = []
  for (const [i, item] of items.entries()) {
    const key = item.url.split('?')[0]
    if (seen.has(key)) continue
    seen.add(key)
    const known = item.width > 0 && item.height > 0
    if (known && (item.width < Math.min(1280, screen.width * 0.66) || item.height < 600)) continue
    const ratio = known ? item.width / item.height : want
    const fit = known ? Math.max(0, 1 - Math.abs(Math.log(ratio / want)) * 1.4) : 0.6
    const size = known ? Math.min(1, item.width / screen.width) : 0.7
    // The site's own order matters too: earlier answers are more relevant.
    const order = 1 / (1 + i * 0.02)
    scored.push({ item, score: (fit * 0.5 + size * 0.5) * (SITE[item.source] ?? 1) * order })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item)
}

/** "by Jane Doe on Pexels (Pexels License)". Pure. */
export function creditLine(w: WallItem): string {
  const site = { openverse: 'Openverse', wikimedia: 'Wikimedia Commons', pexels: 'Pexels', unsplash: 'Unsplash', pixabay: 'Pixabay', island: 'Dynamic Island', file: 'your files' }[w.source]
  if (w.source === 'island') return 'An animation by Dynamic Island'
  return [w.author ? `by ${w.author}` : '', `on ${site}`, w.license ? `(${w.license})` : ''].filter(Boolean).join(' ')
}

/** What Settings shows about wallpapers. */
export type WallpaperView = {
  current: WallItem | null
  history: WallItem[]
  pauseCovered: boolean
  pauseBattery: boolean
  /** Which of your keys are set. */
  keys: { pexels: boolean; unsplash: boolean; pixabay: boolean }
  /** The desktop can be changed here (GNOME, Cinnamon, MATE, KDE, XFCE). */
  supported: boolean
  /** A live wallpaper is playing, resting, or neither. */
  live: 'playing' | 'resting' | 'off'
  /** Working on it: "Downloading…" */
  busy: string | null
  error: string | null
}
