/** Spotify, shaped for the island (pure mappers from Web API JSON). */

export type SpTrack = {
  uri: string
  name: string
  artists: string
  album?: string
  albumUri?: string
  /** Small cover (list rows). */
  image?: string
  /** Large cover (Now Playing). */
  art?: string
  durationMs: number
  explicit?: boolean
}

export type SpKind = 'playlist' | 'album' | 'artist' | 'liked'

export type SpCollection = {
  uri: string
  kind: SpKind
  name: string
  subtitle: string
  image?: string
  /** Spotify only lists the songs of playlists you own or collaborate on. */
  listable: boolean
  total?: number
}

export type SpRepeat = 'off' | 'context' | 'track'

export type SpPlayer = {
  isPlaying: boolean
  track?: SpTrack
  progressMs: number
  /** When progressMs was read (epoch ms), to animate between polls. */
  at: number
  shuffle: boolean
  repeat: SpRepeat
  device?: { name: string; type: string; volume: number | null }
  contextUri?: string
  liked?: boolean
}

/** A Spotify Connect device (phone, computer, web player, speaker…). */
export type SpDevice = { id: string; name: string; type: string; active: boolean; volume: number | null }

/** Playing needs a device; when none is open the island asks where to play. */
export type PlayResult = { ok: true } | { needsDevice: true }

export function mapDevices(j: any): SpDevice[] {
  return (Array.isArray(j?.devices) ? j.devices : [])
    .filter((d: any) => d && typeof d.id === 'string' && d.id && !d.is_restricted)
    .map((d: any) => ({
      id: d.id,
      name: String(d.name ?? 'Device'),
      type: String(d.type ?? ''),
      active: d.is_active === true,
      volume: typeof d.volume_percent === 'number' ? d.volume_percent : null,
    }))
}

/** The best device to play on when you didn't pick one: the active one, then a computer, then any. Pure. */
export function pickDevice(ds: SpDevice[]): SpDevice | undefined {
  return ds.find((d) => d.active) ?? ds.find((d) => d.type === 'Computer') ?? ds[0]
}

/** open.spotify.com page for what you asked to play (opening it starts the Web Player). Pure. */
export function webPlayerUrl(base: string, o: { contextUri?: string; trackUri?: string }): string {
  const uri = o.contextUri && o.contextUri !== LIKED.uri ? o.contextUri : o.trackUri
  if (!uri && o.contextUri === LIKED.uri) return `${base}/collection/tracks`
  const [, kind, id] = (uri ?? '').split(':')
  return kind && id && /^[A-Za-z0-9]+$/.test(id) ? `${base}/${kind}/${id}` : base
}

export type SpotifyStatus = 'needs-client' | 'signed-out' | 'signing-in' | 'ready' | 'error'

export type SpotifyView = {
  status: SpotifyStatus
  error?: string
  user?: { name: string; image?: string; premium: boolean }
  player?: SpPlayer | null
  /** The Spotify desktop app is installed on this computer. */
  appInstalled?: boolean
  /** "Opening the Web Player…" while the island waits for a device to appear. */
  connecting?: string
}

export type SpHome = { recent: SpCollection[]; playlists: SpCollection[]; recentTracks: SpTrack[] }
export type SpPage = { collection: SpCollection; tracks: SpTrack[] }
export type SpSearch = { tracks: SpTrack[]; playlists: SpCollection[]; albums: SpCollection[]; artists: SpCollection[] }

/** Biggest image that's still small enough for the island (≈300px), else the first. */
export function pickImage(images: any, want = 300): string | undefined {
  if (!Array.isArray(images) || !images.length) return undefined
  const ok = images.filter((i) => i && typeof i.url === 'string')
  if (!ok.length) return undefined
  const sized = ok.filter((i) => typeof i.width === 'number')
  if (!sized.length) return ok[0].url
  const bigEnough = sized.filter((i) => i.width >= want).sort((a, b) => a.width - b.width)
  return (bigEnough[0] ?? sized.sort((a, b) => b.width - a.width)[0]).url
}

const names = (artists: any): string =>
  Array.isArray(artists) ? artists.map((a) => a?.name).filter(Boolean).join(', ') : ''

export function mapTrack(t: any): SpTrack | null {
  if (!t || typeof t.uri !== 'string' || !t.uri.startsWith('spotify:')) return null
  return {
    uri: t.uri,
    name: String(t.name ?? ''),
    artists: names(t.artists) || String(t.show?.name ?? ''),
    album: t.album?.name,
    albumUri: typeof t.album?.uri === 'string' ? t.album.uri : undefined,
    image: pickImage(t.album?.images ?? t.images, 64),
    art: pickImage(t.album?.images ?? t.images, 300),
    durationMs: Number(t.duration_ms) || 0,
    explicit: t.explicit === true || undefined,
  }
}

export function mapPlaylist(p: any, myId?: string): SpCollection | null {
  if (!p || typeof p.uri !== 'string') return null
  const owner = p.owner?.display_name || p.owner?.id || ''
  const mine = !!myId && p.owner?.id === myId
  // Feb 2026: "tracks" was renamed "items" on playlist objects.
  const total = p.items?.total ?? p.tracks?.total
  return {
    uri: p.uri,
    kind: 'playlist',
    name: String(p.name ?? ''),
    subtitle: `Playlist · ${owner}`,
    image: pickImage(p.images),
    listable: mine || p.collaborative === true,
    total: typeof total === 'number' ? total : undefined,
  }
}

export function mapAlbum(a: any): SpCollection | null {
  if (!a || typeof a.uri !== 'string') return null
  return {
    uri: a.uri,
    kind: 'album',
    name: String(a.name ?? ''),
    subtitle: `${a.album_type === 'single' ? 'Single' : 'Album'} · ${names(a.artists)}`,
    image: pickImage(a.images),
    listable: true,
    total: typeof a.total_tracks === 'number' ? a.total_tracks : undefined,
  }
}

export function mapArtist(a: any): SpCollection | null {
  if (!a || typeof a.uri !== 'string') return null
  return { uri: a.uri, kind: 'artist', name: String(a.name ?? ''), subtitle: 'Artist', image: pickImage(a.images), listable: false }
}

export const LIKED: SpCollection = {
  uri: 'spotify:collection:tracks',
  kind: 'liked',
  name: 'Liked Songs',
  subtitle: 'Playlist · You',
  listable: true,
}

export function mapPlayer(j: any, now: number): SpPlayer | null {
  if (!j || typeof j !== 'object') return null
  const repeat: SpRepeat = j.repeat_state === 'track' || j.repeat_state === 'context' ? j.repeat_state : 'off'
  return {
    isPlaying: j.is_playing === true,
    track: mapTrack(j.item) ?? undefined,
    progressMs: Number(j.progress_ms) || 0,
    at: now,
    shuffle: j.shuffle_state === true,
    repeat,
    device: j.device
      ? {
          name: String(j.device.name ?? ''),
          type: String(j.device.type ?? ''),
          volume: typeof j.device.volume_percent === 'number' ? j.device.volume_percent : null,
        }
      : undefined,
    contextUri: typeof j.context?.uri === 'string' ? j.context.uri : undefined,
  }
}

/**
 * "Jump back in": the playlists / albums you recently played from, newest
 * first, without repeats. Pure.
 */
export function recentContexts(items: any[], lookup: Map<string, SpCollection>): SpCollection[] {
  const seen = new Set<string>()
  const out: SpCollection[] = []
  for (const it of items ?? []) {
    const ctx = it?.context?.uri ?? it?.track?.album?.uri
    if (typeof ctx !== 'string' || seen.has(ctx)) continue
    seen.add(ctx)
    const known = lookup.get(ctx)
    if (known) out.push(known)
    else if (ctx === it?.track?.album?.uri) {
      const a = mapAlbum(it.track.album)
      if (a) out.push(a)
    }
  }
  return out
}

/** Position now, given the last reading. Pure. */
export function progressNow(p: SpPlayer, now: number): number {
  if (!p.isPlaying) return p.progressMs
  const d = p.track?.durationMs ?? Infinity
  return Math.min(d, p.progressMs + (now - p.at))
}

/** "3:07". Pure. */
export function msText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Spotify's time-of-day greeting for Home. Pure. */
export function greeting(date: Date): string {
  const h = date.getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
