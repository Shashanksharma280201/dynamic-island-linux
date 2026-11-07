import {
  parseOpenverse,
  parsePexelsPhotos,
  parsePexelsVideos,
  parsePixabayImages,
  parsePixabayVideos,
  parseUnsplash,
  parseWikimedia,
  rankWalls,
  type WallItem,
  type WallKeys,
} from '@shared/wallpaper'

/** Wikimedia asks every app to say who it is. */
export const USER_AGENT = 'DynamicIsland/1.0 (https://github.com/shashanksharma280201/dynamic-island-linux)'

/** Where each site answers (tests point them at a stand-in). */
export type Endpoints = { openverse: string; wikimedia: string; pexels: string; unsplash: string; pixabay: string }

export const ENDPOINTS: Endpoints = {
  openverse: 'https://api.openverse.org',
  wikimedia: 'https://commons.wikimedia.org',
  pexels: 'https://api.pexels.com',
  unsplash: 'https://api.unsplash.com',
  pixabay: 'https://pixabay.com',
}

/** Every site's base at one stand-in address: <base>/<site>. */
export function endpointsAt(base: string): Endpoints {
  const b = base.replace(/\/+$/, '')
  return { openverse: `${b}/openverse`, wikimedia: `${b}/wikimedia`, pexels: `${b}/pexels`, unsplash: `${b}/unsplash`, pixabay: `${b}/pixabay` }
}

type Ask = { site: string; url: string; headers?: Record<string, string>; read: (json: any) => WallItem[] }

/** The requests a search makes: the free sites always, the others with your key. Pure. */
export function searchRequests(query: string, kind: 'image' | 'video', keys: WallKeys, e: Endpoints, minHeight: number): Ask[] {
  const q = encodeURIComponent(query.trim())
  const asks: Ask[] = []
  const commons = (filter: string) =>
    `${e.wikimedia}/w/api.php?action=query&format=json&formatversion=2&origin=*&generator=search&gsrnamespace=6&gsrlimit=30&gsrsearch=${q}${encodeURIComponent(` ${filter}`)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=640&iiextmetadatafilter=Artist|LicenseShortName|ObjectName`
  if (kind === 'image') {
    if (keys.unsplash)
      asks.push({ site: 'Unsplash', url: `${e.unsplash}/search/photos?query=${q}&orientation=landscape&per_page=20&content_filter=high`, headers: { Authorization: `Client-ID ${keys.unsplash}`, 'Accept-Version': 'v1' }, read: parseUnsplash })
    if (keys.pexels) asks.push({ site: 'Pexels', url: `${e.pexels}/v1/search?query=${q}&orientation=landscape&size=large&per_page=20`, headers: { Authorization: keys.pexels }, read: parsePexelsPhotos })
    if (keys.pixabay)
      asks.push({ site: 'Pixabay', url: `${e.pixabay}/api/?key=${encodeURIComponent(keys.pixabay)}&q=${q}&image_type=photo&orientation=horizontal&min_width=1920&safesearch=true&per_page=20`, read: parsePixabayImages })
    asks.push({ site: 'Openverse', url: `${e.openverse}/v1/images/?q=${q}&page_size=20&aspect_ratio=wide&size=large&mature=false`, read: parseOpenverse })
    asks.push({ site: 'Wikimedia Commons', url: commons('filetype:bitmap filew:>1600'), read: (j) => parseWikimedia(j, 'image') })
  } else {
    if (keys.pexels) asks.push({ site: 'Pexels', url: `${e.pexels}/videos/search?query=${q}&orientation=landscape&size=medium&per_page=15`, headers: { Authorization: keys.pexels }, read: (j) => parsePexelsVideos(j, minHeight) })
    if (keys.pixabay) asks.push({ site: 'Pixabay', url: `${e.pixabay}/api/videos/?key=${encodeURIComponent(keys.pixabay)}&q=${q}&safesearch=true&per_page=15`, read: (j) => parsePixabayVideos(j, minHeight) })
    asks.push({ site: 'Wikimedia Commons', url: commons('filetype:video'), read: (j) => parseWikimedia(j, 'video') })
  }
  return asks
}

export type SearchResult = { items: WallItem[]; errors: string[] }

/**
 * Search every site at once (each gets 12 seconds), best results first. A
 * site that fails is reported, and the others still count.
 */
export async function searchWalls(o: {
  query: string
  kind: 'image' | 'video'
  keys: WallKeys
  screen: { width: number; height: number }
  endpoints?: Endpoints
  fetch?: typeof fetch
}): Promise<SearchResult> {
  const f = o.fetch ?? fetch
  const asks = searchRequests(o.query, o.kind, o.keys, o.endpoints ?? ENDPOINTS, o.screen.height)
  const errors: string[] = []
  const lists = await Promise.all(
    asks.map(async (a) => {
      try {
        const r = await f(a.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...a.headers }, signal: AbortSignal.timeout(12_000) })
        if (r.status === 401 || r.status === 403) throw new Error('your key was refused')
        if (r.status === 429) throw new Error('too many searches, try again in a minute')
        if (!r.ok) throw new Error(`answered ${r.status}`)
        return a.read(await r.json())
      } catch (e: any) {
        errors.push(`${a.site}: ${e?.name === 'TimeoutError' ? 'no answer' : (e?.message ?? e)}`)
        return []
      }
    }),
  )
  return { items: rankWalls(lists.flat(), o.screen), errors }
}
