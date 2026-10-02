// End-to-end test of the CRM package in the real Electron app: adding a
// contact by hand, logging a call, follow-ups, deals and stages, import
// (with undo) and export, the agent running it (two changes, undone in one
// go; deleting asks first; it knows which contact you're looking at), and a
// reminder card when a follow-up is due. Against e2e/fake-ai.cjs.
const { _electron } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { startFakeAi } = require('./fake-ai.cjs')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-crm-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const MADE = path.join(TMP, 'Dynamic Island')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
// E2E_SCALE=2 simulates a HiDPI display.
const SCALE = Number(process.env.E2E_SCALE) || 1
for (const d of [OUT, USER_DATA]) fs.mkdirSync(d, { recursive: true })

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
const gone = (page, selector, ms = 6000) => page.waitForSelector(selector, { state: 'detached', timeout: ms }).then(() => true, () => false)

;(async () => {
  // Contacts to import, as Google Contacts exports them: Priya is new, Rahul gets his phone.
  const csv = path.join(TMP, 'google.csv')
  fs.writeFileSync(
    csv,
    'First Name,Last Name,Organization Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Value,Labels\n' +
      'Priya,Nair,Studio P,* Work,priya@studio.in,98200 11111,* myContacts ::: Design\n' +
      'Rahul,Sharma,Acme,* Work,rahul@acme.com,+91 98765 43210,\n',
  )
  const ai = await startFakeAi()
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({ dock: { side: 'right', y: 0.3 }, character: { id: 'mochi', name: 'Sparky' }, ai: { provider: 'ollama', models: { ollama: 'llama3.2' } } }),
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
      DI_CRM_PICK: csv,
      DI_CRM_REMIND_MS: '1000',
      DI_NO_OPEN: '1',
    },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {})
  const togglePanel = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('island:toggle-panel'))
  const view = () => page.evaluate(() => window.island.claude.state())
  const waitDone = () => until(async () => ['done', 'error', 'stopped'].includes((await view()).run?.phase), 10000)
  const crmFile = () => JSON.parse(fs.readFileSync(path.join(USER_DATA, 'crm', 'crm.json'), 'utf8'))
  const text = (sel) => page.textContent(sel, { timeout: 2000 }).catch(() => '')
  const tab = (name) => page.click(`.crm-tabs button:has-text("${name}")`)
  const field = (label) => `.crm-form [aria-label="${label}"]`
  const ask = async (t) => {
    await page.fill('.crm-ask textarea', t)
    await page.press('.crm-ask textarea', 'Enter')
  }

  try {
    await sleep(1500)
    await togglePanel()
    await page.waitForSelector('.hub', { timeout: 5000 })
    check('the rail has a CRM tab', !!(await page.$('.rail-btn[aria-label="CRM"]')))
    await page.click('.rail-btn[aria-label="CRM"]')
    check('an empty CRM invites you to add or import people', await seen(page, '.crm-view .empty:has-text("Your people live here")'))
    await sleep(500)
    await shot('01-empty')

    // ---- By hand: a contact, a call, a follow-up, a deal ----
    await page.click('.crm-view .empty button:has-text("Add Contact")')
    await page.waitForSelector('.crm-form', { timeout: 3000 })
    await page.fill(field('Name'), 'Rahul Sharma')
    await page.fill(field('Company'), 'Acme')
    await page.fill(field('Job title'), 'CTO')
    await page.fill(field('Emails'), 'rahul@acme.com')
    await page.fill(field('Tags'), 'expo, vip')
    await page.click('.crm-form .chip.status-lead')
    await shot('02-form')
    await page.click('.crm-form-actions button:has-text("Add")')
    check('adding a contact opens their page', await seen(page, '.crm-page[data-page="Rahul Sharma"]', 4000))
    check('with their details', (await text('.crm-page')).includes('CTO at Acme') && (await text('.crm-details')).includes('rahul@acme.com') && (await text('.crm-tags')).includes('vip'))
    check('and their status', !!(await page.$('.crm-status-chips .chip.status-lead.on')))
    check('saved on this computer', await until(() => fs.existsSync(path.join(USER_DATA, 'crm', 'crm.json')) && crmFile().contacts[0]?.name === 'Rahul Sharma', 3000))

    await page.click('.crm-log .chip:has-text("Call")')
    await page.fill('.crm-log [aria-label="What happened"]', 'Wants a quote for the new website')
    await page.click('.crm-log button:has-text("Log")')
    check('a call is logged on the timeline', await seen(page, '.crm-entry.kind-call:has-text("Wants a quote for the new website")', 3000))

    await page.click('.crm-section:has-text("Follow-ups") .crm-add')
    await page.fill(field('Follow-up'), 'Send the proposal')
    await page.click('.crm-due-chips .chip:has-text("Today")')
    await page.click('.crm-form-actions button:has-text("Add")')
    check('a follow-up for today is added to them', await seen(page, '.crm-page .crm-task[data-task="Send the proposal"]:has-text("Today")', 3000))
    await page.click('.crm-task[data-task="Send the proposal"] .crm-check')
    check('ticking it off marks it done', await seen(page, '.crm-task.done[data-task="Send the proposal"]', 3000))

    await page.click('.crm-section:has-text("Deals") .crm-add')
    await page.fill(field('Deal'), 'Website redesign')
    await page.fill(field('Value'), '12500')
    await page.click('.crm-form .chip.stage-proposal')
    check('a deal made from their page is theirs', (await text('.crm-picked')).includes('Rahul Sharma'))
    await page.click('.crm-form-actions button:has-text("Add")')
    check('the deal page shows its value and stage', await seen(page, '.crm-page[data-page="Website redesign"] .chip.stage-proposal.on', 3000) && (await text('.crm-deal-value')).includes('12,500'))
    await page.click('.crm-stages .chip:has-text("Won")')
    check('moving it to Won', await seen(page, '.crm-stages .chip.stage-won.on', 3000))
    check('records when it closed', await until(() => !!crmFile().deals[0]?.closedAt, 3000))
    await shot('03-deal')
    await page.click('.crm-subhead .back')
    check('back to their page, the deal is listed', await seen(page, '.crm-page[data-page="Rahul Sharma"] .crm-deal-card:has-text("Won")', 3000))
    await shot('04-contact')
    await page.click('.crm-subhead .back')

    // ---- Lists ----
    check('People lists them with their status', await seen(page, '.crm-person[data-contact="Rahul Sharma"] .crm-pill.status-lead', 3000))
    await tab('Deals')
    check('Deals shows the pipeline', await seen(page, '.crm-pipeline', 3000))
    await page.click('.crm-filters .chip:has-text("Won")')
    check('and the won deal under Won', await seen(page, '.crm-deal-row[data-deal="Website redesign"]', 3000))
    await tab('Follow-ups')
    await page.click('.crm-filters .chip:has-text("Done")')
    check('Follow-ups shows what’s done', await seen(page, '.crm-task.done[data-task="Send the proposal"]', 3000))
    await tab('People')

    // ---- Import (undoable) and export ----
    await page.click('.crm-head [aria-label="More"]')
    await page.click('.crm-menu-item:has-text("Import contacts")')
    check('importing a Google Contacts file', await until(async () => (await text('.crm-toast')).includes('Imported google.csv: 1 added, 1 filled in.'), 5000), await text('.crm-toast'))
    check('adds who’s new', await seen(page, '.crm-person[data-contact="Priya Nair"]', 3000))
    check('and fills in who’s there, without a duplicate', (await page.$$('.crm-person')).length === 2 && (await until(() => crmFile().contacts[0].phones[0] === '+91 98765 43210', 3000)))
    await page.click('.crm-toast button:has-text("Undo")')
    check('Undo takes the import back', await gone(page, '.crm-person[data-contact="Priya Nair"]', 3000) && (await until(() => crmFile().contacts[0].phones.length === 0, 3000)))
    await page.click('.crm-head [aria-label="More"]')
    await page.click('.crm-menu-item:has-text("Import contacts")')
    await page.waitForSelector('.crm-person[data-contact="Priya Nair"]', { timeout: 4000 })
    await page.click('.crm-head [aria-label="More"]')
    await page.click('.crm-menu-item:has-text("Export contacts")')
    const day = new Date().toISOString().slice(0, 10)
    check('exporting saves a CSV in Documents', await until(() => fs.existsSync(path.join(MADE, `CRM contacts ${day}.csv`)), 3000))
    check('with everyone in it', fs.existsSync(path.join(MADE, `CRM contacts ${day}.csv`)) && fs.readFileSync(path.join(MADE, `CRM contacts ${day}.csv`), 'utf8').split('\n').length === 4)

    // ---- The agent runs it ----
    ai.log.length = 0
    await ask('log a call with Priya and remind me tomorrow')
    await waitDone()
    check('the agent logs the call and adds a follow-up', (await view()).run?.reply === 'Logged the call and added a follow-up for tomorrow.', (await view()).run?.reply)
    const tools = ai.log.find((l) => l.path === '/chat/completions')?.body.tools.map((t) => t.function.name) ?? []
    check('using the CRM tools', ['crm_find', 'crm_log', 'crm_add_task', 'crm_delete', 'crm_undo', 'crm_import'].every((n) => tools.includes(n)))
    check('then offers to undo both changes in one go', await seen(page, '.crm-undo:has-text("Sparky made 2 changes")', 3000), await text('.crm-undo'))
    check('the changes are real', await until(() => crmFile().activities.some((a) => a.text === 'Talked about the proposal') && crmFile().tasks.some((t) => t.title === 'Follow up with Priya'), 3000))
    await shot('05-agent')
    await page.click('.crm-undo button:has-text("Undo")')
    check('Undo puts it all back', await until(() => !crmFile().activities.some((a) => a.text === 'Talked about the proposal') && !crmFile().tasks.some((t) => t.title === 'Follow up with Priya'), 3000))
    check('and says so', (await text('.crm-toast')).includes('Undone.'))

    await ask('add Meera Iyer from Initech as a lead')
    await waitDone()
    check('the agent adds people', await seen(page, '.crm-person[data-contact="Meera Iyer"] .crm-pill.status-lead', 3000))

    await ask('delete Priya')
    check('deleting someone asks first', await seen(page, '.card.agent-ask:has-text("Delete Priya Nair from the CRM")', 8000))
    await sleep(600)
    await shot('06-asks-first')
    await page.click('.agent-ask button.deny')
    await waitDone()
    await sleep(500)
    check('Don’t Allow keeps them', crmFile().contacts.some((c) => c.name === 'Priya Nair'))
    if (!(await page.$('.hub'))) await togglePanel()
    await page.waitForSelector('.crm-view', { timeout: 5000 })

    // On someone's page, the agent is told who you're looking at.
    await page.click('.crm-person[data-contact="Rahul Sharma"]')
    await page.waitForSelector('.crm-page[data-page="Rahul Sharma"]', { timeout: 3000 })
    ai.log.length = 0
    await page.click('.crm-ask .chip.idea:has-text("Summarize Rahul")')
    await waitDone()
    const sent = ai.log.find((l) => l.path === '/chat/completions')?.body.messages.at(-1).content ?? ''
    check('asking from a contact’s page says who it’s about', /\(CRM contact: Rahul Sharma, id c1\)$/.test(sent), sent.slice(-60))
    await page.click('.crm-subhead .back')

    // ---- A follow-up that's due shows a card on the island ----
    await togglePanel()
    await page.waitForSelector('.hub', { state: 'detached', timeout: 5000 })
    const due = await page.evaluate(() => {
      const d = new Date(Date.now() - 60_000)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    })
    const meera = crmFile().contacts.find((c) => c.name === 'Meera Iyer')?.id
    await page.evaluate(([due, meera]) => window.island.crm.saveTask(null, { title: 'Call Meera back', due, contactId: meera }), [due, meera])
    check('a due follow-up pops up as a card', await seen(page, '.card.notification:has-text("Call Meera back")', 5000))
    check('saying who it’s with', (await text('.card.notification')).includes('Meera Iyer') && (await text('.card.notification')).includes('CRM · Follow-up'))
    await shot('07-reminder')
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
