// Screenshots of Island OS for the README, from the real app with made-up
// data: a stand-in Ollama, gh and calendar, a terminal history and a Codex
// session. Agent Skills come from SKILLS_DIR (a checkout of
// github.com/anthropics/skills) when it's given. Run it under an X server:
//
//   npm run build
//   SKILLS_DIR=~/src/skills xvfb-run -a -s "-screen 0 1920x1080x24" dbus-run-session -- node scripts/video/island-os-shots.cjs [out folder]
//
// It writes island-os-today.png, island-os-agents.png and island-os-skills.png
// (at twice the size, for sharp screens) to the folder (docs/media by default).
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('../../e2e/fake-ai.cjs')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/media'))
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-os-shots-'))
const HOME = path.join(TMP, 'home')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
const VAULT = path.join(HOME, 'Brain')
const APPROVED = path.join(TMP, 'pr-43-approved')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
for (const d of [OUT, HOME, USER_DATA, CLAUDE_DIR]) fs.mkdirSync(d, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (f, ms = 10000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) {
    try {
      const v = await f()
      if (v) return v
    } catch {}
  }
  return null
}
const pad = (n) => String(n).padStart(2, '0')
const ics = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

;(async () => {
  const ai = await startFakeAi()
  // Today's question, answered from the sources it was given (numbered as they were).
  ai.answer = (prompt) => {
    if (!/\nSources:\n\[1\]/.test(prompt)) return null
    const src = [...prompt.matchAll(/^\[(\d+)\] (.+?) \(/gm)].map(([, n, t]) => ({ n, t }))
    const find = (re) => src.find((s) => re.test(s.t))
    const merged = find(/^Merged/)
    const fixed = find(/^Approved/)
    const tests = find(/npm test/)
    const parts = [merged && `merged the engine [${merged.n}]`, fixed && `approved the CI fix on the API [${fixed.n}]`, tests && `ran the tests before you pushed [${tests.n}]`].filter(Boolean)
    return parts.length ? `Today you ${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' and ' : ''}${parts[parts.length - 1]}. The design review is still to come.` : null
  }
  const now = Date.now()
  fs.writeFileSync(path.join(HOME, '.zsh_history'), '')
  fs.writeFileSync(
    path.join(HOME, 'work.ics'),
    ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:standup', `DTSTART:${ics(now - 50 * 60_000)}`, `DTEND:${ics(now - 35 * 60_000)}`, 'SUMMARY:Standup', 'LOCATION:Room 2', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:review', `DTSTART:${ics(now + 75 * 60_000)}`, 'SUMMARY:Design review with Asha', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
  )
  const d = new Date()
  const codexDir = path.join(HOME, '.codex/sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()))
  fs.mkdirSync(codexDir, { recursive: true })
  const cxAt = new Date(now - 20 * 60_000).toISOString()
  fs.writeFileSync(path.join(codexDir, 'rollout-1.jsonl'), [JSON.stringify({ timestamp: cxAt, type: 'session_meta', payload: { id: 'cx1', cwd: '/home/me/code/website' } }), JSON.stringify({ timestamp: cxAt, type: 'event_msg', payload: { type: 'user_message', message: 'fix the header on mobile' } })].join('\n'))
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ sources: { on: { shell: true, github: true, calendar: true, codex: true }, calendar: '~/work.ics' } }))
  const gh = path.join(ROOT, 'e2e/fake-gh.cjs')
  fs.chmodSync(gh, 0o755)

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', '--force-device-scale-factor=2'],
    cwd: ROOT,
    env: {
      ...process.env,
      HOME,
      DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
      CLAUDE_CONFIG_DIR: CLAUDE_DIR,
      DI_USER_DATA: USER_DATA,
      DI_NO_GREETING: '1',
      DI_BACKDROP: 'off',
      DI_GH: gh,
      FAKE_GH_APPROVED: APPROVED,
      DI_OLLAMA_URL: ai.base,
      DI_AI_BASE_URL: ai.base,
      DI_CLAUDE_BIN: '/nonexistent',
      ...(process.env.SKILLS_DIR ? { DI_SKILLS_URL: path.resolve(process.env.SKILLS_DIR) } : {}),
    },
  })
  const page = await app.firstWindow()
  const os_ = (fn, ...args) => page.evaluate(({ fn, args }) => window.island.os(fn, ...args), { fn, args })
  // The panel and its rail, with room for the shadow.
  const shot = async (name) => {
    await sleep(500)
    const box = await page.evaluate(() => {
      const r = [document.querySelector('.hub'), document.querySelector('.rail')].filter(Boolean).map((e) => e.getBoundingClientRect())
      const x = Math.min(...r.map((b) => b.left))
      const y = Math.min(...r.map((b) => b.top))
      return { x, y, w: Math.max(...r.map((b) => b.right)) - x, h: Math.max(...r.map((b) => b.bottom)) - y }
    })
    const m = 18
    await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: box.w + 2 * m, height: box.h + 2 * m } })
    console.log(`wrote ${path.join(OUT, `${name}.png`)}`)
  }
  try {
    await page.waitForSelector('.capsule.idle', { timeout: 15000 })
    // A brain, for research and the roster.
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('brain'))])
    await settings.waitForSelector('#brain', { timeout: 8000 })
    await settings.evaluate((v) => window.settings.brain.create(v), VAULT)
    await settings.close()
    // The terminal keeps what you run from now on.
    await os_('sources.check', 'shell')
    const t = Math.floor(Date.now() / 1000)
    fs.appendFileSync(path.join(HOME, '.zsh_history'), `: ${t - 900}:0;cd ~/code/island && npm test\n: ${t - 600}:0;git push origin main\n`)
    for (const s of ['shell', 'github', 'calendar', 'codex']) await os_('sources.check', s)
    await until(async () => (await os_('today.view')).timeline.flatMap((h) => h.entries).length >= 5)

    // Agents: a monitor that told you, one watching, and research with sources.
    await os_('agents.monitor', 'tell me when PR #43 is reviewed')
    await os_('agents.monitor', 'tell me when anyone mentions Acme')
    await sleep(500)
    fs.writeFileSync(APPROVED, 'yes')
    await os_('agents.check')
    await os_('agents.research', 'What did I ship this week?')
    await until(async () => (await os_('agents.view')).research.some((j) => j.state === 'done'), 20000)

    // Today, with a question answered on this computer.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
    await page.waitForSelector('.hub', { timeout: 5000 })
    await page.click('.rail-btn[aria-label="Today"]')
    await page.fill('.today-ask input', 'What did I do today?')
    await page.press('.today-ask input', 'Enter')
    await page.waitForSelector('.today-answer .today-cites', { timeout: 15000 })
    await page.$eval('.today-ask input', (e) => e.blur())
    await shot('island-os-today')

    await page.click('.rail-btn[aria-label="Agents"]')
    await page.waitForSelector('.agent-row.monitor.done', { timeout: 8000 })
    await shot('island-os-agents')

    if (process.env.SKILLS_DIR) {
      await page.click('.agents-agency.skills')
      await page.click('.agency-get button')
      await page.waitForSelector('.agency-row[data-skill]', { timeout: 20000 })
      await page.click('.agency-row[data-skill="pdf"]').catch(() => {})
      await page.waitForSelector('.agency-hero', { timeout: 8000 }).catch(() => {})
      await page.click('.agency-actions button:has-text("Install for Claude Code")').catch(() => {})
      await page.waitForSelector('.agency-actions button:has-text("Remove from Claude Code")', { timeout: 8000 }).catch(() => {})
      await page.click('.agency-back')
      await shot('island-os-skills')
    }
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
    ai.close()
  }
})()
