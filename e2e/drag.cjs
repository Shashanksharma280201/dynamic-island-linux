// End-to-end test of drag actions in the real Electron app, with real drag
// and drop (XDND) from another app: hold a dragged file still and the ring
// opens under the pointer; let go on an action and it runs, with the result
// on the island. Needs X11 (xvfb-run) and a session bus.
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const zlib = require('zlib')
const { spawn } = require('child_process')
const { PDFDocument, StandardFonts } = require('pdf-lib')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-drag-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const FILES = path.join(TMP, 'files')
const HOME = path.join(TMP, 'home')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
// E2E_SCALE=2 simulates a HiDPI display (X11 pointer coords are physical px):
// give it a screen big enough for the ring (xvfb-run -s "-screen 0 3840x2160x24").
const SCALE = Number(process.env.E2E_SCALE) || 1
const SCALE_ARGS = SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : []
const px = (v) => Math.round(v * SCALE)
for (const d of [OUT, USER_DATA, FILES, HOME]) fs.mkdirSync(d, { recursive: true })

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

// A small PNG, made here (no image library needed).
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  const rows = []
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4)
    for (let x = 0; x < w; x++) row.set([(x * 255) / w, (y * 255) / h, 160, 255], 1 + x * 4)
    rows.push(row)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

// Where the ring's actions are: degrees clockwise from up, around its middle.
const at = (c, deg, r) => [Math.round(c[0] + r * Math.sin((deg * Math.PI) / 180)), Math.round(c[1] - r * Math.cos((deg * Math.PI) / 180))]
const SLOT = { convert: 0, edit: 60, capture: 120, ask: 180, shrink: 240, text: 300 }

;(async () => {
  const photo = path.join(FILES, 'Photo.png')
  fs.writeFileSync(photo, png(64, 48))
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage().drawText('Quarterly numbers look good', { x: 60, y: 700, size: 20, font })
  const report = path.join(FILES, 'Report.pdf')
  fs.writeFileSync(report, await doc.save())

  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'right', y: 0.3 } }))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...SCALE_ARGS],
    cwd: ROOT,
    env: {
      ...process.env,
      HOME,
      DI_USER_DATA: USER_DATA,
      DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
      DI_BACKDROP: 'off',
      DI_SOFFICE: '',
      // No assistant here: Ask and Edit say so instead of running.
      DI_CLAUDE_BIN: path.join(TMP, 'no-claude'),
    },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  app.process().stdout.on('data', (d) => logs.push(d.toString()))
  app.process().on('exit', (code, signal) => logs.push(`[test] the app exited (code ${code}, signal ${signal})\n`))
  const page = await app.firstWindow()
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {})
  const ringWin = () => app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Drag actions')
    return w ? { visible: w.isVisible(), bounds: w.getBounds() } : null
  })
  let ring = null
  const ringPage = async () => {
    if (ring) return ring
    await until(async () => app.windows().some((w) => w.url().includes('ring.html')), 8000)
    ring = app.windows().find((w) => w.url().includes('ring.html')) ?? null
    return ring
  }
  // What the ring shows right now, for the timeline below.
  let silent = 0
  const ringState = async () => {
    const p = await ringPage()
    if (!p) return null
    // A page that doesn't answer shouldn't stop the test: note it and carry on.
    let answered = false
    const late = sleep(2000).then(() => {
      if (!answered) silent++
      return null
    })
    const asked = p
      .evaluate(() => ({
        phase: document.querySelector('.stage')?.getAttribute('data-phase') ?? 'none',
        title: document.querySelector('.hub-name')?.textContent ?? '',
        lit: document.querySelector('.seg-label[data-on="true"]')?.getAttribute('data-slot') ?? '',
        off: [...document.querySelectorAll('.seg-label.off')].map((e) => e.getAttribute('data-slot')),
        chips: [...document.querySelectorAll('.chip')].map((e) => e.getAttribute('data-choice') + (e.classList.contains('on') ? '*' : '')),
        caption: document.querySelector('[data-caption]')?.textContent ?? '',
      }))
      .catch(() => null)
      .finally(() => (answered = true))
    return Promise.race([asked, late])
  }

  /**
   * Drag `file` out of a stand-in file manager and follow `moves` (xtest
   * gesture tokens). Resolves with what the ring showed at each step.
   * `shots`: { 'tok#n': name } screenshots of the ring just after those steps.
   */
  const dragWith = async (file, moves, shots = {}) => {
    const source = spawn(ELECTRON, [path.join(__dirname, 'drag-source.cjs'), '--no-sandbox', ...SCALE_ARGS], { env: { ...process.env, HOME, DRAG_FILE: file } })
    let said = ''
    source.stdout.on('data', (d) => (said += d))
    await until(() => said.includes('ready'), 15000)
    await sleep(300)
    // Press on the file, pull it out (Chromium starts the drag once it moves), then the moves.
    const tokens = ['move:150:460', 'down', 'wait:120', 'move:190:470:4', 'move:300:520:6', ...moves, 'wait:150', 'up', 'wait:300']
    // Moves are in screen units here; the pointer moves in physical pixels.
    const physical = tokens.map((t) => (t.startsWith('move:') ? t.replace(/^move:(\d+):(\d+)/, (_m, x, y) => `move:${px(x)}:${px(y)}`) : t))
    const g = spawn('node', [path.join(__dirname, 'xtest.cjs'), 'gesture', ...physical])
    const seenAt = {}
    let out = ''
    let finished = false
    g.stdout.on('data', (d) => (out += d))
    g.on('exit', () => (finished = true))
    let last = null
    while (!finished) {
      last = (await ringState()) ?? last
      for (const m of out.matchAll(/step (\d+) (\S+)/g)) {
        if (seenAt[m[1]]) continue
        seenAt[m[1]] = { tok: m[2], ring: last }
        const name = shots[`${m[2]}#${Object.values(seenAt).filter((x) => x.tok === m[2]).length}`]
        if (name && ring) await shot(ring, name)
      }
      await sleep(40)
    }
    for (const m of out.matchAll(/step (\d+) (\S+)/g)) if (!seenAt[m[1]]) seenAt[m[1]] = { tok: m[2], ring: last }
    source.kill()
    return { steps: Object.values(seenAt), said, dragging: said.includes('dragging') }
  }
  /** The ring just after the step that ran `tok` (the n-th time): put a pause after it, so it's read standing still. */
  const stateAt = (r, tok, n = 1) => r.steps.filter((s) => s.tok === tok)[n - 1]?.ring ?? null

  try {
    await sleep(1500)
    check('the ring page is loaded and waiting, out of sight', !!(await ringPage()) && (await ringWin())?.visible === false, JSON.stringify(await ringWin()))

    // ---- Convert a picture: hold still, go to Convert, pick JPG, let go ----
    const C = [700, 500]
    const conv = at(C, SLOT.convert, 105)
    const jpg = at(C, -27, 216) // first of PNG's three: JPG, WebP, PDF
    let r = await dragWith(photo, [`move:${C[0]}:${C[1]}:10`, 'wait:1000', 'wait:500', 'wait:300', `move:${conv[0]}:${conv[1]}:6`, 'wait:500', 'wait:300', `move:${jpg[0]}:${jpg[1]}:8`, 'wait:500', 'wait:300'], { 'wait:500#1': '10-ring-open', 'wait:500#2': '11-ring-convert', 'wait:500#3': '12-ring-jpg' })
    const bloomed = stateAt(r, 'wait:500')
    check('a dragged file held still opens the ring', bloomed?.phase === 'open', JSON.stringify(bloomed) + (r.dragging ? '' : ' (the drag never started)'))
    check('the middle says Cancel under the pointer', bloomed?.caption === 'Let go here to cancel', bloomed?.caption)
    check('a picture can’t be edited or have text copied yet', ['edit', 'text'].every((s) => bloomed?.off.includes(s)) && !bloomed?.off.includes('convert'), JSON.stringify(bloomed?.off))
    const onConvert = stateAt(r, 'wait:500', 2)
    check('it names the file’s type in the middle', onConvert?.title === 'PNG', onConvert?.title)
    check('over Convert, the formats fan out', onConvert?.lit === 'convert' && onConvert.chips.map((c) => c.replace('*', '')).join() === 'jpg,webp,pdf', JSON.stringify(onConvert))
    const onJpg = stateAt(r, 'wait:500', 3)
    check('and the one under the pointer lights up', onJpg?.chips.includes('jpg*'), JSON.stringify(onJpg))
    const made = path.join(FILES, 'Photo.jpg')
    check('letting go on JPG saves a JPEG next to the original', await until(() => fs.existsSync(made), 8000) && fs.readFileSync(made).subarray(0, 2).toString('hex') === 'ffd8', fs.readdirSync(FILES).join(', '))
    check('the original is untouched', fs.readFileSync(photo).equals(png(64, 48)))
    check('the ring folds away', await until(async () => (await ringWin())?.visible === false, 3000))
    check('the island shows what it made', await page.waitForSelector('.card.job[data-job="done"]', { timeout: 6000 }).then(() => true, () => false))
    const card = await page.textContent('.card.job').catch(() => '')
    check('named, with Open, Show in folder and Undo', card.includes('Converted to JPEG') && card.includes('Photo.jpg') && card.includes('Open') && card.includes('Show in folder') && card.includes('Undo'), card)
    await shot(page, '01-converted')
    await page.click('.card.job .plain:has-text("Undo")')
    check('Undo moves what it made to the trash', await until(() => !fs.existsSync(made), 5000) && fs.existsSync(path.join(HOME, '.local/share/Trash/files/Photo.jpg')))
    check('and the card goes', await until(async () => !(await page.$('.card.job')), 4000))

    // ---- Copy a PDF's text ----
    const text = at(C, SLOT.text, 105)
    r = await dragWith(report, [`move:${C[0]}:${C[1]}:10`, 'wait:1000', 'wait:400', 'wait:300', `move:${text[0]}:${text[1]}:6`, 'wait:500', 'wait:300'], { 'wait:500#1': '13-ring-text' })
    const onText = stateAt(r, 'wait:500')
    check('a PDF opens it too, and Copy text lights up', onText?.title === 'PDF' && onText?.lit === 'text', JSON.stringify(onText))
    check('letting go on Copy text puts the text on the clipboard', await until(async () => (await app.evaluate(({ clipboard }) => clipboard.readText())).includes('Quarterly numbers look good'), 6000))
    check('and the island says so', await page.waitForSelector('.card.job:has-text("Text copied")', { timeout: 5000 }).then(() => true, () => false))
    await shot(page, '02-copied')

    // ---- Ask needs an assistant ----
    check('without an assistant, Ask is off', stateAt(r, 'wait:400')?.off.includes('ask'), JSON.stringify(stateAt(r, 'wait:400')?.off))

    // ---- Moving away closes it; the drag goes on ----
    const before = fs.readdirSync(FILES).sort().join()
    r = await dragWith(report, [`move:${C[0]}:${C[1]}:10`, 'wait:1000', 'wait:400', 'wait:300', 'move:1300:520:12', 'wait:500'])
    check('moving far from the ring closes it', stateAt(r, 'wait:400')?.phase === 'open' && (await until(async () => (await ringWin())?.visible === false, 3000)), JSON.stringify(stateAt(r, 'wait:500')))
    check('and letting go elsewhere does nothing', fs.readdirSync(FILES).sort().join() === before)

    // ---- The middle cancels ----
    r = await dragWith(report, [`move:${C[0]}:${C[1]}:10`, 'wait:1000', 'wait:400', 'wait:300', `move:${C[0] + 8}:${C[1] + 6}:3`, 'wait:400', 'wait:300'])
    check('letting go in the middle cancels', stateAt(r, 'wait:400', 2)?.phase === 'open' && (await until(async () => (await ringWin())?.visible === false, 3000)) && fs.readdirSync(FILES).sort().join() === before)

    // ---- Over the island the ring stays shut: the file drops into Documents ----
    await page.evaluate(() => document.querySelectorAll('.card.job .close-btn').forEach((b) => b.click()))
    await until(async () => !!(await page.$('.capsule.idle')), 15000)
    await sleep(600)
    const win = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    const box = await page.evaluate(() => {
      const b = document.querySelector('.island-outer > .island').getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    })
    const isl = [Math.round(win.x + box.x), Math.round(win.y + box.y)]
    r = await dragWith(report, [`move:${isl[0]}:${isl[1]}:14`, 'wait:1200', 'wait:300'])
    check('holding a file over the island doesn’t open the ring', stateAt(r, 'wait:1200')?.phase !== 'open' && r.dragging, JSON.stringify(stateAt(r, 'wait:1200')))
    check('it drops into Documents as before', await page.waitForSelector('.doc-row[data-doc="Report.pdf"]', { timeout: 6000 }).then(() => true, () => false))
    await shot(page, '03-dropped-on-island')
    // Close the panel the drop opened.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
    await page.waitForSelector('.hub', { state: 'detached', timeout: 5000 }).catch(() => {})

    // ---- Settings: Alt only, then off ----
    await page.evaluate(() => window.settings.setDrag({ when: 'alt' }))
    r = await dragWith(report, [`move:${C[0]}:${C[1]}:10`, 'wait:1200', 'wait:300', 'alt-down', 'wait:600', 'wait:300', 'alt-up', 'move:1400:900:8'])
    check('“I press Alt”: holding still doesn’t open it', stateAt(r, 'wait:1200')?.phase !== 'open', JSON.stringify(stateAt(r, 'wait:1200')))
    check('but Alt does', stateAt(r, 'wait:600')?.phase === 'open', JSON.stringify(stateAt(r, 'wait:600')))
    await until(async () => (await ringWin())?.visible === false, 3000)
    await page.evaluate(() => window.settings.setDrag({ on: false, when: 'either' }))
    r = await dragWith(report, [`move:${C[0]}:${C[1]}:10`, 'wait:1200', 'wait:300', 'alt-down', 'wait:400', 'wait:300', 'alt-up', 'move:1400:900:8'])
    check('switched off, it stays out of drags', stateAt(r, 'wait:1200')?.phase !== 'open' && stateAt(r, 'wait:400')?.phase !== 'open' && r.dragging)
    const saved = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check('and the setting is saved', saved.drag?.on === false && saved.drag?.when === 'either', JSON.stringify(saved.drag))
  } catch (e) {
    check('unexpected error', false, e.message)
    await shot(page, '99-failure')
  }

  if (silent) console.log(`the ring page didn't answer the test ${silent} times`)
  await app.close().catch(() => {})
  fs.writeFileSync(path.join(OUT, 'app.log'), logs.join(''))
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError|Error occurred in handler/i.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
