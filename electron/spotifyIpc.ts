import { ipcMain, net } from 'electron'
import { SPOTIFY } from './spotifyChannels'
import type { Spotify } from './spotify'

const uriRe = /^spotify:(track|album|playlist|artist|collection):[A-Za-z0-9:]+$/
const uri = (v: unknown): string => {
  if (typeof v !== 'string' || !uriRe.test(v)) throw new Error('Invalid Spotify link')
  return v
}

const images = new Map<string, string>()

/** Artwork as a data URL, so the island can sample its colours (no CORS taint). */
async function imageData(url: unknown): Promise<string | null> {
  // https only (tests serve covers from a local stand-in for Spotify).
  const local = !!process.env.DI_SPOTIFY_API && /^http:\/\/127\.0\.0\.1:\d+\//.test(String(url))
  if (typeof url !== 'string' || !(/^https:\/\//.test(url) || local) || url.length > 1000) return null
  const hit = images.get(url)
  if (hit) return hit
  const res = await net.fetch(url)
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 3_000_000) return null
  const data = `data:${type};base64,${buf.toString('base64')}`
  if (images.size > 40) images.delete(images.keys().next().value!)
  images.set(url, data)
  return data
}

export function wireSpotify(spotify: Spotify): void {
  ipcMain.handle(SPOTIFY.STATE, () => spotify.view())
  ipcMain.handle(SPOTIFY.SIGN_IN, () => spotify.signIn())
  ipcMain.handle(SPOTIFY.HOME, () => spotify.home())
  ipcMain.handle(SPOTIFY.PAGE, (_e, u) => spotify.page(uri(u)))
  ipcMain.handle(SPOTIFY.SEARCH, (_e, q) => spotify.search(typeof q === 'string' ? q : ''))
  ipcMain.handle(SPOTIFY.PLAY, (_e, o) =>
    spotify.play({
      contextUri: o?.contextUri ? uri(o.contextUri) : undefined,
      trackUri: o?.trackUri ? uri(o.trackUri) : undefined,
    }),
  )
  ipcMain.handle(SPOTIFY.CONTROL, (_e, c) => {
    const t = c?.type
    if (t === 'toggle' || t === 'next' || t === 'previous') return spotify.control({ type: t })
    if (t === 'seek' && Number.isFinite(c.ms)) return spotify.control({ type: 'seek', ms: Number(c.ms) })
    if (t === 'shuffle') return spotify.control({ type: 'shuffle', on: c.on === true })
    if (t === 'repeat' && ['off', 'context', 'track'].includes(c.state)) return spotify.control({ type: 'repeat', state: c.state })
    if (t === 'volume' && Number.isFinite(c.percent)) return spotify.control({ type: 'volume', percent: Number(c.percent) })
    throw new Error('Invalid command')
  })
  ipcMain.handle(SPOTIFY.LIKE, (_e, u, on) => spotify.setLiked(uri(u), on === true))
  ipcMain.on(SPOTIFY.WATCH, (_e, on) => spotify.watch(on === true))
  ipcMain.handle(SPOTIFY.IMAGE, (_e, url) => imageData(url).catch(() => null))
}
