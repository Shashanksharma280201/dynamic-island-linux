// Records a narrated tour of the island: drives the real app through every
// feature with stand-in services (the e2e fakes) on a virtual screen while
// ffmpeg records it. Run it through scripts/video/make.sh, which also makes the
// narration and adds it with captions. Needs xvfb-run, dbus-run-session,
// xcompmgr and ffmpeg (FFMPEG=path). The scenes and their narration lengths
// come from $VIDEO_DIR/scenes.json, written by narrate.py.
const { _electron } = require('playwright-core')
const { spawn, spawnSync, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const hoodiecrow = require('hoodiecrow-imap')
const { SMTPServer } = require('smtp-server')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const { Document, Packer, Paragraph, TextRun } = require('docx')

const ROOT = path.resolve(__dirname, '../..')
const E2E = path.join(ROOT, 'e2e')
const { startFakeAi } = require(path.join(E2E, 'fake-ai.cjs'))
const { startFakeSpotify } = require(path.join(E2E, 'fake-spotify.cjs'))
const VIDEO_DIR = process.env.VIDEO_DIR || path.join(ROOT, 'video-out')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const SCALE = 2 // a 1280x720 desktop drawn at 2x, recorded at 2560x1440
const W = 1280
const H = 720
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-tour-'))
const USER_DATA = path.join(TMP, 'profile')
const FILES = path.join(TMP, 'Downloads')
const PROJECT = path.join(TMP, 'my-app')
const CLAUDE_DIR = path.join(TMP, 'claude')
const WA_TRIGGER = path.join(TMP, 'wa-go')
const SOCK = path.join(TMP, 'island.sock')
const IMAP_PORT = 22143
const SMTP_PORT = 22025
for (const d of [VIDEO_DIR, USER_DATA, FILES, PROJECT, CLAUDE_DIR]) fs.mkdirSync(d, { recursive: true })

const scenes = JSON.parse(fs.readFileSync(path.join(VIDEO_DIR, 'scenes.json'), 'utf8')) // written by narrate.py, with each narration's length
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms
  while (!(await fn().catch(() => false)) && Date.now() < end) await sleep(100)
  return fn().catch(() => false)
}
const xt = (...a) => execFileSync('node', [path.join(E2E, 'xtest.cjs'), ...a.map((v) => (typeof v === 'number' ? String(Math.round(v * SCALE)) : v))])
const b64 = (s) => Buffer.from(s).toString('base64')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function pdf(pages, prefix) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) doc.addPage().drawText(`${prefix}, page ${i}`, { x: 60, y: 700, size: 20, font })
  return doc.save()
}

;(async () => {
  // ---- stand-in services ----
  const ai = await startFakeAi()
  const sp = await startFakeSpotify()
  const imap = hoodiecrow({
    plugins: ['IDLE', 'UIDPLUS', 'SPECIAL-USE', 'ENABLE'],
    users: { 'me@example.com': { password: 'pw' } },
    storage: {
      INBOX: {
        messages: [
          { raw: 'From: Carol Diaz <carol@example.com>\r\nSubject: Slides for Monday\r\nDate: ' + new Date(Date.now() - 3 * 3600e3).toUTCString() + '\r\n\r\nHere are the slides for Monday.\r\n', flags: ['\\Seen'] },
          { raw: 'From: Team Calendar <calendar@example.com>\r\nSubject: Weekly sync moved to 3 pm\r\nDate: ' + new Date(Date.now() - 26 * 3600e3).toUTCString() + '\r\n\r\nThe weekly sync is now at 3 pm.\r\n', flags: ['\\Seen'] },
        ],
      },
      '': { separator: '/', folders: { Sent: { 'special-use': '\\Sent' } } },
    },
  })
  await new Promise((r) => imap.listen(IMAP_PORT, r))
  const smtp = new SMTPServer({ disabledCommands: ['STARTTLS'], onAuth: (_a, _s, cb) => cb(null, { user: 'me' }), onData: (s, _x, cb) => (s.resume(), s.on('end', () => cb())) })
  await new Promise((r) => smtp.listen(SMTP_PORT, '127.0.0.1', r))

  const player = spawn('node', [path.join(E2E, 'fake-player.cjs')], {
    env: { ...process.env, FAKE_PLAYER_NAME: 'spotify', FAKE_PLAYER_ART: `${sp.base}/img/e8590c.png`, FAKE_PLAYER_TITLES: 'Golden Hour|Midnight Drive', FAKE_PLAYER_ARTIST: 'The Lumens', FAKE_PLAYER_LENGTH: '600' },
  })
  let playerOut = ''
  player.stdout.on('data', (d) => (playerOut += d))
  await until(async () => playerOut.includes('READY'), 5000)

  // ---- files for Documents and the CRM ----
  fs.writeFileSync(path.join(FILES, 'Invoice March.pdf'), await pdf(2, 'Invoice March'))
  fs.writeFileSync(path.join(FILES, 'Invoice April.pdf'), await pdf(3, 'Invoice April'))
  const contract = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun('The tenant shall pay teh rent on the first day of each month, and recieve a receipt.')] })] }],
  })
  fs.writeFileSync(path.join(FILES, 'Contract.docx'), await Packer.toBuffer(contract))
  const csv = path.join(FILES, 'contacts.csv')
  fs.writeFileSync(
    csv,
    'Name,Company,Title,Email,Phone\nPriya Nair,Acme,Head of Design,priya@acme.com,+91 98765 43210\nDaniel Kim,Northwind,CTO,daniel@northwind.io,+1 415 555 0134\nSofia Rossi,Bluebird,Founder,sofia@bluebird.co,+39 333 123 4567\nLiam Walsh,Contoso,Buyer,liam@contoso.com,+44 20 7946 0958\n',
  )
  fs.writeFileSync(path.join(PROJECT, 'README.md'), '# My app\n')
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({
      notifications: true,
      whatsapp: true,
      dock: { side: 'right', y: 0.32 },
      character: { id: 'orbit', name: 'Nova' },
      ai: { provider: 'anthropic', keys: { anthropic: 'plain:' + b64('sk-ant-demo') } },
      claude: { cwd: PROJECT, sttModel: 'tiny' },
      mail: [{ id: 'acc1', label: 'Work', user: 'me@example.com', name: 'Alex Morgan', imap: { host: '127.0.0.1', port: IMAP_PORT, secure: false }, smtp: { host: '127.0.0.1', port: SMTP_PORT, secure: false }, secret: 'plain:' + b64('pw') }],
    }),
  )

  // ---- the desktop behind the island ----
  // A compositor, as on any real desktop, so the island's transparent window is see-through.
  const compositor = spawn('xcompmgr', ['-n'], { stdio: 'ignore' })
  compositor.on('error', () => log('xcompmgr not found: transparent areas will show black'))
  await sleep(500)
  const backdrop = await _electron.launch({ executablePath: ELECTRON, args: [path.join(__dirname, 'desktop-app.cjs'), '--no-sandbox', `--force-device-scale-factor=${SCALE}`] })
  const desk = await backdrop.firstWindow()
  await desk.waitForLoadState()
  await sleep(800)

  // ---- the island ----
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', `--force-device-scale-factor=${SCALE}`],
    cwd: ROOT,
    env: {
      ...process.env,
      HOME: TMP,
      DI_USER_DATA: USER_DATA,
      DYNAMIC_ISLAND_SOCK: SOCK,
      DI_BACKDROP: 'off',
      DI_AI_BASE_URL: ai.base,
      DI_WHATSAPP_ENGINE: 'fake',
      DI_FAKE_WA_READY_MS: '300',
      DI_FAKE_WA_TRIGGER: WA_TRIGGER,
      DI_DEMO_LOG: path.join(TMP, 'wa.log'),
      DI_DOWNLOADS: FILES,
      DI_DOCS_OUT: path.join(TMP, 'Documents', 'Dynamic Island'),
      DI_DOCS_PICK: ['Invoice March.pdf', 'Invoice April.pdf', 'Contract.docx'].map((f) => path.join(FILES, f)).join('\n'),
      DI_CRM_PICK: csv,
      DI_NO_OPEN: '1',
      DI_SOFFICE: '',
      DI_SPOTIFY_ACCOUNTS: sp.base,
      DI_SPOTIFY_API: `${sp.base}/v1`,
      DI_SPOTIFY_NO_BROWSER: '1',
      DI_SPOTIFY_WEB: sp.base,
      DI_SPOTIFY_APP: '',
      DI_CLAUDE_BIN: path.join(E2E, 'fake-claude.cjs'),
      CLAUDE_CONFIG_DIR: CLAUDE_DIR,
    },
  })
  app.process().stderr.on('data', (d) => process.env.TOUR_VERBOSE && process.stderr.write(d))
  const page = await app.firstWindow()
  const send = (ch) => app.evaluate(({ BrowserWindow }, ch) => BrowserWindow.getAllWindows()[0].webContents.send(ch), ch)
  const panelOpen = async (open) => {
    if (!!(await page.$('.hub')) !== open) await send('island:toggle-panel')
    await page.waitForSelector('.hub', { state: open ? 'visible' : 'detached', timeout: 5000 }).catch(() => {})
  }
  const winPos = () => page.evaluate(() => ({ x: window.screenX, y: window.screenY }))

  /** A soft ring where the click lands, so viewers can follow. */
  const ring = (p, x, y) =>
    p.evaluate(
      ([x, y]) => {
        const d = document.createElement('div')
        d.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.9);z-index:2147483647;pointer-events:none;transition:transform .45s ease,opacity .45s ease;transform:scale(.5)`
        document.body.appendChild(d)
        requestAnimationFrame(() => (d.style.transform = 'scale(1.2)'))
        setTimeout(() => (d.style.opacity = '0'), 380)
        setTimeout(() => d.remove(), 900)
      },
      [x, y],
    )
  const tap = async (sel, p = page) => {
    const el = await p.waitForSelector(sel, { timeout: 6000 })
    await el.scrollIntoViewIfNeeded().catch(() => {})
    const b = await el.boundingBox()
    if (b) {
      await ring(p, b.x + b.width / 2, b.y + b.height / 2)
      await sleep(320)
    }
    await el.click()
    await sleep(250)
  }
  const type = async (sel, text, p = page) => {
    await tap(sel, p)
    await p.keyboard.type(text, { delay: 55 })
  }
  const capsuleCentre = async () => {
    const w = await winPos()
    const b = await page.evaluate(() => {
      const r = document.querySelector('.island-outer').getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    return { x: w.x + b.x, y: w.y + b.y }
  }
  /** Settings opens beside the chapter title, like a normal window would. */
  const openSettings = async (section) => {
    const [s] = await Promise.all([app.waitForEvent('window'), page.evaluate((x) => window.island.openSettings(x), section)])
    await s.waitForLoadState('domcontentloaded')
    await until(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('settings'))), 5000)
    await app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('settings')).setBounds(b), { x: 640, y: 24, width: 560, height: H - 48 })
    return s
  }
  const view = () => page.evaluate(() => window.island.claude.state())
  const agentDone = () => until(async () => ['done', 'error', 'stopped'].includes((await view()).run?.phase), 12000)

  // ---- not filmed: connect Spotify, then settle ----
  await page.waitForSelector('.capsule', { timeout: 15000 })
  {
    const [s] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('spotify'))])
    await s.waitForSelector('#spotify input', { timeout: 8000 })
    await s.fill('#spotify input', 'abc123client')
    await s.click('#spotify button:has-text("Use Client ID")')
    await s.waitForSelector('#spotify button:has-text("Connect"):not([disabled])', { timeout: 5000 }).catch(async (e) => {
      await s.screenshot({ path: path.join(VIDEO_DIR, 'debug-spotify.png') })
      fs.writeFileSync(path.join(VIDEO_DIR, 'debug-spotify.txt'), await s.textContent('#spotify'))
      throw e
    })
    await s.click('#spotify button:has-text("Connect")')
    await s.waitForSelector('#spotify:has-text("Connected as")', { timeout: 10000 }).catch(() => log('spotify connect failed'))
    await s.close()
  }
  xt(W - 300, H - 60)
  await sleep(2500)

  // ---- record ----
  const recFile = path.join(VIDEO_DIR, 'screen.mkv')
  const rec = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${W * SCALE}x${H * SCALE}`, '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', recFile], { stdio: ['pipe', 'inherit', 'inherit'] })
  const t0 = Date.now() // the video's first frame, give or take ffmpeg's start-up
  await sleep(1000)
  const timeline = []
  let n = 0

  const scene = async (id, act) => {
    const s = scenes.find((x) => x.id === id)
    const start = (Date.now() - t0) / 1000
    n++
    await desk.evaluate((o) => window.show(o), { step: id === 'intro' || id === 'install' ? '' : `${String(n - 1).padStart(2, '0')}`, title: s.title, sub: s.sub, intro: id === 'intro', install: id === 'install' })
    const minEnd = Date.now() + (s.dur + 1.6) * 1000
    log('scene', id)
    try {
      await act()
    } catch (e) {
      log(`scene ${id} hiccup:`, e.message.split('\n')[0])
    }
    const left = minEnd - Date.now()
    if (left > 0) await sleep(left)
    timeline.push({ id, start, end: (Date.now() - t0) / 1000 })
  }

  await scene('intro', async () => {
    await sleep(2000)
  })

  /** Drags the capsule to (x, y), checking where it landed and trying again if it didn't. */
  const dragTo = async (x, y, near) => {
    for (let i = 0; i < 3; i++) {
      const c = await capsuleCentre()
      xt('drag', c.x, c.y, x, y, '40')
      xt(W / 2, H - 60)
      await sleep(1200)
      if (near(await capsuleCentre())) return
    }
    log('capsule did not reach', x, y)
  }

  await scene('capsule', async () => {
    await sleep(2200)
    await dragTo(W / 2, 40, (c) => c.y < 80)
    await sleep(2300)
    await dragTo(40, H * 0.32, (c) => c.x < W / 3)
    await sleep(1800)
    await dragTo(W - 20, H * 0.32, (c) => c.x > (W * 2) / 3)
  })

  await scene('music', async () => {
    await sleep(1500)
    const c = await capsuleCentre()
    xt(c.x, c.y)
    await page.waitForSelector('.card.media', { timeout: 4000 })
    await sleep(2200)
    await tap('button[title="Pause"]')
    await sleep(900)
    await tap('button[title="Play"]')
    await sleep(900)
    await tap('button[title="Next"]')
    await sleep(1400)
    await tap('button[title="Shuffle off"]').catch(() => {})
    await sleep(700)
    const bar = await page.$('.progress .bar.seekable')
    if (bar) {
      const b = await bar.boundingBox()
      await ring(page, b.x + b.width * 0.6, b.y + b.height / 2)
      await page.mouse.click(b.x + b.width * 0.6, b.y + b.height / 2)
    }
    await sleep(1500)
    xt(W - 300, H - 60)
  })

  await scene('whatsapp', async () => {
    fs.writeFileSync(WA_TRIGGER, 'go')
    await page.waitForSelector('.card.message.whatsapp', { timeout: 10000 })
    await until(async () => (await page.$$('.card.message .line')).length >= 2, 4000)
    await sleep(1200)
    await tap('.card.message .reply-btn')
    await page.waitForSelector('.reply textarea', { timeout: 3000 })
    await page.keyboard.type('Yes! See you at 1 🙂', { delay: 70 })
    await sleep(500)
    await page.keyboard.press('Enter')
  })

  await scene('mail', async () => {
    await page.waitForSelector('.card.message', { state: 'detached', timeout: 15000 }).catch(() => {})
    imap.appendMessage('INBOX', [], false, 'From: Priya Nair <priya@acme.com>\r\nSubject: Design review tomorrow?\r\nMessage-ID: <dr1@acme.com>\r\nDate: ' + new Date().toUTCString() + '\r\n\r\nHi Alex, can we move the design review to 11?\r\n')
    await page.waitForSelector('.card.message .subject', { timeout: 15000 })
    await sleep(1500)
    await tap('.card.message .reply-btn')
    await page.waitForSelector('.reply textarea', { timeout: 3000 })
    await page.keyboard.type('11 works for me. See you then!', { delay: 60 })
    await sleep(400)
    await page.keyboard.press('Enter')
  })

  await scene('panel', async () => {
    await page.waitForSelector('.card.message', { state: 'detached', timeout: 10000 }).catch(() => {})
    await sleep(800)
    const c = await capsuleCentre()
    await ring(page, c.x - (await winPos()).x, c.y - (await winPos()).y)
    await panelOpen(true)
    await tap('.rail-btn[aria-label="Controls"]')
    await sleep(2500)
  })

  await scene('chats', async () => {
    await tap('.rail-btn[aria-label="Chats"]')
    await page.waitForSelector('.chat-row', { timeout: 6000 })
    await sleep(800)
    await tap('.chat-row:has-text("Ananya")')
    await sleep(2600)
    await tap('.back')
    await tap('.rail-btn[aria-label="Mail"]')
    await sleep(1600)
    await tap('.rail-btn[aria-label="Notes"]')
    await tap('.new-note')
    await page.waitForSelector('.note-editor', { timeout: 3000 })
    await sleep(500)
    await page.click('.note-editor')
    await page.keyboard.type('Call the dentist on Friday', { delay: 55 })
  })

  await scene('assistant', async () => {
    await tap('.rail-btn[aria-label="Claude"]')
    await type('.claude-field textarea', 'remember to buy oat milk')
    await page.keyboard.press('Enter')
    await agentDone()
    await sleep(1400)
    await type('.claude-field textarea', 'tell Alice I am running late')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.card.agent-ask', { timeout: 8000 })
    await sleep(2600)
    await tap('.agent-ask button.allow')
    await agentDone()
    await panelOpen(true)
  })

  await scene('settings', async () => {
    await panelOpen(false)
    const s = await openSettings('character')
    await s.waitForSelector('#character .character-tile', { timeout: 6000 })
    await sleep(1200)
    await tap('#character .character-tile:has-text("Bolt")', s)
    await sleep(1600)
    await tap('#character .character-tile:has-text("Orbit")', s)
    await sleep(800)
    await s.evaluate(() => document.getElementById('ai')?.scrollIntoView({ behavior: 'smooth' }))
    await sleep(2600)
    await s.evaluate(() => document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' }))
    await sleep(3000)
    await s.close()
  })

  await scene('docs', async () => {
    await panelOpen(true)
    await tap('.rail-btn[aria-label="Documents"]')
    await tap('.docs-view .empty button:has-text("Add Files")')
    await until(async () => (await page.$$('.doc-row')).length === 3, 6000)
    await sleep(600)
    const rows = await page.$$eval('.doc-row', (r) => r.map((x) => ({ name: x.getAttribute('data-doc'), on: x.getAttribute('aria-pressed') === 'true' })))
    for (const r of rows) if (r.on !== r.name.endsWith('.pdf')) await tap(`.doc-row[data-doc="${r.name}"]`)
    await tap('.doc-actions .chip:has-text("Merge 2 PDFs")')
    await sleep(2200)
    const now = await page.$$eval('.doc-row', (r) => r.map((x) => ({ name: x.getAttribute('data-doc'), on: x.getAttribute('aria-pressed') === 'true' })))
    for (const r of now) if (r.on !== (r.name === 'Contract.docx')) await tap(`.doc-row[data-doc="${r.name}"]`)
    await tap('.chip.idea:has-text("Fix spelling and grammar")')
    await page.waitForSelector('.ask-run-files .chip', { timeout: 12000 })
    await sleep(1500)
  })

  await scene('crm', async () => {
    await tap('.rail-btn[aria-label="CRM"]')
    await tap('.crm-head [aria-label="More"]')
    await tap('.crm-menu-item:has-text("Import contacts")')
    await page.waitForSelector('.crm-person', { timeout: 6000 })
    await sleep(1500)
    await type('.crm-ask textarea', 'log a call with Priya about the proposal and remind me to follow up')
    await page.keyboard.press('Enter')
    await agentDone()
    await sleep(1200)
    await tap('.crm-tabs button:has-text("Follow-ups")')
    await sleep(2200)
    await tap('.crm-tabs button:has-text("People")')
  })

  await scene('spotify', async () => {
    await tap('.rail-btn[aria-label="Music"]')
    await page.waitForSelector('.sp-tile', { timeout: 8000 })
    await sleep(1200)
    await tap('.sp-tile:has-text("Road Trip")')
    await sleep(1500)
    await tap('.sp-row:has-text("Tidal")').catch(() => {})
    await sleep(2000)
  })

  await scene('claude', async () => {
    // Plan limits arrive from Claude Code's status line.
    spawnSync('node', [path.join(ROOT, 'hook/claude-island-status.cjs')], {
      input: JSON.stringify({ model: { display_name: 'Opus 5' }, rate_limits: { five_hour: { used_percentage: 46, resets_at: Math.floor(Date.now() / 1000) + 7800 }, seven_day: { used_percentage: 23, resets_at: Math.floor(Date.now() / 1000) + 3 * 86400 } } }),
      env: { ...process.env, DYNAMIC_ISLAND_SOCK: SOCK, CLAUDE_CONFIG_DIR: CLAUDE_DIR },
    })
    const s = await openSettings('ai')
    await s.waitForSelector('#ai select', { timeout: 6000 })
    await s.selectOption('#ai select', 'claude-code')
    await sleep(900)
    await s.close()
    await panelOpen(true)
    await tap('.rail-btn[aria-label="Claude"]')
    await page.waitForSelector('.claude-head .large-title:text("Claude")', { timeout: 6000 })
    await type('.claude-field textarea', 'clean the build folder, this needs approval')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.card.approval', { timeout: 10000 })
    await sleep(2400)
    await tap('.card.approval button.allow')
    await sleep(2500)
  })

  await scene('install', async () => {
    player.kill() // the music ends, so the capsule rests while the commands show
    await panelOpen(false)
    for (const x of await page.$$('.card .close-btn')) await x.click().catch(() => {})
    xt(W / 2, H - 60)
    await page.waitForSelector('.card', { state: 'detached', timeout: 8000 }).catch(() => {})
  })

  await sleep(1500)
  rec.stdin.write('q')
  await new Promise((r) => rec.on('close', r))
  fs.writeFileSync(path.join(VIDEO_DIR, 'timeline.json'), JSON.stringify(timeline, null, 1))
  log('recorded', timeline.length, 'scenes')
  await app.close().catch(() => {})
  await backdrop.close().catch(() => {})
  player.kill()
  compositor.kill()
  imap.close?.()
  smtp.close()
  ai.close()
  sp.close?.()
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
