// End-to-end test of Spotify in the real Electron app, against a local
// stand-in for Spotify's accounts service and Web API (e2e/fake-spotify.cjs):
// setup in Settings, PKCE sign-in, Home / Library / Search / playlists, playing
// a song inside its playlist, Now Playing controls, likes, token refresh after
// a restart, the no-device fallback to the Spotify app on this computer, and
// the Spotify-styled Now Playing card, and "Connect to a device" (phone or
// the Web Player) when Spotify isn't open anywhere. Run through `npm run test:e2e`.
const { _electron } = require('playwright-core')
const { spawn, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeSpotify } = require('./fake-spotify.cjs')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-spotify-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(USER_DATA, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms
  while (!(await fn()) && Date.now() < end) await sleep(100)
  return fn()
}

;(async () => {
  const sp = await startFakeSpotify()
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'right', y: 0.4 } }))
  // Spotify's desktop app, as far as the island can tell (MPRIS name + art).
  const player = spawn('node', [path.join(__dirname, 'fake-player.cjs')], {
    env: { ...process.env, FAKE_PLAYER_NAME: 'spotify', FAKE_PLAYER_ART: `${sp.base}/img/2a6fdb.png` },
  })
  let playerOut = ''
  player.stdout.on('data', (d) => (playerOut += d))
  await until(() => playerOut.includes('READY'), 5000)

  const launch = () =>
    _electron.launch({
      executablePath: ELECTRON,
      args: [ROOT, '--no-sandbox'],
      cwd: ROOT,
      env: {
        ...process.env,
        DI_USER_DATA: USER_DATA,
        DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
        DI_BACKDROP: 'off',
        DI_SPOTIFY_ACCOUNTS: sp.base,
        DI_SPOTIFY_API: `${sp.base}/v1`,
        DI_SPOTIFY_NO_BROWSER: '1',
        DI_SPOTIFY_WEB: sp.base,
        DI_SPOTIFY_APP: '', // the Spotify app isn't installed here
      },
    })
  let app = await launch()
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  let page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {})
  const openMusic = async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
    await page.waitForSelector('.hub', { timeout: 5000 })
    await page.click('.rail-btn[aria-label="Music"]')
    await page.waitForSelector('.music', { timeout: 5000 })
  }

  try {
    await sleep(1500)
    // ---- Before setup ----
    await openMusic()
    check('without a Client ID the Music tab explains the setup', await page.waitForSelector('.sp-connect:has-text("isn’t set up yet")', { timeout: 5000 }).then(() => true, () => false))

    // ---- Settings: steps, redirect URI, Client ID, connect ----
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('spotify'))])
    await settings.waitForSelector('#spotify', { timeout: 5000 })
    const steps = await settings.textContent('#spotify')
    check('Settings shows how to create a Spotify app', /developer\.spotify\.com\/dashboard/.test(steps) && steps.includes('http://127.0.0.1:43117/callback'), '')
    await settings.fill('#spotify input', 'abc123client')
    await settings.click('#spotify button:has-text("Use Client ID")')
    await settings.waitForSelector('#spotify button:has-text("Connect"):not([disabled])', { timeout: 5000 })
    await settings.click('#spotify button:has-text("Connect")')
    check('Connect signs in (PKCE) and shows who you are', await settings.waitForSelector('#spotify:has-text("Connected as Test Listener")', { timeout: 10000 }).then(() => true, () => false))
    check('the sign-in asked for the right access', /user-modify-playback-state/.test(sp.authorize?.scope ?? '') && sp.authorize?.code_challenge_method === 'S256' && sp.authorize?.client_id === 'abc123client')
    const saved = fs.readFileSync(path.join(USER_DATA, 'spotify.json'), 'utf8')
    check('tokens are not stored as readable text (encrypted with the keyring when there is one)', !saved.includes('at-1') && !saved.includes('rt-1'))
    const cfg = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check('only the Client ID goes in the config', cfg.spotify?.clientId === 'abc123client' && !JSON.stringify(cfg).includes('at-1'))
    await settings.close()

    // ---- Home ----
    await page.waitForSelector('.sp-home', { timeout: 8000 })
    const tiles = await page.$$eval('.sp-tile-name', (e) => e.map((x) => x.textContent))
    check('Home: Liked Songs and what you played recently', tiles[0] === 'Liked Songs' && tiles.includes('Road Trip') && tiles.includes('Night Drive'), tiles.join(', '))
    check('Home: your playlists', (await page.$$eval('.sp-card-title', (e) => e.map((x) => x.textContent))).includes('Focus Flow'))
    await sleep(800)
    await shot('01-home')

    // ---- A playlist, and playing a song inside it ----
    await page.click('.sp-tile:has-text("Road Trip")')
    await page.waitForSelector('.sp-collection .sp-row', { timeout: 5000 })
    const rows = await page.$$eval('.sp-collection .sp-row-title', (e) => e.map((x) => x.textContent))
    check('a playlist lists its songs', rows.join() === 'Sunset,Tidal,Undertow', rows.join())
    check('its header takes the cover’s colour', await until(() => page.$eval('.sp-collection', (e) => getComputedStyle(e).getPropertyValue('--sp-tint').trim() !== 'rgb(83, 83, 83)'), 4000))
    await shot('02-playlist')
    await page.click('.sp-row:has-text("Tidal")')
    await until(() => !!sp.lastPlay, 5000)
    check('tapping a song plays it inside the playlist', sp.lastPlay?.context_uri === 'spotify:playlist:p1' && sp.lastPlay?.offset?.uri === 'spotify:track:t4', JSON.stringify(sp.lastPlay))
    check('with nothing playing anywhere it picks your available device', sp.lastPlay?.device === 'dev1')
    check('the mini player shows the song and device', await page.waitForSelector('.sp-mini:has-text("Tidal"):has-text("Test Laptop")', { timeout: 6000 }).then(() => true, () => false))
    check('the playing song is highlighted', await until(() => page.$eval('.sp-row.current .sp-row-title', (e) => e.textContent === 'Tidal').catch(() => false), 3000))

    // ---- Now Playing ----
    await page.click('.sp-mini')
    await page.waitForSelector('.sp-now', { timeout: 5000 })
    check('Now Playing: song, artist and where it plays from', (await page.textContent('.sp-now')).includes('Tidal') && (await page.textContent('.sp-now-from')).includes('Road Trip'))
    await sleep(800)
    await shot('03-now-playing')
    await page.click('.sp-now .sp-icon-btn.like')
    check('the heart saves the song to Liked Songs', await until(() => sp.liked.has('spotify:track:t4'), 4000))
    check('and turns green', await until(() => page.$('.sp-now .sp-icon-btn.like.on').then((x) => !!x), 4000))
    await page.click('.sp-now [aria-label="Shuffle"]')
    check('shuffle', await until(() => sp.player?.shuffle === true, 4000))
    await page.click('.sp-now [aria-label="Next"]')
    check('next song', await until(async () => (await page.textContent('.sp-now-title')) === 'Undertow', 5000))
    await page.click('.sp-now [aria-label="Pause"]')
    check('pause', await until(() => sp.player?.playing === false, 4000))
    await page.click('.sp-now [aria-label="Play"]')
    check('play', await until(() => sp.player?.playing === true, 4000))
    // Spotify can answer late: a player state read before a pause, arriving
    // after it, mustn't put the Pause button back (or make Play pause).
    sp.playerDelay = 1500
    await page.click('.sp-now [aria-label="Shuffle"]') // its refresh reads the state while it still plays
    await sleep(600)
    await page.evaluate(() => {
      window.__flipped = false
      window.__paused = false
      new MutationObserver(() => {
        if (window.__paused && document.querySelector('.sp-now [aria-label="Pause"]')) window.__flipped = true
      }).observe(document.querySelector('.sp-now'), { subtree: true, childList: true, attributes: true })
    })
    await page.click('.sp-now [aria-label="Pause"]')
    await page.waitForSelector('.sp-now [aria-label="Play"]', { timeout: 4000 })
    await page.evaluate(() => (window.__paused = true))
    await sleep(2500)
    check('a late answer from before a pause doesn’t undo it', sp.player?.playing === false && !(await page.evaluate(() => window.__flipped)), `playing: ${sp.player?.playing}`)
    sp.playerDelay = 0
    await page.click('.sp-now [aria-label="Play"]')
    check('and Play plays', await until(() => sp.player?.playing === true, 4000))
    await page.click('.sp-now [aria-label="Close"]')

    // ---- A followed playlist (Spotify won't list its songs any more) ----
    await page.click('.sp-back').catch(() => {})
    await page.click('.sp-nav button:has-text("Your Library")')
    await page.waitForSelector('.sp-row.collection:has-text("Today")', { timeout: 5000 })
    await page.click('.sp-row.collection:has-text("Today")')
    check('followed playlists say why songs aren’t listed', await page.waitForSelector('.sp-empty:has-text("playlists you made")', { timeout: 5000 }).then(() => true, () => false))
    await page.click('.sp-actions .sp-play')
    check('and still play', await until(() => sp.lastPlay?.context_uri === 'spotify:playlist:p3', 4000))
    await page.click('.sp-back')

    // ---- Liked Songs ----
    await page.click('.sp-row.collection:has-text("Liked Songs")')
    await page.waitForSelector('.sp-collection .sp-row', { timeout: 5000 })
    const liked = await page.$$eval('.sp-collection .sp-row-title', (e) => e.map((x) => x.textContent))
    check('Liked Songs lists what you saved', liked.includes('Los Angeles') && liked.includes('Tidal'), liked.join(', '))

    // ---- Search ----
    await page.click('.sp-nav button:has-text("Search")')
    await page.fill('.sp-searchbox input', 'blue')
    await page.waitForSelector('.sp-search .sp-row', { timeout: 5000 })
    const found = await page.$$eval('.sp-search .sp-row-title', (e) => e.map((x) => x.textContent))
    check('search finds songs', found.join() === 'Tidal,Undertow', found.join())
    check('and albums / artists', (await page.$$eval('.sp-search .sp-card-title', (e) => e.map((x) => x.textContent))).includes('Oceans'))
    check('asking for at most 10 results (Spotify’s limit for personal apps)', sp.log.some((l) => /\/v1\/search\?.*limit=10/.test(l)))
    await shot('04-search')

    // ---- No device anywhere: use the Spotify app on this computer ----
    sp.devices = false
    sp.activeDevice = false
    sp.player = null
    await page.click('.sp-search .sp-row:has-text("Undertow")')
    check('with no device it asks the Spotify app here to play', await until(() => playerOut.includes('OPENURI spotify:track:t5'), 5000))

    // ---- Free accounts can't control playback ----
    sp.devices = true
    sp.premium = false
    await page.click('.sp-search .sp-row:has-text("Tidal")')
    check('without Premium it says so', await page.waitForSelector('.sp-error.toast:has-text("Premium")', { timeout: 5000 }).then(() => true, () => false))
    sp.premium = true

    // ---- The pop-out card while Spotify plays ----
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
    await page.waitForSelector('.hub', { state: 'detached', timeout: 5000 })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:hover', true))
    check('the Now Playing card uses Spotify’s look while Spotify plays', await page.waitForSelector('.card.media.spotify:has-text("Spotify")', { timeout: 6000 }).then(() => true, () => false))
    await sleep(350)
    await shot('05-media-card')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:hover', false))

    // ---- Spotify isn't open anywhere: pick a device or the Web Player ----
    player.kill()
    await sleep(800)
    sp.devices = false
    sp.activeDevice = false
    sp.player = null
    await openMusic()
    await page.click('.sp-nav button:has-text("Search")')
    await page.fill('.sp-searchbox input', 'blue')
    await page.waitForSelector('.sp-search .sp-row', { timeout: 5000 })
    await page.click('.sp-search .sp-row:has-text("Undertow")')
    check('with nothing open it offers “Connect to a device”', await page.waitForSelector('.sp-sheet:has-text("Nothing is playing")', { timeout: 6000 }).then(() => true, () => false))
    check('including the Web Player', (await page.$$('.sp-sheet .sp-device-row.web')).length === 1)
    sp.phone = true // Spotify opened on the phone
    check('a phone shows up as soon as Spotify opens on it', await page.waitForSelector('.sp-sheet .sp-device-row:has-text("Pixel 8")', { timeout: 6000 }).then(() => true, () => false))
    await shot('06-devices')
    await page.click('.sp-sheet .sp-device-row.web')
    check('“Play in your browser” opens the song in the Web Player', await until(() => sp.webPages?.includes('/track/t5'), 5000), JSON.stringify(sp.webPages))
    check('and plays it there once the Web Player connects', await until(() => sp.lastPlay?.device === 'web1' && sp.lastPlay?.uris?.[0] === 'spotify:track:t5', 8000), JSON.stringify(sp.lastPlay))
    check('the sheet closes', await page.waitForSelector('.sp-sheet', { state: 'detached', timeout: 5000 }).then(() => true, () => false))
    await page.waitForSelector('.sp-mini-device:has-text("Web Player")', { timeout: 6000 }).catch(() => {})
    await page.click('.sp-mini [aria-label="Connect to a device"]')
    await page.waitForSelector('.sp-sheet .sp-device-row.current:has-text("Web Player")', { timeout: 5000 }).catch(() => {})
    await page.click('.sp-sheet .sp-device-row:has-text("Pixel 8")')
    check('playback can move to another device', await until(() => sp.transfers?.includes('ph1') && sp.activeId === 'ph1', 5000), JSON.stringify(sp.transfers))

    // ---- Restart: still signed in; an expired token is refreshed ----
    await app.close()
    sp.token = /^Bearer at-2$/ // the old access token no longer works
    app = await launch()
    app.process().stderr.on('data', (d) => logs.push(d.toString()))
    page = await app.firstWindow()
    await sleep(1500)
    await openMusic()
    check('after a restart you are still signed in', await page.waitForSelector('.sp-home', { timeout: 8000 }).then(() => true, () => false))
    check('and the expired token was refreshed', sp.log.includes('POST /api/token') && sp.log.filter((l) => l === 'POST /api/token').length >= 2)
  } catch (e) {
    check('unexpected error', false, e.message)
    await shot('99-failure')
  }

  await app.close().catch(() => {})
  player.kill()
  await sp.close()
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|Unhandled|TypeError|ReferenceError/i.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
