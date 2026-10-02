// End-to-end test of the Documents package in the real Electron app: adding
// files, the quick actions that need no AI (merge, pages, numbers, convert
// with the real print window), asking the agent to correct a Word file as
// tracked changes (against e2e/fake-ai.cjs), recipes, asking before the
// Trash, and dragging a file from another app onto the island (real XDND).
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const JSZip = require('jszip')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const { Document, Packer, Paragraph, TextRun } = require('docx')
const { execFileSync, spawn } = require('child_process')
const { startFakeAi } = require('./fake-ai.cjs')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-docs-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const FILES = path.join(TMP, 'files')
const MADE = path.join(TMP, 'Dynamic Island')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
// E2E_SCALE=2 simulates a HiDPI display (X11 pointer coords are physical px).
const SCALE = Number(process.env.E2E_SCALE) || 1
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
const seen = (page, selector, ms = 6000) => page.waitForSelector(selector, { timeout: ms }).then(() => true, () => false)

async function pdf(pages, prefix) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) doc.addPage().drawText(`${prefix} ${i}`, { x: 60, y: 700, size: 20, font })
  return doc.save()
}
const pagesOf = async (file) => (await PDFDocument.load(fs.readFileSync(file))).getPageCount()
const made = (name) => path.join(MADE, name)

;(async () => {
  fs.writeFileSync(path.join(FILES, 'Invoice March.pdf'), await pdf(2, 'March'))
  fs.writeFileSync(path.join(FILES, 'Invoice April.pdf'), await pdf(3, 'April'))
  const contract = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun('The tenant shall pay '), new TextRun({ text: 'teh rent', bold: true }), new TextRun(' on the first day of each month.')] })] }],
  })
  fs.writeFileSync(path.join(FILES, 'Contract.docx'), await Packer.toBuffer(contract))
  const picks = ['Invoice March.pdf', 'Invoice April.pdf', 'Contract.docx'].map((f) => path.join(FILES, f))

  const ai = await startFakeAi()
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({ dock: { side: 'right', y: 0.3 }, character: { id: 'bolt', name: 'Sparky' }, ai: { provider: 'ollama', models: { ollama: 'llama3.2' } } }),
  )
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: {
      ...process.env,
      DI_USER_DATA: USER_DATA,
      DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
      DI_BACKDROP: 'off',
      DI_AI_BASE_URL: ai.base,
      DI_DOCS_OUT: MADE,
      DI_DOCS_PICK: picks.join('\n'),
      DI_NO_OPEN: '1',
      // The built-in conversions (LibreOffice is tested where it's installed).
      DI_SOFFICE: '',
    },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {})
  const togglePanel = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
  const view = () => page.evaluate(() => window.island.claude.state())
  const waitDone = () => until(async () => ['done', 'error', 'stopped'].includes((await view()).run?.phase), 10000)
  const result = () => page.evaluate(() => document.querySelector('.docs-result')?.textContent ?? '')
  const rows = () => page.$$eval('.doc-row', (r) => r.map((x) => ({ name: x.getAttribute('data-doc'), on: x.getAttribute('aria-pressed') === 'true' })))
  /** Click rows until exactly these files are selected. */
  const select = async (...names) => {
    for (const r of await rows()) if (r.on !== names.includes(r.name)) await page.click(`.doc-row[data-doc="${r.name}"]`)
    await until(async () => (await rows()).filter((r) => r.on).map((r) => r.name).sort().join() === [...names].sort().join(), 2000)
  }
  const action = async (label) => {
    await page.click(`.doc-actions .chip:has-text("${label}")`)
    await until(async () => !(await page.$('.docs-result .spinner')) && (await result()) !== '', 15000)
    return result()
  }

  try {
    await sleep(1500)
    await togglePanel()
    await page.waitForSelector('.hub', { timeout: 5000 })
    check('the rail has a Documents tab', !!(await page.$('.rail-btn[aria-label="Documents"]')))
    await page.click('.rail-btn[aria-label="Documents"]')
    check('with nothing added it says to drop files', await seen(page, '.docs-view .empty:has-text("Drop files on the island")'))
    await sleep(600)
    await shot('01-empty')

    // ---- Adding files ----
    await page.click('.docs-view .empty button:has-text("Add Files")')
    check('Add Files lists them', await until(async () => (await rows()).length === 3), JSON.stringify(await rows()))
    check('newly added files come selected', (await rows()).every((r) => r.on))
    check('newest first', (await rows()).map((r) => r.name).join() === 'Contract.docx,Invoice April.pdf,Invoice March.pdf', (await rows()).map((r) => r.name).join())
    check('with pages and sizes', (await page.textContent('.doc-row[data-doc="Invoice April.pdf"]')).includes('3 pages'))

    // ---- Quick actions, no AI ----
    await select('Invoice March.pdf', 'Invoice April.pdf')
    check('two PDFs selected offer Merge', await seen(page, '.doc-actions .chip:has-text("Merge 2 PDFs")', 2000))
    await shot('02-selected')
    check('Merge saves a new file', (await action('Merge 2 PDFs')).includes('Saved “Invoice March (merged).pdf”'), await result())
    check('with every page, in order', fs.existsSync(made('Invoice March (merged).pdf')) && (await pagesOf(made('Invoice March (merged).pdf'))) === 5)
    check('the originals are untouched', (await pagesOf(picks[0])) === 2 && (await pagesOf(picks[1])) === 3)
    check('the result is listed on top, selected and marked as made', await until(async () => (await rows())[0]?.name === 'Invoice March (merged).pdf' && (await rows())[0].on) && (await page.textContent('.doc-row[data-doc="Invoice March (merged).pdf"]')).includes('Made · 5 pages') && !!(await page.$('.doc-row[data-doc="Invoice March (merged).pdf"] .doc-new')))

    await page.click('.doc-actions .chip:has-text("Pages…")')
    await page.fill('.doc-input', '2-3')
    check('Pages… can delete pages', (await action('Delete')).includes('Saved “Invoice March (merged) (without 2-3).pdf”'), await result())
    check('leaving the rest', (await pagesOf(made('Invoice March (merged) (without 2-3).pdf'))) === 3)
    check('Number pages adds page numbers', (await action('Number pages')).includes('(numbered).pdf'), await result())

    await select('Contract.docx')
    await page.click('.doc-actions .chip:has-text("Convert…")')
    const targets = await page.$$eval('.doc-actions .chip', (c) => c.map((x) => x.textContent))
    check('Convert offers what a Word file can become', targets.join() === 'PDF,Text,Markdown', targets.join())
    await shot('03-convert')
    const converted = await action('PDF')
    check('Word to PDF works without LibreOffice (printed)', converted.includes('Saved “Contract.pdf”.') && converted.includes('Made without LibreOffice'), converted)
    check('and is a real PDF', fs.existsSync(made('Contract.pdf')) && (await pagesOf(made('Contract.pdf'))) >= 1)

    // ---- Asking the agent ----
    await select('Contract.docx')
    check('a Word file gets suggestions', await seen(page, '.chip.idea:has-text("Fix spelling and grammar")', 2000))
    ai.log.length = 0
    await page.click('.chip.idea:has-text("Fix spelling and grammar")')
    check('while it works the run shows on the tab', await seen(page, '.ask-run.live', 4000))
    await waitDone()
    const runText = await page.textContent('.ask-run')
    check('the answer says what was made', runText.includes('Done. Made 1 change (tracked). Saved Contract (corrected, tracked changes).docx'), runText)
    const first = ai.log.find((l) => l.path === '/chat/completions')
    const prompt = first?.body.messages.at(-1).content ?? ''
    check('the request names the selected file by id', /\(Files: Contract\.docx \(id d\d+\)\)$/.test(prompt), prompt.slice(-60))
    check('and gives the agent the document tools', ['docs_read', 'docx_edit', 'pdf_merge', 'docs_trash'].every((n) => first?.body.tools.some((t) => t.function.name === n)))
    const fixed = made('Contract (corrected, tracked changes).docx')
    const xml = fs.existsSync(fixed) ? await (await JSZip.loadAsync(fs.readFileSync(fixed))).file('word/document.xml').async('string') : ''
    check('the correction is a tracked change by the character', /<w:del [^>]*w:author="Sparky"/.test(xml) && /<w:delText[^>]*>teh rent</.test(xml) && /<w:ins [^>]*w:author="Sparky"/.test(xml), xml.slice(0, 120))
    check('keeping the formatting (bold)', /<w:ins [^>]*>\s*<w:r>\s*<w:rPr>\s*<w:b\/>/.test(xml))
    check('the corrected copy appears in the list', await until(async () => (await rows()).some((r) => r.name === 'Contract (corrected, tracked changes).docx')))
    check('and opens in one tap from the answer', await seen(page, '.ask-run-files .chip:has-text("Open Contract (corrected, tracked")', 3000))
    check('the answer replaces the last action’s message', !(await page.$('.docs-result')))
    await shot('04-agent')

    // ---- Recipes ----
    await page.fill('.docs-ask textarea', 'Merge these and add page numbers')
    await page.click('.save-recipe')
    check('a request can be kept as a recipe', await until(() => fs.existsSync(path.join(USER_DATA, 'docs-recipes.json')) && fs.readFileSync(path.join(USER_DATA, 'docs-recipes.json'), 'utf8').includes('Merge these and add page numbers')))
    await page.fill('.docs-ask textarea', '')
    check('and shows as a one-tap chip', await seen(page, '.chip.recipe:has-text("Merge these and add")', 3000))
    await shot('05-recipe')
    await page.click('.chip.recipe .recipe-x')
    check('which can be forgotten', await page.waitForSelector('.chip.recipe', { state: 'detached', timeout: 3000 }).then(() => true, () => false))

    // ---- Moving to the Trash asks first ----
    await select('Contract.pdf')
    await page.fill('.docs-ask textarea', 'trash it')
    await page.press('.docs-ask textarea', 'Enter')
    check('moving a file to the Trash asks first', await seen(page, '.card.agent-ask:has-text("Move “Contract.pdf” to the Trash")', 8000))
    await sleep(800)
    await shot('06-asks-first')
    await page.click('.agent-ask button.deny')
    await waitDone()
    check('Don’t Allow keeps the file', fs.existsSync(made('Contract.pdf')))

    // ---- A file moved away can be taken off the list ----
    fs.unlinkSync(picks[1])
    await page.click('.rail-btn[aria-label="Notes"]')
    await page.click('.rail-btn[aria-label="Documents"]')
    check('a file moved or deleted is marked so', await until(async () => ((await page.textContent('.doc-row[data-doc="Invoice April.pdf"]').catch(() => '')) ?? '').includes('Moved or deleted')))
    await select('Invoice April.pdf')
    check('and can only be taken off the list', ((await page.textContent('.doc-actions').catch(() => '')) ?? '').includes('This file was moved or deleted.'))
    await page.click('.doc-actions .doc-remove')
    check('which removes it', await page.waitForSelector('.doc-row[data-doc="Invoice April.pdf"]', { state: 'detached', timeout: 3000 }).then(() => true, () => false))

    // ---- Dragging files onto the island ----
    if (await page.$('.hub')) await togglePanel()
    await page.waitForSelector('.hub', { state: 'detached', timeout: 5000 })
    await sleep(500)
    const drag = (type) =>
      page.evaluate((type) => {
        const dt = new DataTransfer()
        dt.items.add(new File(['%PDF-1.4'], 'Scan.pdf', { type: 'application/pdf' }))
        document.querySelector('.island-outer').dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
      }, type)
    await drag('dragenter')
    await drag('dragover')
    check('dragging files over the island invites a drop', await seen(page, '.drop-card:has-text("Drop to add to Documents")', 3000))
    await sleep(400)
    await shot('07-drop')
    await drag('dragleave')
    check('and goes back when they leave', await page.waitForSelector('.drop-card', { state: 'detached', timeout: 3000 }).then(() => true, () => false))
    await drag('dragenter')
    await drag('drop')
    check('dropping opens Documents', await seen(page, '.docs-view', 4000))
    // A file made up in the page has no place on disk, so it's turned away.
    check('and says what it couldn’t add', await until(async () => (await result()).includes('Scan.pdf: not a file on this computer')), await result())

    // A real drag from another app (like the file manager) onto the island.
    const report = path.join(FILES, 'Quarterly Report.pdf')
    fs.writeFileSync(report, await pdf(4, 'Q'))
    await togglePanel()
    await page.waitForSelector('.hub', { state: 'detached', timeout: 5000 })
    const source = spawn(ELECTRON, [path.join(__dirname, 'drag-source.cjs'), '--no-sandbox'], { env: { ...process.env, DRAG_FILE: report } })
    let said = ''
    source.stdout.on('data', (d) => (said += d))
    source.stderr.on('data', (d) => /error/i.test(d) && !/bus\.cc|atom_cache/.test(d) && (said += d))
    await until(() => said.includes('ready'), 15000)
    // Aim at the resting capsule: the last answer's card closes by itself
    // (close it now), and the island must have settled before measuring.
    await page.evaluate(() => window.island.dismiss('claude-done'))
    await until(async () => !!(await page.$('.capsule.idle')), 20000)
    await sleep(600)
    const islandId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readUInt32LE(0))
    const win = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    const box = await page.evaluate(() => {
      const b = document.querySelector('.island-outer > .island').getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    })
    const target = [Math.round((win.x + box.x) * SCALE), Math.round((win.y + box.y) * SCALE)]
    const under = () => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'child', ...target.map(String)]).toString().trim()
    check('the island takes input where the file will be dropped', await until(() => under() === String(islandId), 3000), `${under()} vs ${islandId}`)
    /** Drag the file onto the island, watching for the drop card on the way. */
    const dragOnce = async () => {
      const xdnd = spawn('node', [path.join(__dirname, 'xtest.cjs'), 'dnd', '150', '460', ...target.map(String)])
      let finished = false
      let invited = false
      xdnd.on('exit', () => (finished = true))
      while (!finished) {
        if (await page.$('.drop-card')) invited = true
        await sleep(50)
      }
      return invited
    }
    let invited = await dragOnce()
    // A busy machine can miss the start of a drag (no "dragging" yet): once more.
    if (!invited && !said.includes('dragging')) invited = await dragOnce()
    source.kill()
    check('a file dragged from another app shows the drop card', invited, invited ? '' : `(drag source said: ${said.trim().replace(/\n/g, ' | ')})`)
    check('and dropping it adds it to Documents', await seen(page, '.doc-row[data-doc="Quarterly Report.pdf"][aria-pressed="true"]', 6000))
    check('with its pages read', ((await page.textContent('.doc-row[data-doc="Quarterly Report.pdf"]', { timeout: 2000 }).catch(() => '')) ?? '').includes('4 pages'))
    await shot('08-dropped')
  } catch (e) {
    check('unexpected error', false, e.message)
    await shot('99-failure')
  }

  await app.close().catch(() => {})
  ai.close()
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError/i.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
