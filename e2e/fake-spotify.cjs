// Stand-in for Spotify's accounts service and Web API (as of Feb 2026) for
// tests and screenshots. Usage: const s = await startFakeSpotify(); s.base
// Serves generated cover images at /img/<hex>.png. Records requests in s.log.
const http = require('http')
const zlib = require('zlib')
const crypto = require('crypto')

// ---- tiny PNG encoder (a two-colour diagonal cover) ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
function coverPng(hex, size = 64) {
  const a = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  const b = a.map((v) => Math.round(v * 0.35))
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      const c = x + y < size * 1.1 ? a : b
      row.set(c, 1 + x * 3)
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function startFakeSpotify({ port = 0, premium = true } = {}) {
  const log = []
  // premium / devices / token can be changed by a test while running;
  // playerDelay (ms) makes the player state arrive late, as read when asked.
  const s = { log, liked: new Set(['spotify:track:t2']), player: null, activeDevice: false, activeId: 'dev1', webPlayer: false, phone: false, codes: new Map(), premium, devices: true, token: /^Bearer at-\d$/, playerDelay: 0 }
  let base = ''
  // Relative here; made absolute when sent (the port is known only after listen).
  const img = (hex) => [{ url: `/img/${hex}.png`, width: 300, height: 300 }, { url: `/img/${hex}.png?s=64`, width: 64, height: 64 }]
  const artist = (name) => ({ name, uri: `spotify:artist:${name.replace(/\W/g, '')}` })
  const album = (id, name, by, hex) => ({ id, uri: `spotify:album:${id}`, name, album_type: 'album', artists: [artist(by)], images: img(hex), total_tracks: 3 })
  const T = (id, name, by, al, ms) => ({ id, uri: `spotify:track:${id}`, name, artists: [artist(by)], album: al, duration_ms: ms, explicit: id === 't3' })
  const nightDrive = album('a1', 'Night Drive', 'The Midnight', 'e0503a')
  const oceans = album('a2', 'Oceans', 'Blue Hour', '2a6fdb')
  const tracks = [
    T('t1', 'Sunset', 'The Midnight', nightDrive, 312000),
    T('t2', 'Los Angeles', 'The Midnight', nightDrive, 287000),
    T('t3', 'Vampires', 'The Midnight', nightDrive, 301000),
    T('t4', 'Tidal', 'Blue Hour', oceans, 204000),
    T('t5', 'Undertow', 'Blue Hour', oceans, 233000),
  ]
  const byUri = new Map(tracks.map((t) => [t.uri, t]))
  const me = () => ({ id: 'me', display_name: 'Test Listener', product: s.premium ? 'premium' : 'free', images: [] })
  const playlists = [
    { id: 'p1', uri: 'spotify:playlist:p1', name: 'Road Trip', owner: { id: 'me', display_name: 'Test Listener' }, images: img('d4a017'), items: { total: 3 }, trackIds: ['t1', 't4', 't5'] },
    { id: 'p2', uri: 'spotify:playlist:p2', name: 'Focus Flow', owner: { id: 'me', display_name: 'Test Listener' }, images: img('1db980'), items: { total: 2 }, trackIds: ['t2', 't3'] },
    { id: 'p3', uri: 'spotify:playlist:p3', name: 'Today’s Top Hits', owner: { id: 'spotify', display_name: 'Spotify' }, images: img('8a2be2'), items: { total: 50 }, trackIds: [] },
  ]
  const plJson = ({ trackIds, ...p }) => p
  const recent = [
    { track: tracks[3], context: { uri: 'spotify:playlist:p1' }, played_at: '2026-09-28T09:00:00Z' },
    { track: tracks[1], context: { uri: 'spotify:playlist:p2' }, played_at: '2026-09-28T08:00:00Z' },
    { track: tracks[0], context: { uri: 'spotify:album:a1' }, played_at: '2026-09-27T20:00:00Z' },
  ]

  const send = (res, status, body) => {
    if (body === undefined) return res.writeHead(status).end()
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body).replaceAll('"/img/', `"${base}/img/`))
  }
  const err = (res, status, message, reason) => send(res, status, { error: { status, message, reason } })
  // Connect devices: this laptop's app, a phone (when "open"), the Web Player
  // (once a web player page has been loaded, like a browser tab would).
  const deviceList = () =>
    [
      s.devices && { id: 'dev1', name: 'Test Laptop', type: 'Computer' },
      s.phone && { id: 'ph1', name: 'Pixel 8', type: 'Smartphone' },
      s.webPlayer && { id: 'web1', name: 'Web Player (Chrome)', type: 'Computer' },
    ]
      .filter(Boolean)
      .map((d) => ({ ...d, is_active: s.activeDevice && s.activeId === d.id, is_restricted: false, volume_percent: 70 }))
  const playerJson = () =>
    s.player && {
      is_playing: s.player.playing,
      progress_ms: s.player.progress,
      item: byUri.get(s.player.track),
      shuffle_state: s.player.shuffle,
      repeat_state: s.player.repeat,
      device: deviceList().find((d) => d.id === s.activeId) ?? { id: 'dev1', name: 'Test Laptop', type: 'Computer', volume_percent: 70 },
      context: s.player.context ? { uri: s.player.context } : null,
    }
  const contextTracks = (ctx) => {
    if (!ctx) return []
    const pl = playlists.find((p) => p.uri === ctx)
    if (pl) return pl.trackIds.length ? pl.trackIds.map((id) => `spotify:track:${id}`) : ['spotify:track:t2']
    if (ctx.startsWith('spotify:album:')) return tracks.filter((t) => t.album.uri === ctx).map((t) => t.uri)
    if (ctx.startsWith('spotify:artist:')) return tracks.filter((t) => t.artists[0].uri === ctx).map((t) => t.uri)
    return []
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      log.push(`${req.method} ${url.pathname}${url.search}`)
      const p = url.pathname
      // ---- images ----
      const im = /^\/img\/([0-9a-f]{6})\.png$/.exec(p)
      if (im) return res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' }).end(coverPng(im[1]))
      // ---- accounts ----
      if (p === '/authorize') {
        const code = crypto.randomBytes(8).toString('hex')
        s.codes.set(code, url.searchParams.get('code_challenge'))
        const to = new URL(url.searchParams.get('redirect_uri'))
        to.searchParams.set('code', code)
        to.searchParams.set('state', url.searchParams.get('state'))
        s.authorize = Object.fromEntries(url.searchParams)
        return res.writeHead(302, { Location: to.toString() }).end()
      }
      if (p === '/api/token' && req.method === 'POST') {
        const f = new URLSearchParams(body)
        if (f.get('grant_type') === 'authorization_code') {
          const challenge = s.codes.get(f.get('code'))
          const ok = challenge && crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') === challenge
          if (!ok) return send(res, 400, { error: 'invalid_grant', error_description: 'bad code or verifier' })
          s.codes.delete(f.get('code'))
          return send(res, 200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, token_type: 'Bearer' })
        }
        if (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === 'rt-1') return send(res, 200, { access_token: 'at-2', expires_in: 3600 })
        return send(res, 400, { error: 'invalid_grant' })
      }
      // ---- Web Player pages (open.spotify.com) ----
      if (req.method === 'GET' && (p === '/' || /^\/(track|album|playlist|artist|collection)\//.test(p))) {
        s.webPlayer = true
        s.webPages = [...(s.webPages ?? []), p]
        return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Spotify Web Player</title>')
      }
      // ---- Web API ----
      if (!p.startsWith('/v1/')) return send(res, 404, {})
      if (!s.token.test(req.headers.authorization || '')) return err(res, 401, 'The access token expired')
      const api = p.slice(3)
      const q = url.searchParams
      const json = () => (body ? JSON.parse(body) : {})
      if (api === '/me') return send(res, 200, me())
      if (api === '/me/playlists') return send(res, 200, { items: playlists.map(plJson), next: null })
      let m
      if ((m = /^\/playlists\/(\w+)\/items$/.exec(api))) {
        const pl = playlists.find((x) => x.id === m[1])
        if (!pl) return err(res, 404, 'Not found')
        if (pl.owner.id !== 'me') return err(res, 403, 'Forbidden')
        return send(res, 200, { items: pl.trackIds.map((id) => ({ item: byUri.get(`spotify:track:${id}`), added_at: '2026-01-01T00:00:00Z' })), total: pl.trackIds.length })
      }
      if ((m = /^\/playlists\/(\w+)$/.exec(api))) {
        const pl = playlists.find((x) => x.id === m[1])
        return pl ? send(res, 200, plJson(pl)) : err(res, 404, 'Not found')
      }
      if ((m = /^\/albums\/(\w+)$/.exec(api))) {
        const al = [nightDrive, oceans].find((a) => a.id === m[1])
        if (!al) return err(res, 404, 'Not found')
        return send(res, 200, { ...al, tracks: { items: tracks.filter((t) => t.album.id === al.id).map(({ album: _a, ...t }) => t) } })
      }
      if ((m = /^\/artists\/(\w+)$/.exec(api))) return send(res, 200, { ...artist(m[1]), images: img('555555') })
      if (api === '/me/tracks' && req.method === 'GET') return send(res, 200, { items: [...s.liked].map((u) => ({ track: byUri.get(u) })), total: s.liked.size })
      if (api === '/me/library/contains') return send(res, 200, (q.get('uris') || '').split(',').map((u) => s.liked.has(u)))
      if (api === '/me/library') {
        for (const u of (q.get('uris') || '').split(',')) req.method === 'PUT' ? s.liked.add(u) : s.liked.delete(u)
        return send(res, 200, undefined)
      }
      if (api === '/me/player/recently-played') return send(res, 200, { items: recent })
      if (api === '/search') {
        const term = (q.get('q') || '').toLowerCase()
        const limit = Number(q.get('limit') || 20)
        if (limit > 10) return err(res, 400, 'Invalid limit')
        const hit = (s) => s.toLowerCase().includes(term)
        return send(res, 200, {
          tracks: { items: tracks.filter((t) => hit(t.name) || hit(t.artists[0].name)).slice(0, limit) },
          albums: { items: [nightDrive, oceans].filter((a) => hit(a.name) || hit(a.artists[0].name)) },
          artists: { items: [...new Set(tracks.map((t) => t.artists[0].name))].filter(hit).map((n) => ({ ...artist(n), images: img('777777') })) },
          playlists: { items: playlists.filter((x) => hit(x.name)).map(plJson) },
        })
      }
      if (api === '/me/player' && req.method === 'GET') {
        const answer = s.player ? [200, playerJson()] : [204]
        return s.playerDelay ? void setTimeout(() => send(res, ...answer), s.playerDelay) : send(res, ...answer)
      }
      if (api === '/me/player/devices') return send(res, 200, { devices: deviceList() })
      if (api === '/me/player' && req.method === 'PUT') {
        const id = json().device_ids?.[0]
        if (!deviceList().some((d) => d.id === id)) return err(res, 404, 'Device not found')
        s.activeDevice = true
        s.activeId = id
        s.transfers = [...(s.transfers ?? []), id]
        return send(res, 204)
      }
      if (!s.premium && api.startsWith('/me/player/')) return err(res, 403, 'Player command failed: Premium required', 'PREMIUM_REQUIRED')
      if (api === '/me/player/play') {
        const b = json()
        const dev = q.get('device_id')
        if (dev && !deviceList().some((d) => d.id === dev)) return err(res, 404, 'Device not found')
        if (!s.activeDevice && !dev) {
          if (!s.player || (!b.context_uri && !b.uris)) return err(res, 404, 'Player command failed: No active device found', 'NO_ACTIVE_DEVICE')
        }
        s.activeDevice = true
        if (dev) s.activeId = dev
        if (b.context_uri || b.uris) {
          const list = b.uris ?? contextTracks(b.context_uri)
          s.player = { track: b.offset?.uri ?? list[0], context: b.context_uri ?? null, playing: true, progress: 0, shuffle: s.player?.shuffle ?? false, repeat: s.player?.repeat ?? 'off' }
        } else if (s.player) s.player.playing = true
        s.lastPlay = { ...b, device: q.get('device_id') }
        return send(res, 204)
      }
      if (!s.player) return err(res, 404, 'Player command failed: No active device found', 'NO_ACTIVE_DEVICE')
      if (api === '/me/player/pause') return (s.player.playing = false), send(res, 204)
      if (api === '/me/player/next' || api === '/me/player/previous') {
        const list = contextTracks(s.player.context)
        const i = Math.max(0, list.indexOf(s.player.track))
        s.player.track = list[(i + (api.endsWith('next') ? 1 : list.length - 1)) % list.length] ?? s.player.track
        s.player.progress = 0
        return send(res, 204)
      }
      if (api === '/me/player/seek') return (s.player.progress = Number(q.get('position_ms'))), send(res, 204)
      if (api === '/me/player/shuffle') return (s.player.shuffle = q.get('state') === 'true'), send(res, 204)
      if (api === '/me/player/repeat') return (s.player.repeat = q.get('state')), send(res, 204)
      if (api === '/me/player/volume') return send(res, 204)
      return err(res, 404, `No such endpoint ${api}`)
    })
  })
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`
      s.base = base
      s.close = () => new Promise((r) => server.close(r))
      resolve(s)
    }),
  )
}

module.exports = { startFakeSpotify, coverPng }
