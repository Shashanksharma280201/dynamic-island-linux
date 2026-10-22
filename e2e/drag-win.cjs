// End-to-end test of drag actions on Windows, with a real drag: a file is
// dragged out of another app (e2e/drag-source.cjs, an OLE drag with the shell's
// drag image) by real pointer input (SendInput, e2e/wininput.cjs), held still
// until the ring opens, then let go on Convert, Text.
const { _electron } = require('playwright-core')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { PDFDocument, StandardFonts } = require('pdf-lib')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-drag-win-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const FILES = path.join(TMP, 'files')
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
    env: { ...process.env, DI_USER_DATA: USER_DATA, DI_SOFFICE: '' },
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

  let source = null
  try {
    await page.waitForSelector('.capsule', { timeout: 20000 })
    await sleep(4000) // the watcher compiles its C# once
    const { area, scale } = await app.evaluate(({ screen }) => ({ area: screen.getPrimaryDisplay().workArea, scale: screen.getPrimaryDisplay().scaleFactor }))
    const px = (v) => Math.round(v * scale)
    const mv = ([x, y], steps) => `move:${px(x)}:${px(y)}:${steps}`
    // Where the ring will be: under the pointer, where it fits whole.
    const fit = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)))
    const C = [Math.round(fit(area.x + area.width / 2 + 80, area.x + 310, area.x + area.width - 310)), Math.round(fit(area.y + area.height / 2, area.y + 310, area.y + area.height - 310))]

    source = spawn(ELECTRON, [path.join(__dirname, 'drag-source.cjs')], { env: { ...process.env, DRAG_FILE: report } })
    let said = ''
    source.stdout.on('data', (d) => (said += d))
    await until(() => said.includes('ready'), 20000)
    await sleep(800)

    // Press on the file, pull it out, carry it to C and hold still, then to
    // Convert, to Text, and let go.
    const tokens = [mv([150, 460], 1), 'down', 'wait:150', mv([190, 470], 4), mv([300, 500], 6), mv(C, 16), 'wait:1600', 'wait:500', mv(at(C, 0, 105), 10), 'wait:700', mv(at(C, 0, 216), 10), 'wait:900', 'wait:300', 'up', 'wait:300']
    const g = spawn(process.execPath, [path.join(__dirname, 'wininput.cjs'), 'gesture', ...tokens])
    let out = ''
    let finished = false
    g.stdout.on('data', (d) => (out += d))
    g.stderr.on('data', (d) => logs.push('[gesture] ' + d))
    g.on('exit', () => (finished = true))
    const seen = {}
    while (!finished) {
      const steps = [...out.matchAll(/step (\d+)/g)].map((m) => Number(m[1]))
      const n = steps.length ? Math.max(...steps) : 0
      if (n >= 7 && !seen.open) seen.open = await state()
      if (n >= 13 && !seen.chip) seen.chip = await state()
      await sleep(60)
    }
    check('the drag started', said.includes('dragging'), said.trim().replace(/\n/g, ' | '))
    check('holding still opens the ring', seen.open?.phase === 'open', JSON.stringify(seen.open))
    const w = await ringWin()
    check('under the pointer', !!w && Math.abs(w.bounds.x + w.bounds.width / 2 - C[0]) <= 2 && Math.abs(w.bounds.y + w.bounds.height / 2 - C[1]) <= 2, JSON.stringify(w))
    check('it knows what’s dragged, and the pointer picks Convert and Text', seen.chip?.title === 'PDF' && seen.chip.lit === 'convert' && seen.chip.chips.includes('txt*'), JSON.stringify(seen.chip))
    const made = path.join(FILES, 'Report.txt')
    check('letting go converts it, next to the original', await until(() => fs.existsSync(made), 10000) && fs.readFileSync(made, 'utf8').includes('Quarterly numbers'), fs.readdirSync(FILES).join(', '))
    check('the island shows the result', await page.waitForSelector('.card.job[data-job="done"]', { timeout: 8000 }).then(() => true, () => false))
    await page.screenshot({ path: path.join(OUT, 'drag-win-result.png') }).catch(() => {})
    check('the ring folds away', await until(async () => (await ringWin())?.visible === false, 4000))
  } catch (e) {
    check('unexpected error', false, e.message)
    await page.screenshot({ path: path.join(OUT, 'drag-win-failure.png') }).catch(() => {})
  }

  source?.kill()
  await app.close().catch(() => {})
  fs.writeFileSync(path.join(OUT, 'drag-win.log'), logs.join(''))
  const errs = logs.join('').split('\n').filter((l) => /drag watcher|Uncaught|TypeError/i.test(l))
  console.log('app log:', errs.length ? errs.slice(0, 8).join(' | ') : 'clean')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
})()
