// End-to-end test of Island OS's agents and The Agency: the Agents panel
// lists research, monitors and the roster that tends the brain; a monitor
// ("tell me when PR #43 is reviewed", through a stand-in gh) tells you once,
// on the island; research over the brain (a stand-in Ollama) plans, reads
// and writes a note with sources; a roster job runs from the panel; and The
// Agency (a small stand-in catalog) is downloaded on request, browsed by
// division, searched, installed into Claude Code and removed, and started
// in Claude with a draft; Agent Skills (a stand-in catalog laid out like
// Anthropic's) the same way, a whole skill folder at a time, with its
// licence; and the resting island counts the notes waiting to be filed.
// Needs an X server and a session bus.
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')
const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-agency-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const SOCK = path.join(TMP, 'island.sock')
const USER_DATA = path.join(TMP, 'profile')
const CLAUDE_DIR = path.join(TMP, 'claude-config')
const HOME = process.env.HOME && process.env.HOME !== os.userInfo().homedir ? process.env.HOME : path.join(TMP, 'home')
const VAULT = path.join(HOME, 'Brain')
const CATALOG = path.join(TMP, 'agency-catalog')
const SKILLS = path.join(TMP, 'skills-catalog')
const APPROVED = path.join(TMP, 'pr-43-approved')
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

// A small stand-in for The Agency's catalog (the real one is downloaded from GitHub).
const agent = (name, desc, emoji, color, vibe, body) => `---\nname: ${name}\ndescription: ${desc}\ncolor: ${color}\nemoji: ${emoji}\nvibe: ${vibe}\n---\n\n# ${name}\n\n${body}\n`
const files = {
  'divisions.json': JSON.stringify({ divisions: { engineering: { label: 'Engineering', icon: 'Code', color: '#3B82F6' }, design: { label: 'Design', icon: 'PenTool', color: '#EC4899' }, 'game-development': { label: 'Game Development', icon: 'Gamepad2', color: '#10B981' } } }),
  'engineering/engineering-frontend-developer.md': agent('Frontend Developer', 'Builds fast, accessible web interfaces.', '🖥️', 'cyan', 'Ships pixels that load fast.', 'You are a frontend developer. You care about speed and accessibility.'),
  'design/design-ui-designer.md': agent('UI Designer', 'Designs clear, consistent interfaces.', '🎨', 'purple', 'Makes it obvious where to click.', 'You are a UI designer.'),
  'game-development/godot/godot-shader-developer.md': agent('Godot Shader Developer', 'Writes shaders for Godot 4.', '🎮', 'green', 'Makes light do tricks.', 'You write Godot shaders in the Godot shading language.'),
  'integrations/claude-code/README.md': '# Claude Code integration\n',
  'README.md': '# The Agency\n',
}
for (const [p, body] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(CATALOG, p)), { recursive: true })
  fs.writeFileSync(path.join(CATALOG, p), body)
}
// And for Agent Skills (the real ones are github.com/anthropics/skills).
const skillFiles = {
  'skills/pdf/SKILL.md': '---\nname: pdf\ndescription: |-\n  Read, fill and merge PDF files.\n  Use it for forms.\nlicense: Complete terms in LICENSE.txt\n---\n\n# PDF\n\nUse pypdf to read and fill forms.\n',
  'skills/pdf/LICENSE.txt': '\n                                 Apache License\n                           Version 2.0, January 2004\n',
  'skills/pdf/scripts/fill.py': 'print("fill")\n',
  'skills/webapp-testing/SKILL.md': '---\nname: webapp-testing\ndescription: Test web apps with Playwright.\n---\n\nStart the server first.\n',
  'template/SKILL.md': '---\nname: template-skill\ndescription: A template.\n---\n',
  'README.md': '# Skills\n',
}
for (const [p, body] of Object.entries(skillFiles)) {
  fs.mkdirSync(path.dirname(path.join(SKILLS, p)), { recursive: true })
  fs.writeFileSync(path.join(SKILLS, p), body)
}

;(async () => {
  const ai = await startFakeAi()
  const hist = path.join(HOME, '.zsh_history')
  fs.writeFileSync(hist, '')
  // (No evening digest: after 18:00 its card would stand in for the resting island.)
  fs.writeFileSync(path.join(USER_DATA, 'config.json'), JSON.stringify({ sources: { on: { shell: true, github: true } }, buddy: { digest: false } }))
  const gh = path.join(__dirname, 'fake-gh.cjs')
  fs.chmodSync(gh, 0o755)
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(SCALE !== 1 ? [`--force-device-scale-factor=${SCALE}`] : [])],
    cwd: ROOT,
    env: { ...process.env, HOME, DYNAMIC_ISLAND_SOCK: SOCK, CLAUDE_CONFIG_DIR: CLAUDE_DIR, DI_USER_DATA: USER_DATA, DI_NO_GREETING: '1', DI_BACKDROP: 'off', DI_GH: gh, FAKE_GH_APPROVED: APPROVED, DI_OLLAMA_URL: ai.base, DI_AI_BASE_URL: ai.base, DI_CLAUDE_BIN: '/nonexistent', DI_EGRESS_COUNT_LOCAL: '1', DI_AGENCY_URL: CATALOG, DI_SKILLS_URL: SKILLS },
  })
  const page = await app.firstWindow()
  const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {})
  const os_ = (fn, ...args) => page.evaluate(({ fn, args }) => window.island.os(fn, ...args), { fn, args })
  try {
    await page.waitForSelector('.capsule.idle', { timeout: 15000 })
    // Today's activity: the terminal (from now on) and GitHub.
    await os_('sources.check', 'shell')
    const t = Math.floor(Date.now() / 1000)
    fs.appendFileSync(hist, `: ${t}:0;npm test\n`)
    await os_('sources.check', 'shell')
    await os_('sources.check', 'github')
    check('the day has activity to work from', (await os_('today.view')).timeline.flatMap((h) => h.entries).length >= 3)

    // A brain, for research notes and the roster.
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings('brain'))])
    await settings.waitForSelector('#brain', { timeout: 8000 })
    check('a brain is made', (await settings.evaluate((v) => window.settings.brain.create(v), VAULT)) === null)
    await settings.close()

    // ---- The Agents panel ----
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 4000 })
    await page.click('.rail-btn[aria-label="Agents"]')
    check('Agents has research, monitors and the roster', await seen(page, '.agents input[aria-label="Research a question"]') && (await seen(page, '.agents input[aria-label="Tell me when"]')) && (await until(async () => (await page.$$('.agents .agent-row.roster')).length === 3)))
    check('the roster: People, Inbox and Projects', (await page.$$eval('.agent-row.roster .agent-name', (e) => e.map((x) => x.textContent))).join(',') === 'People,Inbox,Projects')
    check('with the week’s usage', await seen(page, '.agents-week:has-text("This week:")'))

    // A monitor: watching, then it tells you once.
    await page.fill('.agents input[aria-label="Tell me when"]', 'tell me when PR #43 is reviewed')
    await page.press('.agents input[aria-label="Tell me when"]', 'Enter')
    check('a monitor watches (the repository from your GitHub activity)', await seen(page, '.agent-row.monitor.watching:has-text("tell me when PR #43 is reviewed") .agent-state:has-text("watching")', 8000))
    check('it knows which pull request', (await os_('agents.view')).monitors[0]?.target === 'me/island')
    fs.writeFileSync(APPROVED, 'yes')
    await os_('agents.check')
    check('when it’s approved, the monitor says so', await seen(page, '.agent-row.monitor.done:has-text("me/island#43 (The engine) was approved by asha.")', 8000))
    check('and it tells you on the island, once', !!(await until(async () => (await page.evaluate(() => window.island.notifications.view())).entries.filter((e) => e.app === 'Island OS' && /approved by asha/.test(e.body ?? '')).length === 1)))
    await os_('agents.check')
    check('checking again doesn’t tell you twice', (await page.evaluate(() => window.island.notifications.view())).entries.filter((e) => /approved by asha/.test(e.body ?? '')).length === 1)

    // Research over the brain.
    await page.fill('.agents input[aria-label="Research a question"]', 'What did I do today?')
    await page.press('.agents input[aria-label="Research a question"]', 'Enter')
    check('research runs and finishes with an answer', await seen(page, '.agent-row.research.done:has-text("You ran the tests [1] and merged the engine [2].")', 15000))
    const job = (await os_('agents.view')).research[0]
    const note = job?.path ? fs.readFileSync(path.join(VAULT, job.path), 'utf8') : ''
    check('it writes a note in the brain with its sources', /## When did I run npm test\?/.test(note) && /## Sources\n\n1\. /.test(note) && job.where === 'local', job?.path)
    await sleep(300)
    await shot(page, '01-agents')

    // A roster job, from the panel.
    await page.click('.agent-row.roster[data-job="projects"] button:has-text("Run now")')
    check('Run now runs the roster job', await seen(page, '.agent-row.roster[data-job="projects"] .agent-sub:has-text("No projects in the brain yet.")', 8000))

    // ---- The Agency ----
    await page.click('.agents-agency')
    check('The Agency is downloaded only when you ask', await seen(page, '.agency-get button:has-text("Get The Agency")'))
    await page.click('.agency-get button')
    check('then lists its agents', !!(await until(async () => (await page.$$('.agency-row')).length === 3, 10000)))
    check('with its divisions', (await page.$$eval('.agency-divisions button', (e) => e.map((x) => x.textContent))).join(',') === 'All,Design,Engineering,Game Development')
    check('and credits it', await seen(page, '.agency-credit:has-text("The Agency, by AgentLand Contributors (MIT licence)")'))
    await page.click('.agency-divisions button:has-text("Design")')
    check('a division narrows the list', !!(await until(async () => (await page.$$('.agency-row')).length === 1)))
    await page.click('.agency-divisions button:has-text("All")')
    await page.fill('.agency-search', 'shader')
    check('search finds an agent (sub-folders too)', !!(await until(async () => (await page.$$eval('.agency-row', (e) => e.map((x) => x.textContent))).join() .includes('Godot Shader Developer') && (await page.$$('.agency-row')).length === 1)))
    await sleep(300)
    await shot(page, '02-agency')
    await page.click('.agency-row')
    check('an agent opens with its instructions', await seen(page, '.agency-hero:has-text("Godot Shader Developer")') && (await seen(page, '.agency-body:has-text("Godot shading language")')))
    await page.click('.agency-actions button:has-text("Install for Claude Code")')
    const installed = path.join(CLAUDE_DIR, 'agents', 'godot-shader-developer.md')
    check('Install puts it in Claude Code’s agents', !!(await until(() => fs.existsSync(installed))) && /^---\nname: godot-shader-developer\n/.test(fs.readFileSync(installed, 'utf8')))
    check('and says so', await seen(page, '.agency-actions button:has-text("Remove from Claude Code")'))
    await sleep(300)
    await shot(page, '03-agent')
    await page.click('.agency-actions button:has-text("Remove from Claude Code")')
    check('Remove takes it out again', !!(await until(() => !fs.existsSync(installed))))
    await page.click('.agency-back')
    await page.fill('.agency-search', 'frontend')
    await until(async () => (await page.$$('.agency-row')).length === 1)
    await page.click('.agency-row')
    await page.click('.agency-actions button:has-text("Start in Claude")')
    check('Start in Claude opens the Claude tab with a draft', !!(await until(async () => (await page.$eval('.claude-field textarea', (e) => e.value).catch(() => '')).startsWith('Use the engineering-frontend-developer agent (Frontend Developer) to '))))
    check('with the agent installed for it', fs.existsSync(path.join(CLAUDE_DIR, 'agents', 'engineering-frontend-developer.md')))

    // ---- Agent Skills ----
    await page.click('.rail-btn[aria-label="Agents"]')
    await page.click('.agents-agency.skills')
    check('Agent Skills are downloaded only when you ask', await seen(page, '.agency-get button:has-text("Get Agent Skills")'))
    await page.click('.agency-get button')
    check('then lists the skills (not the template)', !!(await until(async () => (await page.$$('.agency-row[data-skill]')).length === 2, 10000)))
    check('and credits Anthropic', await seen(page, '.agency-credit:has-text("Agent Skills, by Anthropic")'))
    await page.fill('.agency-search', 'forms')
    check('search finds a skill by what it does', !!(await until(async () => (await page.$$eval('.agency-row[data-skill]', (e) => e.map((x) => x.getAttribute('data-skill')))).join() === 'pdf')))
    await page.click('.agency-row[data-skill="pdf"]')
    check('a skill opens with its licence and files', (await seen(page, '.agency-hero:has-text("Apache 2.0 · 3 files")')) && (await seen(page, '.agency-body:has-text("Use pypdf")')))
    await shot(page, '04-skill')
    await page.click('.agency-actions button:has-text("Install for Claude Code")')
    const skillDir = path.join(CLAUDE_DIR, 'skills', 'pdf')
    check('Install copies the whole skill into Claude Code', !!(await until(() => fs.existsSync(path.join(skillDir, 'scripts', 'fill.py')))) && /^---\nname: pdf\n/.test(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')))
    check('marked as the island’s, with its licence', /"licence": "Apache 2.0"/.test(fs.readFileSync(path.join(skillDir, '.from-dynamic-island.json'), 'utf8')))
    check('and says so', await seen(page, '.agency-actions button:has-text("Remove from Claude Code")'))
    await page.click('.agency-actions button:has-text("Remove from Claude Code")')
    check('Remove takes it out again', !!(await until(() => !fs.existsSync(skillDir))))
    await page.click('.agency-actions button:has-text("Use in Claude")')
    check('Use in Claude opens the Claude tab with a draft', !!(await until(async () => (await page.$eval('.claude-field textarea', (e) => e.value).catch(() => '')).startsWith('Use the pdf skill to '))))

    // ---- The resting island: what waits to be filed ----
    for (const n of ['a', 'b']) fs.writeFileSync(path.join(VAULT, '01-inbox', `2026-11-08-note-${n}.md`), `---\ntype: note\n---\n\nNote ${n}\n`)
    const toFile = await until(async () => (await os_('status.view')).toFile >= 2 && (await os_('status.view')).toFile)
    check('the island knows how many notes wait to be filed', !!toFile, String(toFile))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
    // (An agents change, like a monitor's check, refreshes it at once; otherwise every minute.)
    await os_('agents.check')
    check('a small count sits on the resting island', !!(await until(async () => (await page.$eval('.capsule.idle .file-badge', (e) => e.textContent).catch(() => '')) === String(toFile), 10000)))
    await shot(page, '05-resting')
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
