// End-to-end test of drag actions on macOS, in the real app: the drag helper
// watches the real drag pasteboard and the real pointer. The test plays the
// parts a hand would: the button is "held" while a file exists
// (DI_DRAG_ASSUME_DOWN), the dragged file goes onto the drag pasteboard as
// Finder puts it there, and the pointer moves with CGWarpMouseCursorPosition.
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { PDFDocument, StandardFonts } = require('pdf-lib')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-drag-mac-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const FILES = path.join(TMP, 'files')
const HELD = path.join(TMP, 'button-held')
const ELECTRON = require('electron')
for (const d of [OUT, USER_DATA, FILES]) fs.mkdirSync(d, { recursive: true })

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
const jxa = (script) => execFileSync('osascript', ['-l', 'JavaScript', '-e', script]).toString().trim()
/** Moves the real pointer (screen points, as Electron counts them). */
const warp = (x, y) => jxa(`ObjC.import('CoreGraphics'); $.CGWarpMouseCursorPosition({ x: ${x}, y: ${y} }); ''`)
/** Glides the pointer, as a hand would. */
const glide = async (from, to, steps = 8) => {
  for (let i = 1; i <= steps; i++) {
    warp(Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps))
    await sleep(40)
  }
}
/** What Finder does when a drag starts: the files go onto the drag pasteboard. */
const dragOut = (files) =>
  jxa(`ObjC.import('AppKit')
const pb = $.NSPasteboard.pasteboardWithName('Apple CFPasteboard drag')
pb.clearContents
pb.writeObjects($([${files.map((f) => `$.NSURL.fileURLWithPath(${JSON.stringify(f)})`).join(', ')}]))
String(pb.changeCount)`)
const at = (c, deg, r) => [Math.round(c[0] + r * Math.sin((deg * Math.PI) / 180)), Math.round(c[1] - r * Math.cos((deg * Math.PI) / 180))]

;(async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage().drawText('Quarterly numbers look good', { x: 60, y: 700, size: 20, font })
  const report = path.join(FILES, 'Report.pdf')
  fs.writeFileSync(report, await doc.save())
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'right', y: 0.3 } }))

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT],
    cwd: ROOT,
    env: { ...process.env, DI_USER_DATA: USER_DATA, DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'), DI_SOFFICE: '', DI_DRAG_ASSUME_DOWN: HELD },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  app.process().stdout.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const ringWin = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Drag actions')
      return w ? { visible: w.isVisible(), bounds: w.getBounds() } : null
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
    await page.waitForSelector('.capsule', { timeout: 15000 })
    await sleep(2500) // the helper starts
    const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
    const C = [Math.round(area.x + area.width / 2 - 120), Math.round(area.y + area.height / 2)]
    warp(...C)
    await sleep(300)

    // ---- A PDF dragged out of Finder, held still ----
    fs.writeFileSync(HELD, '')
    await sleep(300)
    const count = dragOut([report])
    check('a file goes onto the drag pasteboard', /^\d+$/.test(count), count)
    check('the drag loads the ring', await until(async () => !!ring(), 6000))
    check('holding still opens it with its actions at once', await until(async () => (await state())?.phase === 'open', 5000), JSON.stringify(await state()))
    const w = await ringWin()
    check('centred under the pointer', !!w && Math.abs(w.bounds.x + w.bounds.width / 2 - C[0]) <= 2 && Math.abs(w.bounds.y + w.bounds.height / 2 - C[1]) <= 2, JSON.stringify(w))

    // ---- To Convert, then Text, and let go ----
    await glide(C, at(C, 0, 105))
    await sleep(500)
    await glide(at(C, 0, 105), at(C, 0, 216))
    await sleep(600)
    const onChip = await state()
    check('it knows what’s dragged', onChip?.title === 'PDF', onChip?.title)
    check('the real pointer picks Convert and a format', onChip?.lit === 'convert' && onChip.chips.includes('txt*'), JSON.stringify(onChip))
    await ring()?.screenshot({ path: path.join(OUT, 'drag-mac-ring.png') }).catch(() => {})
    fs.rmSync(HELD)
    const made = path.join(FILES, 'Report.txt')
    check('letting go converts it, next to the original', await until(() => fs.existsSync(made), 10000) && fs.readFileSync(made, 'utf8').includes('Quarterly numbers'), fs.readdirSync(FILES).join(', '))
    check('the island shows the result', await page.waitForSelector('.card.job[data-job="done"]', { timeout: 8000 }).then(() => true, () => false))
    await page.screenshot({ path: path.join(OUT, 'drag-mac-result.png') }).catch(() => {})
    check('the ring folds away', await until(async () => (await ringWin())?.visible === false, 4000))

    // ---- A drag of text, not files, leaves it shut ----
    fs.writeFileSync(HELD, '')
    await sleep(300)
    jxa(`ObjC.import('AppKit'); const pb = $.NSPasteboard.pasteboardWithName('Apple CFPasteboard drag'); pb.clearContents; pb.setStringForType('hello', $.NSPasteboardTypeString); ''`)
    await sleep(1500)
    check('dragging text doesn’t open it', (await ringWin())?.visible === false, JSON.stringify(await state()))
    fs.rmSync(HELD)
  } catch (e) {
    check('unexpected error', false, e.message)
    await page.screenshot({ path: path.join(OUT, 'drag-mac-failure.png') }).catch(() => {})
  }

  await app.close().catch(() => {})
  fs.writeFileSync(path.join(OUT, 'drag-mac.log'), logs.join(''))
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
})()
