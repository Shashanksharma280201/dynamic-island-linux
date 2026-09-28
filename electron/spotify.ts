import { net, shell } from 'electron'
import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LIKED,
  mapAlbum,
  mapArtist,
  mapPlayer,
  mapPlaylist,
  mapTrack,
  recentContexts,
  type SpCollection,
  type SpHome,
  type SpPage,
  type SpPlayer,
  type SpRepeat,
  type SpSearch,
  type SpTrack,
  type SpotifyView,
} from '@shared/spotify'
import { decryptSecret, encryptSecret } from './secrets'

/**
 * Spotify Web API for the island: sign-in with OAuth PKCE (no client secret;
 * you register your own free Spotify app and paste its Client ID), your
 * library, search and playback control.
 */

export const REDIRECT_PORT = 43117
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
const SCOPES = [
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
].join(' ')

type Tokens = { access: string; refresh: string; expiresAt: number }

/** PKCE verifier + S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** The sign-in URL to open in the browser. Pure. */
export function authorizeUrl(base: string, clientId: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES,
  })
  return `${base}/authorize?${q}`
}

export class SpotifyError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason?: string,
  ) {
    super(message)
  }
}

/** Turn an API error into something to show. Pure. */
export function friendlyError(status: number, reason?: string, message?: string): string {
  if (reason === 'NO_ACTIVE_DEVICE') return 'Nothing is playing on any device. Open Spotify on this computer or your phone.'
  if (reason === 'PREMIUM_REQUIRED' || /premium/i.test(message ?? '')) return 'Controlling playback needs Spotify Premium.'
  if (status === 429) return 'Spotify says: too many requests. Try again in a moment.'
  if (status === 401) return 'Your Spotify sign-in expired. Connect again in Settings.'
  if (status === 403) return message || 'Spotify doesn’t allow that for this account.'
  return message || `Spotify error ${status}`
}

type Deps = {
  clientId: () => string
  dataDir: string
  onChange: (v: SpotifyView) => void
  /** Play a spotify: URI in the Spotify app on this computer (MPRIS / launch). */
  openLocally: (uri: string) => Promise<boolean>
  accountsBase?: string
  apiBase?: string
}

export class Spotify {
  private tokens: Tokens | null = null
  private status: SpotifyView['status'] = 'signed-out'
  private error?: string
  private user?: SpotifyView['user'] & { id: string }
  private player: SpPlayer | null = null
  private liked = new Map<string, boolean>()
  private login: { server: http.Server; timer: ReturnType<typeof setTimeout> } | null = null
  private watchers = 0
  private poll: ReturnType<typeof setTimeout> | null = null
  private playlistCache = new Map<string, SpCollection>()
  private accounts: string
  private api: string

  constructor(private d: Deps) {
    this.accounts = d.accountsBase ?? 'https://accounts.spotify.com'
    this.api = d.apiBase ?? 'https://api.spotify.com/v1'
    try {
      const raw = JSON.parse(readFileSync(this.file(), 'utf8'))
      this.tokens = JSON.parse(decryptSecret(raw.secret))
    } catch {
      this.tokens = null
    }
  }

  private file(): string {
    return join(this.d.dataDir, 'spotify.json')
  }

  private saveTokens(): void {
    try {
      mkdirSync(this.d.dataDir, { recursive: true })
      if (!this.tokens) return rmSync(this.file(), { force: true })
      writeFileSync(this.file() + '.tmp', JSON.stringify({ secret: encryptSecret(JSON.stringify(this.tokens)) }), { mode: 0o600 })
      renameSync(this.file() + '.tmp', this.file())
    } catch (e) {
      console.error('[spotify] save failed:', e)
    }
  }

  view(): SpotifyView {
    const status = !this.d.clientId() ? 'needs-client' : this.status
    return {
      status,
      error: this.error,
      user: this.user ? { name: this.user.name, image: this.user.image, premium: this.user.premium } : undefined,
      player: this.player ? { ...this.player, liked: this.player.track ? this.liked.get(this.player.track.uri) : undefined } : this.player,
    }
  }

  private changed(): void {
    this.d.onChange(this.view())
  }

  /** On startup: pick up an earlier sign-in. */
  async start(): Promise<void> {
    if (!this.d.clientId() || !this.tokens) return this.changed()
    try {
      await this.loadUser()
      this.status = 'ready'
    } catch (e: any) {
      this.status = e instanceof SpotifyError && e.status === 401 ? 'signed-out' : 'error'
      this.error = e?.message
    }
    this.changed()
  }

  // ---- sign-in (Authorization Code with PKCE, loopback redirect) ----

  async signIn(): Promise<void> {
    const clientId = this.d.clientId()
    if (!clientId) throw new Error('Enter your Spotify app’s Client ID first.')
    this.cancelSignIn()
    const { verifier, challenge } = pkcePair()
    const state = randomBytes(16).toString('hex')
    const done = new Promise<string>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', REDIRECT_URI)
        if (url.pathname !== '/callback') return res.writeHead(404).end()
        const page = (msg: string) =>
          `<!doctype html><meta charset="utf-8"><title>Dynamic Island</title><body style="font:16px system-ui;background:#121212;color:#fff;display:grid;place-items:center;height:90vh"><div>${msg}</div>`
        if (url.searchParams.get('state') !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' }).end(page('That sign-in link is out of date. Try again from the island.'))
          return
        }
        const err = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        if (err || !code) {
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('Spotify sign-in was cancelled.'))
          return reject(new Error(err === 'access_denied' ? 'Sign-in was cancelled.' : `Spotify sign-in failed (${err})`))
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('Connected to Spotify. You can close this tab.'))
        resolve(code)
      })
      server.on('error', (e: any) =>
        reject(new Error(e?.code === 'EADDRINUSE' ? `Port ${REDIRECT_PORT} is busy; close whatever is using it and try again.` : String(e))),
      )
      server.listen(REDIRECT_PORT, '127.0.0.1')
      const timer = setTimeout(() => reject(new Error('Sign-in timed out. Try again.')), 5 * 60_000)
      this.login = { server, timer }
    })
    this.status = 'signing-in'
    this.error = undefined
    this.changed()
    const url = authorizeUrl(this.accounts, clientId, challenge, state)
    // Tests follow the redirect themselves instead of opening a browser.
    if (process.env.DI_SPOTIFY_TEST_LOGIN) void net.fetch(url).catch(() => {})
    else await shell.openExternal(url)
    try {
      const code = await done
      const t = await this.tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
      })
      this.tokens = t
      this.saveTokens()
      await this.loadUser()
      this.status = 'ready'
    } catch (e: any) {
      this.status = this.tokens ? 'ready' : 'signed-out'
      this.error = e?.message ?? String(e)
      throw e
    } finally {
      this.cancelSignIn()
      this.changed()
    }
  }

  private cancelSignIn(): void {
    if (!this.login) return
    clearTimeout(this.login.timer)
    this.login.server.close()
    this.login = null
  }

  signOut(): void {
    this.tokens = null
    this.user = undefined
    this.player = null
    this.status = 'signed-out'
    this.error = undefined
    this.saveTokens()
    this.changed()
  }

  private async tokenRequest(form: Record<string, string>): Promise<Tokens> {
    const res = await net.fetch(`${this.accounts}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
    const j: any = await res.json().catch(() => ({}))
    if (!res.ok || !j.access_token) {
      throw new SpotifyError(j.error_description || j.error || `Spotify sign-in failed (${res.status})`, res.status === 400 ? 401 : res.status)
    }
    return {
      access: j.access_token,
      refresh: j.refresh_token || this.tokens?.refresh || form.refresh_token,
      expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000,
    }
  }

  private async token(): Promise<string> {
    if (!this.tokens) throw new SpotifyError('Connect Spotify first.', 401)
    if (Date.now() < this.tokens.expiresAt) return this.tokens.access
    this.tokens = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh, client_id: this.d.clientId() })
    this.saveTokens()
    return this.tokens.access
  }

  /** One Web API call; refreshes an expired token once. */
  private async call(method: string, path: string, body?: unknown, retried = false): Promise<any> {
    const res = await net.fetch(path.startsWith('http') ? path : `${this.api}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401 && !retried && this.tokens) {
      this.tokens.expiresAt = 0
      return this.call(method, path, body, true)
    }
    if (res.status === 204 || res.status === 202) return null
    const text = await res.text()
    let j: any = null
    try {
      j = text ? JSON.parse(text) : null
    } catch {
      j = null
    }
    if (!res.ok) {
      const err = j?.error ?? {}
      throw new SpotifyError(friendlyError(res.status, err.reason, err.message), res.status, err.reason)
    }
    return j
  }

  private async loadUser(): Promise<void> {
    const me = await this.call('GET', '/me')
    this.user = {
      id: String(me?.id ?? ''),
      name: String(me?.display_name || me?.id || 'You'),
      image: me?.images?.[0]?.url,
      premium: me?.product === 'premium',
    }
  }

  private ready(): void {
    if (this.status !== 'ready') throw new SpotifyError(this.status === 'needs-client' ? 'Set up Spotify in Settings first.' : 'Connect Spotify first.', 401)
  }

  // ---- library ----

  async playlists(): Promise<SpCollection[]> {
    this.ready()
    const out: SpCollection[] = []
    let next: string | null = '/me/playlists?limit=50'
    for (let page = 0; next && page < 4; page++) {
      const j: any = await this.call('GET', next)
      for (const p of j?.items ?? []) {
        const c = mapPlaylist(p, this.user?.id)
        if (c) {
          out.push(c)
          this.playlistCache.set(c.uri, c)
        }
      }
      next = j?.next ?? null
    }
    return out
  }

  async home(): Promise<SpHome> {
    this.ready()
    const [lists, recent] = await Promise.all([
      this.playlists(),
      this.call('GET', '/me/player/recently-played?limit=50').catch(() => ({ items: [] })),
    ])
    const lookup = new Map(lists.map((c) => [c.uri, c]))
    const items = recent?.items ?? []
    const seen = new Set<string>()
    const recentTracks: SpTrack[] = []
    for (const it of items) {
      const t = mapTrack(it?.track)
      if (t && !seen.has(t.uri) && recentTracks.length < 12) {
        seen.add(t.uri)
        recentTracks.push(t)
      }
    }
    return { recent: recentContexts(items, lookup).slice(0, 8), playlists: lists, recentTracks }
  }

  async page(uri: string): Promise<SpPage> {
    this.ready()
    if (uri === LIKED.uri) {
      const j = await this.call('GET', '/me/tracks?limit=50')
      const tracks = (j?.items ?? []).map((i: any) => mapTrack(i?.track)).filter(Boolean) as SpTrack[]
      return { collection: { ...LIKED, total: j?.total ?? tracks.length }, tracks }
    }
    const [kind, id] = uri.split(':').slice(1)
    if (!/^[A-Za-z0-9]+$/.test(id ?? '')) throw new Error('Invalid Spotify link')
    if (kind === 'playlist') {
      const known = this.playlistCache.get(uri)
      const meta = known ?? mapPlaylist(await this.call('GET', `/playlists/${id}?fields=uri,name,owner,images,collaborative,items(total),tracks(total)`), this.user?.id)
      if (!meta) throw new Error('Playlist not found')
      if (!meta.listable) return { collection: meta, tracks: [] }
      // Feb 2026: /playlists/{id}/tracks became /playlists/{id}/items.
      let j: any
      try {
        j = await this.call('GET', `/playlists/${id}/items?limit=50`)
      } catch (e) {
        if (!(e instanceof SpotifyError) || e.status !== 404) throw e
        j = await this.call('GET', `/playlists/${id}/tracks?limit=50`)
      }
      const tracks = (j?.items ?? []).map((i: any) => mapTrack(i?.item ?? i?.track)).filter(Boolean) as SpTrack[]
      return { collection: meta, tracks }
    }
    if (kind === 'album') {
      const a = await this.call('GET', `/albums/${id}`)
      const album = mapAlbum(a)
      if (!album) throw new Error('Album not found')
      const tracks = (a?.tracks?.items ?? []).map((t: any) => mapTrack({ ...t, album: a })).filter(Boolean) as SpTrack[]
      return { collection: album, tracks }
    }
    if (kind === 'artist') {
      const a = mapArtist(await this.call('GET', `/artists/${id}`))
      if (!a) throw new Error('Artist not found')
      return { collection: a, tracks: [] }
    }
    throw new Error('That kind of Spotify link isn’t supported')
  }

  async search(q: string): Promise<SpSearch> {
    this.ready()
    const query = q.trim().slice(0, 200)
    if (!query) return { tracks: [], playlists: [], albums: [], artists: [] }
    // Development-mode apps get at most 10 results per type.
    const j = await this.call('GET', `/search?${new URLSearchParams({ q: query, type: 'track,playlist,album,artist', limit: '10' })}`)
    const list = <T,>(xs: any[] | undefined, f: (x: any) => T | null) => (xs ?? []).map(f).filter(Boolean) as T[]
    return {
      tracks: list(j?.tracks?.items, mapTrack),
      playlists: list(j?.playlists?.items, (p) => mapPlaylist(p, this.user?.id)),
      albums: list(j?.albums?.items, mapAlbum),
      artists: list(j?.artists?.items, mapArtist),
    }
  }

  // ---- playback ----

  /** Play a track (inside its playlist / album when given) or a whole collection. */
  async play(o: { contextUri?: string; trackUri?: string }): Promise<void> {
    this.ready()
    const body: any = {}
    if (o.contextUri && o.contextUri !== LIKED.uri) {
      body.context_uri = o.contextUri
      if (o.trackUri) body.offset = { uri: o.trackUri }
    } else if (o.trackUri) {
      body.uris = [o.trackUri]
    }
    try {
      await this.call('PUT', '/me/player/play', body)
    } catch (e) {
      if (!(e instanceof SpotifyError) || e.status !== 404) throw e
      // No active device: use one that's available, or Spotify on this computer.
      const devices: any[] = (await this.call('GET', '/me/player/devices').catch(() => null))?.devices ?? []
      const pick = devices.find((d) => d.type === 'Computer' && !d.is_restricted) ?? devices.find((d) => !d.is_restricted)
      if (pick) await this.call('PUT', `/me/player/play?device_id=${encodeURIComponent(pick.id)}`, body)
      else if (!(await this.d.openLocally(o.trackUri ?? o.contextUri ?? ''))) throw e
    }
    await this.refreshPlayer(400)
  }

  async control(cmd: { type: 'toggle' | 'next' | 'previous' } | { type: 'seek'; ms: number } | { type: 'shuffle'; on: boolean } | { type: 'repeat'; state: SpRepeat } | { type: 'volume'; percent: number }): Promise<void> {
    this.ready()
    switch (cmd.type) {
      case 'toggle':
        await this.call('PUT', this.player?.isPlaying ? '/me/player/pause' : '/me/player/play')
        if (this.player) this.player = { ...this.player, isPlaying: !this.player.isPlaying, at: Date.now() }
        break
      case 'next':
        await this.call('POST', '/me/player/next')
        break
      case 'previous':
        await this.call('POST', '/me/player/previous')
        break
      case 'seek':
        await this.call('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.round(cmd.ms))}`)
        if (this.player) this.player = { ...this.player, progressMs: cmd.ms, at: Date.now() }
        break
      case 'shuffle':
        await this.call('PUT', `/me/player/shuffle?state=${cmd.on}`)
        break
      case 'repeat':
        await this.call('PUT', `/me/player/repeat?state=${cmd.state}`)
        break
      case 'volume':
        await this.call('PUT', `/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(cmd.percent)))}`)
        break
    }
    this.changed()
    await this.refreshPlayer(350)
  }

  /** Save or remove a song from Liked Songs. */
  async setLiked(uri: string, on: boolean): Promise<void> {
    this.ready()
    // Feb 2026: saving moved to /me/library (URIs); older apps keep /me/tracks.
    try {
      await this.call(on ? 'PUT' : 'DELETE', `/me/library?uris=${encodeURIComponent(uri)}`)
    } catch (e) {
      if (!(e instanceof SpotifyError) || (e.status !== 404 && e.status !== 405)) throw e
      await this.call(on ? 'PUT' : 'DELETE', `/me/tracks?ids=${encodeURIComponent(uri.split(':').pop()!)}`)
    }
    this.liked.set(uri, on)
    this.changed()
  }

  private async checkLiked(uri: string): Promise<void> {
    if (this.liked.has(uri)) return
    try {
      let r: any
      try {
        r = await this.call('GET', `/me/library/contains?uris=${encodeURIComponent(uri)}`)
      } catch (e) {
        if (!(e instanceof SpotifyError) || e.status !== 404) throw e
        r = await this.call('GET', `/me/tracks/contains?ids=${encodeURIComponent(uri.split(':').pop()!)}`)
      }
      if (Array.isArray(r)) this.liked.set(uri, r[0] === true)
    } catch {
      // not important enough to show an error
    }
  }

  async refreshPlayer(delay = 0): Promise<void> {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    if (this.status !== 'ready') return
    try {
      this.player = mapPlayer(await this.call('GET', '/me/player'), Date.now())
      if (this.player?.track) await this.checkLiked(this.player.track.uri)
      this.error = undefined
    } catch (e: any) {
      if (e instanceof SpotifyError && e.status === 401) {
        this.status = 'signed-out'
        this.error = e.message
      }
    }
    this.changed()
  }

  /** Keep the player fresh while the Music tab is open. */
  watch(on: boolean): void {
    this.watchers = Math.max(0, this.watchers + (on ? 1 : -1))
    if (this.watchers && !this.poll) {
      const tick = async () => {
        await this.refreshPlayer()
        this.poll = this.watchers ? setTimeout(tick, 2000) : null
      }
      void tick()
    }
  }

  stop(): void {
    this.cancelSignIn()
    if (this.poll) clearTimeout(this.poll)
    this.poll = null
    this.watchers = 0
  }
}
