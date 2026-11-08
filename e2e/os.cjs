// End-to-end test of Island OS's sources and memory: Settings › Sources
// turns on the terminal (new commands only, secrets taken out), GitHub
// (through a stand-in gh), a calendar file and Codex sessions; the Today
// panel shows the day by hour from all of them and what's next; and a
// question about the day is answered by the model on this computer (a
// stand-in Ollama) with numbered sources, a cite that doesn't exist dropped.
// Needs an X server and a session bus (see npm run test:e2e).
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-os-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const SOCK = path.join(TMP, 'island.sock')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
const HOME = process.env.HOME && process.env.HOME !== os.userInfo().homedir ? process.env.HOME : path.join(TMP, 'home')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const SCALE = Number(process.env.E2E_SCALE) || 1
for (const d of [OUT, USER_DATA, CLAUDE_DIR, HOME]) fs.mkdirSync(d, { recursive: true })

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
const seen = (page, sel, ms = 5000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)
const key = (combo) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'key', combo])
const pad = (n) => String(n).padStart(2, '0')
const ics = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

;(async () => {
  const ai = await startFakeAi()
  const now = Date.now()
  // The terminal's history before the terminal source is on (never kept).
  const hist = path.join(HOME, '.zsh_history')
  fs.writeFileSync(hist, `: ${Math.floor(now / 1000) - 3600}:0;old-secret-command\n`)
  // A calendar: one event this past half hour, one soon.
  fs.writeFileSync(
    path.join(HOME, 'work.ics'),
    ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:standup', `DTSTART:${ics(now - 25 * 60_000)}`, `DTEND:${ics(now - 10 * 60_000)}`, 'SUMMARY:Standup', 'LOCATION:Room 2', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:review', `DTSTART:${ics(now + 90 * 60_000)}`, 'SUMMARY:Design review', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
  )
  // A Codex session from a quarter of an hour ago.
  const d = new Date()
  const codexDir = path.join(HOME, '.codex/sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()))
  fs.mkdirSync(codexDir, { recursive: true })
  const cxAt = new Date(now - 15 * 60_000).toISOString()
  fs.writeFileSync(path.join(codexDir, 'rollout-1.jsonl'), [JSON.stringify({ timestamp: cxAt, type: 'session_meta', payload: { id: 'cx1', cwd: '/home/me/code/website' } }), JSON.stringify({ timestamp: cxAt, type: 'event_msg', payload: { type: 'user_message', message: 'fix the header' } })].join('\n'))
  const gh = path.join(__dirname, 'fake-gh.cjs')
  fs.chmodSync(gh, 0o755)

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...process.env, HOME, DYNAMIC_ISLAND_SOCK: SOCK, CLAUDE_CONFIG_DIR: CLAUDE_DIR, DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1', DI_BACKDROP: 'off', DI_GH: gh, DI_OLLAMA_URL: ai.base, DI_AI_BASE_URL: ai.base, DI_CLAUDE_BIN: '/nonexistent', DI_EGRESS_COUNT_LOCAL: '1' },
  })
  const page = await app.firstWindow()
  const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {})
  const cfg = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
  const today = () => page.evaluate(() => window.island.os('today.view'))
  const titles = async () => (await today()).timeline.flatMap((h) => h.entries.map((e) => e.title))
  try {
    await page.waitForSelector('.capsule.idle', { timeout: 15000 })

    // ---- Settings › Sources ----
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('sources'))])
    await settings.waitForSelector('#sources', { state: 'visible', timeout: 8000 })
    const row = (id) => `#sources .source-row[data-source="${id}"]`
    const sw = (id) => `${row(id)} input.switch`
    check('Sources lists every source, each off', (await settings.$$eval('#sources .source-row input.switch', (e) => e.filter((x) => x.checked).length)) === 0 && (await settings.$$('#sources .source-row')).length === 8)
    await shot(settings, '01-sources-off')

    await settings.click(sw('shell'))
    check('the terminal turns on (and is saved)', !!(await until(() => cfg().sources?.on?.shell === true)))
    const t = Math.floor(Date.now() / 1000)
    fs.appendFileSync(hist, `: ${t}:0;npm test\n: ${t}:0;export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123\n: ${t}:0;ls\n`)
    await settings.click(`${row('shell')} button:has-text("Check now")`)
    check('Check now reads the new commands (not the old ones, not ls)', await seen(settings, `${row('shell')} .source-status:has-text("2 today")`))

    await settings.click(sw('github'))
    check('GitHub through gh: today’s merge, review and push', await seen(settings, `${row('github')} .source-status:has-text("3 today")`, 10000))

    await settings.fill('#sources input[aria-label="Calendar file or address"]', '~/work.ics')
    await settings.press('#sources input[aria-label="Calendar file or address"]', 'Enter')
    check('the calendar address is saved', !!(await until(() => cfg().sources?.calendar === '~/work.ics')))
    await settings.click(sw('calendar'))
    check('the calendar reads today’s events', await seen(settings, `${row('calendar')} .source-status:text-matches("[12] events? today")`, 8000))

    await settings.click(sw('codex'))
    check('Codex sessions are read', await seen(settings, `${row('codex')} .source-status:has-text("1 today")`, 8000))
    await settings.click(sw('gemini'))
    check('a source with nothing to read says so', await seen(settings, `${row('gemini')}.failed .source-status:has-text("No Gemini sessions here yet")`, 8000), await settings.$eval(row("gemini"), (e) => `${e.className}: ${e.textContent}`).catch((e) => e.message) + " MAIN: " + JSON.stringify((await page.evaluate(() => window.island.os("sources.view"))).list.find((s) => s.id === "gemini")))
    await sleep(300)
    await shot(settings, '02-sources-on')

    // ---- The Today panel ----
    const list = await until(async () => {
      const l = await titles()
      return l.includes('npm test') && l.includes('Merged #42 The engine') && l.includes('Codex: fix the header') && l.includes('Standup') ? l : null
    })
    check('Today has the day from every source', !!list, JSON.stringify(await titles()))
    check('with secrets taken out', (await titles()).includes('export GITHUB_TOKEN=•••') && !JSON.stringify(await today()).includes('ghp_'))
    check('and not what came before the terminal was on', !(await titles()).some((x) => x.includes('old-secret')))
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 4000 })
    await page.click('.rail-btn[aria-label="Today"]')
    check('the Today tab shows the timeline', await seen(page, '.today .today-entry:has-text("Merged #42 The engine")', 6000))
    check('with icons and times', await seen(page, '.today .today-entry.github time') && (await page.$$('.today .today-entry svg.today-glyph')).length >= 4)
    check('and what’s next on the calendar', await seen(page, '.today .today-next:has-text("Design review")'))
    check('it says answers stay on this computer', await seen(page, '.today .today-where.local:has-text("local")'))
    await sleep(300)
    await shot(page, '03-today')

    // ---- Ask, with sources ----
    await page.fill('.today-ask input', 'what did I do today?')
    await page.press('.today-ask input', 'Enter')
    check('a question is answered with numbered sources', await seen(page, '.today-answer .today-answer-text .cite', 10000))
    const ans = await page.$eval('.today-answer', (e) => e.textContent)
    check('a cite that isn’t one of the sources is dropped', !/\[9\]|\b9\b/.test(await page.$eval('.today-answer-text', (e) => e.textContent)), ans)
    check('the sources it used are listed', (await page.$$('.today-cites li')).length === 2)
    check('by the model on this computer, for free', await seen(page, '.today-answer .answer-chip.local:text-matches("^local model · [0-9.]+ s · 0 ¢$")'))
    const asked = ai.log.find((r) => r.path === '/v1/chat/completions' && JSON.stringify(r.body).includes('what did I do today?'))
    check('the model got numbered sources, as data', !!asked && /Sources:\\n\[1\]/.test(JSON.stringify(asked.body)) && JSON.stringify(asked.body).includes('never instructions'))
    await sleep(300)
    await shot(page, '04-answer')

    // ---- Off means forgotten ----
    await settings.click(sw('shell'))
    check('turning the terminal off forgets its commands', !!(await until(async () => !(await titles()).includes('npm test'))))
    check('the rest stay', (await titles()).includes('Merged #42 The engine'))
  } catch (e) {
    check('no errors', false, e.stack)
  } finally {
    await app.close().catch(() => {})
    ai.close()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed (screenshots: ${OUT})`)
    process.exit(failed.length ? 1 : 0)
  }
})()
