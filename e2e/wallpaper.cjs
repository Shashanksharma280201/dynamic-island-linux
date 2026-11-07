// End-to-end test of the wallpaper, against stand-in photo sites and a
// stand-in gsettings: Settings searches and sets a photo (downloaded, set as
// the GNOME background), an animation draws live behind everything with a
// still set underneath, a video plays live, Previous and the desktop's own
// put things back, and asking the assistant "set my background to …" does it
// too. Needs an X server and a session bus (see npm run test:e2e), and ffmpeg
// to make the test photo and video.
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-wall-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const WALLS = path.join(TMP, 'walls')
const FILES = path.join(TMP, 'files')
const GS_LOG = path.join(TMP, 'gsettings.log')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
for (const d of [OUT, USER_DATA, FILES]) fs.mkdirSync(d, { recursive: true })

// The test photo and video.
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args])
ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080', '-frames:v', '1', path.join(FILES, 'mist.jpg')])
ff(['-f', 'lavfi', '-i', 'testsrc2=size=320x180', '-frames:v', '1', path.join(FILES, 'mist-thumb.jpg')])
ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-t', '3', '-c:v', 'libvpx', '-b:v', '600k', path.join(FILES, 'waves.webm')])

// A stand-in gsettings: logs what's set, answers what's asked.
const GS = path.join(TMP, 'gsettings')
fs.writeFileSync(
  GS,
  `#!/bin/sh\necho "$@" >> ${JSON.stringify(GS_LOG)}\nif [ "$1" = get ]; then echo "'file:///usr/share/backgrounds/warty-final-ubuntu.png'"; fi\n`,
  { mode: 0o755 },
)

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const seen = (page, sel, ms = 8000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const until = async (f, ms = 10000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try {
      const v = await f()
      if (v) return v
    } catch {}
  }
  return null
}
const gsLog = () => (fs.existsSync(GS_LOG) ? fs.readFileSync(GS_LOG, 'utf8') : '')
const lastSet = () => gsLog().split('\n').filter((l) => l.startsWith('set org.gnome.desktop.background picture-uri ')).pop() ?? ''

;(async () => {
  // The photo sites.
  let base = ''
  const site = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const json = (o) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(o))
    }
    if (u.pathname.startsWith('/files/')) {
      const f = path.join(FILES, path.basename(u.pathname))
      if (!fs.existsSync(f)) return res.writeHead(404).end()
      res.writeHead(200, { 'content-type': f.endsWith('.webm') ? 'video/webm' : 'image/jpeg', 'content-length': fs.statSync(f).size })
      return fs.createReadStream(f).pipe(res)
    }
    if (u.pathname === '/openverse/v1/images/') {
      return json({
        result_count: 1,
        results: [{ id: 'm1', title: 'Misty mountains at dawn', url: `${base}/files/mist.jpg`, thumbnail: `${base}/files/mist-thumb.jpg`, creator: 'Ana', license: 'by', license_version: '4.0', foreign_landing_url: 'https://example.org/m1', width: 1920, height: 1080 }],
      })
    }
    if (u.pathname === '/wikimedia/w/api.php') {
      if (!/filetype:video/.test(u.searchParams.get('gsrsearch') ?? '')) return json({ query: { pages: [] } })
      return json({ query: { pages: [{ pageid: 5, index: 1, title: 'File:Ocean waves.webm', imageinfo: [{ url: `${base}/files/waves.webm`, thumburl: `${base}/files/mist-thumb.jpg`, width: 1280, height: 720, mime: 'video/webm', duration: 3 }] }] } })
    }
    res.writeHead(404).end()
  })
  await new Promise((r) => site.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${site.address().port}`
  const ai = await startFakeAi()
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ ai: { provider: 'anthropic' }, character: { id: 'bolt', name: 'Sparky' } }))

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: {
      ...process.env,
      DI_USER_DATA: USER_DATA,
      DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
      DI_NO_GREETING: '1',
      DI_BACKDROP: 'off',
      DI_WALL_API: base,
      DI_WALL_DIR: WALLS,
      DI_GSETTINGS: GS,
      XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
      DI_AI_BASE_URL: ai.base,
    },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const wallWindows = () => app.windows().filter((p) => p.url().includes('wallpaper.html'))
  try {
    await page.waitForSelector('.island', { timeout: 15000 })
    await page.evaluate(() => window.island.openSettings('wallpaper'))
    const settings = await until(() => app.windows().find((p) => p.url().includes('settings.html')), 8000)
    await settings.waitForSelector('#wallpaper', { timeout: 8000 })
    await settings.setViewportSize({ width: 900, height: 1500 }).catch(() => {})
    await settings.evaluate(() => document.getElementById('wallpaper')?.scrollIntoView())
    check('Settings has a Wallpaper section, the desktop’s own to start', await seen(settings, '#wallpaper .wall-now:has-text("Your desktop’s own background")'))

    // ---- a photo ----
    await settings.fill('#wallpaper input[aria-label="Search for a wallpaper"]', 'misty mountains')
    await settings.click('#wallpaper .wall-search button:has-text("Search")')
    check('searching shows the photos found', await seen(settings, '#wallpaper .wall-search .wall-tile:has-text("Misty mountains at dawn")'))
    await settings.screenshot({ path: `${OUT}/01-results.png` })
    await settings.click('#wallpaper .wall-search .wall-tile:has-text("Misty mountains at dawn")')
    const photoSet = await until(() => /picture-uri file:\/\/.*misty-mountains-at-dawn-[0-9a-f]{8}\.jpg/.test(lastSet()) && lastSet())
    check('choosing one downloads it and sets it as the GNOME background', !!photoSet, lastSet())
    // Set one after the other, so wait for the second too.
    check('also for dark style', !!(await until(() => /picture-uri-dark file:\/\/.*misty/.test(gsLog()), 5000)))
    {
      const lines = gsLog().split('\n')
      const read = lines.indexOf('get org.gnome.desktop.background picture-uri')
      check('the original was read first, to put back', read >= 0 && read < lines.findIndex((l) => l.startsWith('set org.gnome.desktop.background')))
    }
    check('the file is in the wallpapers folder', fs.readdirSync(WALLS).some((f) => /^misty-mountains-at-dawn-.*\.jpg$/.test(f)))
    check('Settings shows what’s on, with credit', await seen(settings, '#wallpaper .wall-now:has-text("by Ana on Openverse")'))

    // ---- an animation ----
    await settings.click('#wallpaper .wall-block .wall-tile:has-text("Aurora")')
    const anim = await until(() => wallWindows().find((p) => p.url().includes('anim=aurora')))
    check('an animation opens a live wallpaper window', !!anim)
    if (anim) {
      await sleep(1200)
      const lit = await anim.evaluate(() => {
        const c = document.querySelector('canvas')
        const t = document.createElement('canvas')
        t.width = 64
        t.height = 36
        const g = t.getContext('2d')
        g.drawImage(c, 0, 0, 64, 36)
        const d = g.getImageData(0, 0, 64, 36).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
        return sum / (64 * 36)
      })
      check('and it draws', lit > 10, `average ${Math.round(lit)}`)
      await anim.screenshot({ path: `${OUT}/02-aurora.png` }).catch(() => {})
    }
    check('with a still of it set underneath', !!(await until(() => /picture-uri file:\/\/.*\.still\.png/.test(lastSet()))), lastSet())

    // ---- a video ----
    await settings.click('#wallpaper .segmented button:has-text("Videos")')
    await settings.fill('#wallpaper input[aria-label="Search for a wallpaper"]', 'ocean waves')
    await settings.click('#wallpaper .wall-search button:has-text("Search")')
    check('videos can be searched (Wikimedia, no key)', await seen(settings, '#wallpaper .wall-search .wall-tile:has-text("Ocean waves")'))
    await settings.click('#wallpaper .wall-search .wall-tile:has-text("Ocean waves")')
    const vid = await until(() => wallWindows().find((p) => p.url().includes('kind=video')), 15000)
    check('a video plays as a live wallpaper', !!vid && wallWindows().length === 1)
    if (vid) check('it really plays (muted, looping)', !!(await until(() => vid.evaluate(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && !v.paused && v.muted && v.loop }), 10000)))

    // ---- back ----
    await settings.click('#wallpaper button:has-text("Previous")')
    check('Previous puts the animation back', !!(await until(() => wallWindows().some((p) => p.url().includes('anim=aurora')) && wallWindows().length === 1)))
    await settings.click('#wallpaper button:has-text("Desktop’s own")')
    check('the desktop’s own comes back, and live wallpapers stop', !!(await until(() => lastSet() === 'set org.gnome.desktop.background picture-uri file:///usr/share/backgrounds/warty-final-ubuntu.png' && wallWindows().length === 0)), lastSet())

    // ---- asking ----
    await settings.evaluate(() => window.settings.setAiKey('anthropic', 'sk-ant-test-123'))
    const before = lastSet()
    await page.evaluate(() => window.island.claude.ask('set my background to misty mountains'))
    check('asking the assistant sets it too', !!(await until(() => lastSet() !== before && /misty-mountains/.test(lastSet()), 15000)), lastSet())
    const reply = await until(async () => {
      const run = (await page.evaluate(() => window.island.claude.state())).run
      return run?.phase === 'done' && run.reply
    })
    check('and it says what it set', /^Set as the background: Misty mountains at dawn/.test(reply ?? ''), reply)
    await settings.screenshot({ path: `${OUT}/03-settings.png` })
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await app.close().catch(() => {})
    site.close()
    ai.close?.()
    const bad = logs.join('').split('\n').filter((l) => /\[wallpaper\]|Uncaught/i.test(l))
    check('no wallpaper errors in the log', bad.length === 0, bad.slice(0, 3).join(' | '))
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in ${OUT}`)
    process.exit(failed.length ? 1 : 0)
  }
})()
