// End-to-end test of Ubuntu the island's way: Settings › Desktop applies the
// island's look through a stand-in gsettings (with a real key store), follows
// a new accent, and Undo puts back exactly what was there; the command bar
// works out sums, opens apps from .desktop files, settings and system changes,
// and offers to ask. Hide Top Bar hides Ubuntu's top bar like a Mac's menu bar
// and the island moves to the top centre. Needs an X server and a session bus.
const { _electron } = require('playwright-core')
const path = require('path')
const http = require('http')
const { makeFakeSystem } = require('./fake-system-tools.cjs')
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
  'org.gnome.shell enabled-extensions': "['ubuntu-dock@ubuntu.com']",
  'org.gnome.shell disabled-extensions': '@as []',
  'org.gnome.shell disable-user-extensions': 'false',
  'org.gnome.shell.extensions.just-perfection clock-menu': 'true',
  // Hide Top Bar's own defaults.
  'org.gnome.shell.extensions.hidetopbar mouse-sensitive': 'false',
  'org.gnome.shell.extensions.hidetopbar enable-intellihide': 'true',
  'org.gnome.shell.extensions.hidetopbar show-in-overview': 'true',
  'org.gnome.shell.extensions.hidetopbar mouse-triggers-overview': 'false',
}
fs.writeFileSync(STORE, JSON.stringify(BEFORE))
const GS = path.join(TMP, 'gsettings')
fs.writeFileSync(
  GS,
  `#!/usr/bin/env node
const fs = require('fs'); const f = ${JSON.stringify(STORE)}; const s = JSON.parse(fs.readFileSync(f, 'utf8')); let a = process.argv.slice(2)
// An extension's own schemas: only there once it's installed.
if (a[0] === '--schemadir') { if (!fs.existsSync(a[1])) process.exit(1); a = a.slice(2); if (a[0] === 'list-keys') process.exit(0) }
const [cmd, schema, key, ...v] = a
if (cmd === 'list-schemas') { console.log('org.gnome.desktop.interface\\norg.gnome.desktop.background\\norg.gnome.shell.extensions.dash-to-dock\\norg.gnome.desktop.wm.preferences\\norg.gnome.shell'); process.exit(0) }
if (cmd === 'monitor') { setInterval(() => {}, 1e9); return }
const id = schema + ' ' + key
if (cmd === 'get') { if (!(id in s)) process.exit(1); console.log(s[id]); process.exit(0) }
if (cmd === 'set') { s[id] = v.join(' '); fs.writeFileSync(f, JSON.stringify(s)); process.exit(0) }
process.exit(1)
`,
  { mode: 0o755 },
)
// Stand-ins for GNOME Shell 42 and its extension installer (unzipping is GNOME's job; this one just makes the folder).
const SHELL = path.join(TMP, 'gnome-shell')
fs.writeFileSync(SHELL, '#!/bin/sh\necho "GNOME Shell 42.9"\n', { mode: 0o755 })
const GX = path.join(TMP, 'gnome-extensions')
fs.writeFileSync(GX, `#!/bin/sh\n[ "$1" = install ] || exit 1\nd="${HOME}/.local/share/gnome-shell/extensions/$(basename "$3" .zip)"\nmkdir -p "$d/schemas" && echo '{}' > "$d/metadata.json"\n`, { mode: 0o755 })
// The login screen and boot splash: pkexec and the system's tools, stood in for.
const SYS = makeFakeSystem(path.join(TMP, 'system'))
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
  // A stand-in extensions.gnome.org.
  const asked = []
  const ego = http.createServer((req, res) => {
    asked.push(req.url)
    if (req.url.startsWith('/extension-info/')) {
      const uuid = new URL(req.url, 'http://x').searchParams.get('uuid')
      return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ download_url: `/download-extension/${uuid}.shell-extension.zip?version_tag=1` }))
    }
    res.writeHead(200).end('PK')
  })
  await new Promise((r) => ego.listen(0, '127.0.0.1', r))
  // Docked on the right: hiding the top bar moves it to the top centre.
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ theme: 'light', character: { id: 'bolt', name: 'Sparky' }, dock: { side: 'right', y: 0.3 } }))
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, DI_USER_DATA: USER_DATA, DI_HOME: HOME, DYNAMIC_ISLAND_SOCK: path.join(TMP, 's.sock'), DI_NO_GREETING: '1', DI_BACKDROP: 'off', DI_GSETTINGS: GS, DI_EXT_BASE_URL: `http://127.0.0.1:${ego.address().port}`, DI_GNOME_SHELL: SHELL, DI_GNOME_EXTENSIONS: GX, DI_EGRESS_COUNT_LOCAL: '1', DI_PKEXEC: SYS.pkexec, ...SYS.env },
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

    // ---- GNOME extensions ----
    const enabled = () => store()['org.gnome.shell enabled-extensions'] || ''
    check('Blur my Shell isn’t installed yet: Get it', await settings.waitForSelector('#desktop .desktop-ext[data-ext="blur"]:has-text("Not installed") button:has-text("Get it")', { timeout: 4000 }).then(() => true, () => false))
    await settings.click('#desktop .desktop-ext[data-ext="blur"] button:has-text("Get it")')
    check('Get it installs it (the version for this GNOME)', await settings.waitForSelector('#desktop .desktop-ext[data-ext="blur"]:has-text("log out and back in")', { timeout: 8000 }).then(() => true, () => false))
    check('from extensions.gnome.org', asked[0] === '/extension-info/?uuid=blur-my-shell%40aunetx&shell_version=42', asked[0])
    check('and, the look being on, it’s turned on too', !!(await until(() => enabled().includes('blur-my-shell@aunetx') && enabled().includes('ubuntu-dock@ubuntu.com'))), enabled())
    await settings.click('#desktop .desktop-ext[data-ext="perfection"] button:has-text("Get it")')
    await settings.waitForSelector('#desktop .desktop-ext[data-ext="perfection"] input[aria-label="Use Just Perfection"]', { timeout: 8000 })
    check('Just Perfection waits until you want the clock hidden', !enabled().includes('just-perfection'))
    await settings.click('#desktop .desktop-ext[data-ext="perfection"] input[aria-label="Use Just Perfection"]')
    check('then hides the top bar’s clock', !!(await until(() => store()['org.gnome.shell.extensions.just-perfection clock-menu'] === 'false' && enabled().includes('just-perfection-desktop@just-perfection'))))
    await settings.click('#desktop .desktop-ext[data-ext="blur"] input[aria-label="Use Blur my Shell"]')
    check('turning Blur my Shell off turns just it off', !!(await until(() => !enabled().includes('blur-my-shell') && enabled().includes('just-perfection'))), enabled())
    // Hide Top Bar: getting it is wanting the bar hidden, Mac-style.
    const hb = (k) => store()[`org.gnome.shell.extensions.hidetopbar ${k}`]
    const docked = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8')).dock?.side
    check('the island starts on the right here', docked() === 'right', docked())
    await settings.click('#desktop .desktop-ext[data-ext="hidebar"] button:has-text("Get it")')
    check('Get it installs Hide Top Bar and turns it on', !!(await until(() => enabled().includes('hidetopbar@mathieu.bidon.ca'))), enabled())
    check('the top bar hides like a Mac’s menu bar (always, back when the pointer pushes the top edge)', !!(await until(() => hb('mouse-sensitive') === 'true' && hb('enable-intellihide') === 'false' && hb('show-in-overview') === 'true' && hb('mouse-triggers-overview') === 'false')), JSON.stringify([hb('mouse-sensitive'), hb('enable-intellihide')]))
    check('and the island moves to the top centre, where the bar was', !!(await until(() => docked() === 'top')), docked())
    const islandWin = await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html'))
      const b = w.getBounds()
      const a = screen.getPrimaryDisplay().workArea
      return { mid: b.x + b.width / 2, center: a.x + a.width / 2, top: b.y - a.y, wide: b.width < a.width }
    })
    check('its window is the band at the top centre', Math.abs(islandWin.mid - islandWin.center) <= 1 && islandWin.top === 0 && islandWin.wide, JSON.stringify(islandWin))
    check('the switch shows it on', await settings.isChecked('#desktop .desktop-ext[data-ext="hidebar"] input[aria-label="Use Hide Top Bar"]').catch(() => false))
    await settings.click('#desktop .desktop-ext[data-ext="hidebar"] input[aria-label="Use Hide Top Bar"]')
    check('turning it off shows the bar again (its settings back as they were)', !!(await until(() => !enabled().includes('hidetopbar') && enabled().includes('just-perfection') && hb('mouse-sensitive') === 'false' && hb('enable-intellihide') === 'true')), JSON.stringify([enabled(), hb('mouse-sensitive'), hb('enable-intellihide'), hb('show-in-overview'), hb('mouse-triggers-overview')]))
    check('the island stays where it is', docked() === 'top', docked())
    await settings.click('#desktop .desktop-ext[data-ext="hidebar"] input[aria-label="Use Hide Top Bar"]')
    check('and on again', !!(await until(() => enabled().includes('hidetopbar') && hb('mouse-sensitive') === 'true')), enabled())
    await settings.screenshot({ path: `${OUT}/01-desktop.png` })
    await settings.click('#desktop button:has-text("Undo")')
    check('Undo puts back exactly what was there (extensions too)', !!(await until(() => JSON.stringify(store()) === JSON.stringify(BEFORE))), JSON.stringify(store()).slice(0, 400))
    const privacy = fs.readFileSync(path.join(USER_DATA, 'privacy-log.json'), 'utf8')
    check('the downloads are in the Privacy log', /"feature":"desktop"/.test(privacy))

    // ---- the login screen and boot splash (they ask for your password) ----
    await settings.click('#desktop .desktop-system button:has-text("Apply…")')
    check('the login screen and boot splash: Apply', await settings.waitForSelector('#desktop .desktop-system-note:has-text("Done: the login screen in Yaru-purple")', { timeout: 15000 }).then(() => true, () => false))
    check('through pkexec, once for each', SYS.calls().filter((c) => c.startsWith('pkexec /bin/sh ')).length === 2, SYS.calls().join(' | '))
    const keyfile = path.join(SYS.root, 'etc/dconf/db/gdm.d/90-dynamic-island')
    check('the login screen in the accent, light', fs.existsSync(keyfile) && /color-scheme='default'/.test(fs.readFileSync(keyfile, 'utf8')) && /gtk-theme='Yaru-purple'/.test(fs.readFileSync(keyfile, 'utf8')))
    check('and its shell theme', SYS.value('gdm-theme.gresource') === '/usr/share/gnome-shell/theme/Yaru-purple/gnome-shell-theme.gresource')
    check('the boot splash with the island’s orb', SYS.value('default.plymouth') === '/usr/share/plymouth/themes/island/island.plymouth' && fs.existsSync(path.join(SYS.root, 'usr/share/plymouth/themes/island/orb.png')) && SYS.calls().includes('update-initramfs -u'))
    await settings.screenshot({ path: `${OUT}/03-system.png` })
    await settings.click('#desktop .desktop-system button:has-text("Undo")')
    check('Undo puts both back', await settings.waitForSelector('#desktop .desktop-system-note:has-text("Put back")', { timeout: 15000 }).then(() => true, () => false))
    check('exactly as they were', !fs.existsSync(keyfile) && SYS.value('gdm-theme.gresource') === '/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource' && SYS.value('default.plymouth') === '/usr/share/plymouth/themes/bgrt/bgrt.plymouth')

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
    ego.close()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in ${OUT}`)
    process.exit(failed.length ? 1 : 0)
  }
})()
