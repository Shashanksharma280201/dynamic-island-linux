// End-to-end test of drag actions when the system says what's dragged up
// front, as macOS does: a scripted drag source (DI_FAKE_DRAG) reports the
// files, the pointer and the let-go, the ring opens at once, and letting go on
// an action runs it with no drop event from the dragging app.
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { PDFDocument, StandardFonts } = require('pdf-lib')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-drag-known-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const FILES = path.join(TMP, 'files')
const HOME = path.join(TMP, 'home')
const SCRIPT = path.join(TMP, 'drag.jsonl')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
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
const say = (o) => fs.appendFileSync(SCRIPT, JSON.stringify(o) + '\n')
/** The pointer held at (x, y) for `ms`, as samples. */
const hold = async (x, y, ms) => {
  for (let t = 0; t < ms; t += 40) {
    say({ at: [x, y] })
    await sleep(40)
  }
}
/** The pointer gliding to (x, y). */
const glide = async (from, to, steps = 8) => {
  for (let i = 1; i <= steps; i++) {
    say({ at: [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps] })
    await sleep(30)
  }
}
const at = (c, deg, r) => [Math.round(c[0] + r * Math.sin((deg * Math.PI) / 180)), Math.round(c[1] - r * Math.cos((deg * Math.PI) / 180))]

;(async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage().drawText('Quarterly numbers look good', { x: 60, y: 700, size: 20, font })
  const report = path.join(FILES, 'Report.pdf')
  fs.writeFileSync(report, await doc.save())
  const archive = path.join(FILES, 'Backup.zip')
  fs.writeFileSync(archive, 'PK')
  fs.writeFileSync(SCRIPT, '')
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'right', y: 0.3 } }))

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, HOME, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_BACKDROP: 'off', DI_SOFFICE: '', DI_FAKE_DRAG: SCRIPT },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const ringWin = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Drag actions')
      return w ? { visible: w.isVisible() } : null
    })
  const ring = () => app.windows().find((w) => w.url().includes('ring.html'))
  const state = async () =>
    ring()
      ?.evaluate(() => ({
        phase: document.querySelector('.stage')?.getAttribute('data-phase') ?? '',
        title: document.querySelector('.hub-name')?.textContent ?? '',
        lit: document.querySelector('.seg-label[data-on="true"]')?.getAttribute('data-slot') ?? '',
        chips: [...document.querySelectorAll('.chip')].map((e) => e.getAttribute('data-choice') + (e.classList.contains('on') ? '*' : '')),
      }))
      .catch(() => null)

  try {
    await sleep(1500)
    const C = [700, 500]

    // ---- Convert a PDF to text, letting go on the chip ----
    say({ start: [report] })
    await hold(C[0], C[1], 300)
    check('a drag starting loads the ring', await until(async () => !!ring(), 5000))
    await hold(C[0], C[1], 700)
    check('holding still opens it with its actions at once', await until(async () => (await state())?.phase === 'open', 3000), JSON.stringify(await state()))
    await glide(C, at(C, 0, 105))
    await hold(...at(C, 0, 105), 300)
    await glide(at(C, 0, 105), at(C, 0, 216))
    await hold(...at(C, 0, 216), 300)
    const onChip = await state()
    check('the pointer, as the system reports it, picks Convert and a format', onChip?.lit === 'convert' && onChip.chips.includes('txt*'), JSON.stringify(onChip))
    await page.screenshot({ path: path.join(OUT, 'ring-known.png') }).catch(() => {})
    say({ end: true })
    const made = path.join(FILES, 'Report.txt')
    check('letting go on it converts the file, with no drop event', await until(() => fs.existsSync(made), 8000) && fs.readFileSync(made, 'utf8').includes('Quarterly numbers'), fs.readdirSync(FILES).join(', '))
    check('the island shows the result', await page.waitForSelector('.card.job[data-job="done"]', { timeout: 6000 }).then(() => true, () => false))
    check('and the ring folds away', await until(async () => (await ringWin())?.visible === false, 3000))

    // ---- Letting go in the middle cancels ----
    const before = fs.readdirSync(FILES).sort().join()
    say({ start: [report] })
    await hold(C[0], C[1], 1000)
    await until(async () => (await state())?.phase === 'open', 3000)
    say({ end: true })
    await until(async () => (await ringWin())?.visible === false, 3000)
    await sleep(500)
    check('letting go in the middle does nothing', fs.readdirSync(FILES).sort().join() === before)

    // ---- Files with nothing to offer ----
    say({ start: [archive] })
    await hold(C[0], C[1], 1000)
    await sleep(300)
    check('a file with no actions keeps the ring shut', (await state())?.phase !== 'open' && (await ringWin())?.visible === false, JSON.stringify(await state()))
    say({ end: true })
  } catch (e) {
    check('unexpected error', false, e.message)
  }

  await app.close().catch(() => {})
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError|Error occurred in handler/i.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
