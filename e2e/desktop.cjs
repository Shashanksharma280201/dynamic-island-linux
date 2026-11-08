// End-to-end test of Ubuntu the island's way: Settings › Desktop applies the
// island's look through a stand-in gsettings (with a real key store), follows
// a new accent, and Undo puts back exactly what was there; the command bar
// works out sums, opens apps from .desktop files, settings and system changes,
// and offers to ask. Needs an X server and a session bus.
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-desktop-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const HOME = path.join(TMP, 'home')
const STORE = path.join(TMP, 'dconf.json')
const LAUNCHED = path.join(TMP, 'launched')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
for (const d of [OUT, USER_DATA, path.join(HOME, '.local/share/applications')]) fs.mkdirSync(d, { recursive: true })

// A stand-in gsettings: a JSON file of keys, the schemas Ubuntu 22.04 has.
const BEFORE = {
  'org.gnome.desktop.interface color-scheme': "'default'",
  'org.gnome.desktop.interface gtk-theme': "'Yaru'",
  'org.gnome.desktop.interface icon-theme': "'Yaru'",
  'org.gnome.shell.extensions.dash-to-dock dock-position': "'LEFT'",
  'org.gnome.shell.extensions.dash-to-dock extend-height': 'true',
  'org.gnome.shell.extensions.dash-to-dock dock-fixed': 'true',
  'org.gnome.shell.extensions.dash-to-dock intellihide': 'false',
  'org.gnome.shell.extensions.dash-to-dock dash-max-icon-size': '48',
  'org.gnome.desktop.wm.preferences button-layout': "':minimize,maximize,close'",
}
fs.writeFileSync(STORE, JSON.stringify(BEFORE))
const GS = path.join(TMP, 'gsettings')
fs.writeFileSync(
  GS,
  `#!/usr/bin/env node
const fs = require('fs'); const f = ${JSON.stringify(STORE)}; const s = JSON.parse(fs.readFileSync(f, 'utf8')); const [cmd, schema, key, ...v] = process.argv.slice(2)
if (cmd === 'list-schemas') { console.log('org.gnome.desktop.interface\\norg.gnome.desktop.background\\norg.gnome.shell.extensions.dash-to-dock\\norg.gnome.desktop.wm.preferences'); process.exit(0) }
if (cmd === 'monitor') { setInterval(() => {}, 1e9); return }
const id = schema + ' ' + key
if (cmd === 'get') { if (!(id in s)) process.exit(1); console.log(s[id]); process.exit(0) }
if (cmd === 'set') { s[id] = v.join(' '); fs.writeFileSync(f, JSON.stringify(s)); process.exit(0) }
process.exit(1)
`,
  { mode: 0o755 },
)
// An app to open.
fs.writeFileSync(path.join(HOME, '.local/share/applications/island-test.desktop'), `[Desktop Entry]\nType=Application\nName=Island Test App\nComment=Opens for the test\nExec=sh -c "touch ${LAUNCHED}"\n`)

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try {
      const v = await f()
      if (v) return v
    } catch {}
  }
  return null
}
const store = () => JSON.parse(fs.readFileSync(STORE, 'utf8'))

;(async () => {
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ theme: 'light', character: { id: 'bolt', name: 'Sparky' } }))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, DI_USER_DATA: USER_DATA, DI_HOME: HOME, DYNAMIC_ISLAND_SOCK: path.join(TMP, 's.sock'), DI_NO_GREETING: '1', DI_BACKDROP: 'off', DI_GSETTINGS: GS },
  })
  const page = await app.firstWindow()
  try {
    await page.waitForSelector('.island', { timeout: 15000 })
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('desktop'))])
    await settings.waitForSelector('#desktop', { timeout: 8000 })
    await settings.setViewportSize({ width: 900, height: 900 }).catch(() => {})

    // ---- the look ----
    await settings.click('#desktop button:has-text("Apply")')
    check('Apply sets Ubuntu to the island’s look', !!(await until(() => store()['org.gnome.desktop.interface gtk-theme'] === "'Yaru-blue'")), store()['org.gnome.desktop.interface gtk-theme'])
    // The keys are set one after another: wait for the Dock's too.
    check('with the Dock at the bottom', !!(await until(() => store()['org.gnome.shell.extensions.dash-to-dock dock-position'] === "'BOTTOM'")))
    check('and says what it changed', await settings.waitForSelector('#desktop .desktop-last:has-text("The Dock at the bottom")', { timeout: 4000 }).then(() => true, () => false))
    await settings.click('.side-item[data-section="general"]')
    await settings.click('#general .accent-swatch[aria-label="Purple"]')
    check('a new accent follows to Ubuntu', !!(await until(() => store()['org.gnome.desktop.interface gtk-theme'] === "'Yaru-purple'")), store()['org.gnome.desktop.interface gtk-theme'])
    await settings.click('.side-item[data-section="desktop"]')
    await settings.screenshot({ path: `${OUT}/01-desktop.png` })
    await settings.click('#desktop button:has-text("Undo")')
    check('Undo puts back exactly what was there', !!(await until(() => JSON.stringify(store()) === JSON.stringify(BEFORE))), JSON.stringify(store()).slice(0, 200))

    // ---- the command bar ----
    await page.evaluate(() => window.island.command.open())
    const bar = await until(() => app.windows().find((p) => p.url().includes('command.html')))
    check('the command bar opens', !!bar)
    if (bar) {
      await bar.waitForSelector('#q', { timeout: 5000 })
      await bar.fill('#q', '2^10 / 4')
      check('it works out sums', await bar.waitForSelector('#list li[data-kind="calc"]:has-text("= 256")', { timeout: 4000 }).then(() => true, () => false))
      await bar.press('#q', 'Enter')
      check('Enter copies the answer', !!(await until(() => app.evaluate(({ clipboard }) => clipboard.readText() === '256'))))
      await page.evaluate(() => window.island.command.open())
      await bar.fill('#q', 'island te')
      check('it finds apps by their .desktop files', await bar.waitForSelector('#list li[data-kind="app"]:has-text("Island Test App")', { timeout: 4000 }).then(() => true, () => false))
      await bar.screenshot({ path: `${OUT}/02-command-bar.png` })
      await bar.press('#q', 'Enter')
      check('and opens them', !!(await until(() => fs.existsSync(LAUNCHED), 6000)))
      await page.evaluate(() => window.island.command.open())
      await bar.fill('#q', 'dark mode')
      await bar.waitForSelector('#list li[data-kind="system"]', { timeout: 4000 })
      await bar.press('#q', 'Enter')
      check('system changes happen at once (dark mode)', !!(await until(() => page.evaluate(() => document.documentElement.dataset.theme === 'dark'))))
      await page.evaluate(() => window.island.command.open())
      await bar.fill('#q', 'what is this error')
      check('anything else can be asked', await bar.waitForSelector('#list li[data-kind="ask"]:has-text("Ask Sparky")', { timeout: 4000 }).then(() => true, () => false))
      await bar.press('#q', 'Escape')
      check('Escape closes it', !!(await until(() => app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Command bar')?.isVisible()))))
    }
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await app.close().catch(() => {})
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in ${OUT}`)
    process.exit(failed.length ? 1 : 0)
  }
})()
