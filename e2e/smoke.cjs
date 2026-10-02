// Smoke test that runs the real app on any OS (no X11, D-Bus or Xvfb needed):
// the capsule shows, every tab opens, Documents merges PDFs and prints Word to
// PDF, the CRM saves a contact, Settings opens, and nothing throws. CI runs it
// on macOS and Windows; on Linux run it under xvfb-run.
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { PDFDocument } = require('pdf-lib')
const { Document, Packer, Paragraph } = require('docx')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-smoke-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const MADE = path.join(TMP, 'made')
const FILES = path.join(TMP, 'files')
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
const seen = (page, sel, ms = 8000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)

;(async () => {
  const pdf = async (n) => {
    const d = await PDFDocument.create()
    for (let i = 0; i < n; i++) d.addPage()
    return d.save()
  }
  fs.writeFileSync(path.join(FILES, 'A.pdf'), await pdf(2))
  fs.writeFileSync(path.join(FILES, 'B.pdf'), await pdf(3))
  fs.writeFileSync(path.join(FILES, 'Letter.docx'), await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Hello from the smoke test')] }] })))
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ dock: { side: 'right', y: 0.3 } }))

  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    cwd: ROOT,
    env: {
      ...process.env,
      DI_USER_DATA: USER_DATA,
      DYNAMIC_ISLAND_SOCK: process.platform === 'win32' ? `\\\\.\\pipe\\island-smoke-${process.pid}` : path.join(TMP, 's.sock'),
      DI_BACKDROP: 'off',
      DI_DOCS_OUT: MADE,
      DI_DOCS_PICK: ['A.pdf', 'B.pdf', 'Letter.docx'].map((f) => path.join(FILES, f)).join('\n'),
      DI_SOFFICE: '',
      DI_NO_OPEN: '1',
    },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  app.process().stdout.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) }).catch(() => {})
  const toggle = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))

  try {
    check('the capsule shows', await seen(page, '.capsule.idle', 15000))
    await shot('01-capsule')
    await toggle()
    check('the panel opens', await seen(page, '.hub'))
    for (const tab of ['Controls', 'Claude', 'Music', 'Chats', 'Mail', 'Notes', 'Documents', 'CRM']) {
      await page.click(`.rail-btn[aria-label="${tab}"]`)
      await sleep(300)
      check(`the ${tab} tab opens`, !!(await page.$('.hub')) && (await page.evaluate(() => document.querySelector('.hub')?.textContent?.length ?? 0)) > 0)
    }

    await page.click('.rail-btn[aria-label="Documents"]')
    await page.click('.docs-view [aria-label="Add files"]')
    check('Documents adds files', await until(async () => (await page.$$('.doc-row')).length === 3, 8000))
    await page.click('.doc-row[data-doc="Letter.docx"]') // keep the two PDFs
    await page.click('.doc-actions .chip:has-text("Merge 2 PDFs")')
    check('and merges PDFs', await until(() => fs.existsSync(path.join(MADE, 'A (merged).pdf')), 10000))
    // Just the Word file selected.
    await until(async () => {
      const rows = await page.$$eval('.doc-row', (r) => r.map((x) => ({ name: x.getAttribute('data-doc'), on: x.getAttribute('aria-pressed') === 'true' })))
      const wrong = rows.find((r) => r.on !== (r.name === 'Letter.docx'))
      if (wrong) await page.click(`.doc-row[data-doc="${wrong.name}"]`)
      return !wrong
    }, 5000)
    await page.click('.doc-actions .chip:has-text("Convert…")')
    await page.click('.doc-actions .chip:has-text("PDF")')
    check('and prints Word to PDF', await until(() => fs.existsSync(path.join(MADE, 'Letter.pdf')) && fs.statSync(path.join(MADE, 'Letter.pdf')).size > 500, 20000))
    await shot('02-docs')

    await page.click('.rail-btn[aria-label="CRM"]')
    await page.click('.crm-view .empty button:has-text("Add Contact")')
    await sleep(300)
    await page.fill('.crm-form [aria-label="Name"]', 'Smoke Test')
    await page.click('.crm-form-actions button:has-text("Add")')
    check('the CRM saves a contact', await until(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(USER_DATA, 'crm', 'crm.json'), 'utf8')).contacts[0]?.name === 'Smoke Test'
      } catch {
        return false
      }
    }, 5000))
    await shot('03-crm')

    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings())])
    check('Settings opens', await seen(settings, '#packages', 8000))
  } catch (e) {
    check('unexpected error', false, e.message)
    await shot('99-failure')
  }

  await app.close().catch(() => {})
  const errs = logs.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError|Unhandled/i.test(l))
  check('no errors in the app log', !errs.length, errs.slice(0, 5).join(' | '))
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed on ${process.platform} (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
