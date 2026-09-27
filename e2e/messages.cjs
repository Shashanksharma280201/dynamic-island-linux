// End-to-end test of messaging in the real Electron app: WhatsApp (scripted
// fake engine; the real one needs a phone) and mail against real local IMAP
// (hoodiecrow) + SMTP (smtp-server) servers, including typing replies and the
// settings window. Run through `npm run test:e2e`.
const { _electron } = require('playwright-core')
const { spawn, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const hoodiecrow = require('hoodiecrow-imap')
const { SMTPServer } = require('smtp-server')
const { simpleParser } = require('mailparser')

const ROOT = path.resolve(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'island-msg-'))
const OUT = process.env.SHOTS || path.join(TMP, 'shots')
const USER_DATA = path.join(TMP, 'profile')
const WA_LOG = path.join(TMP, 'whatsapp.log')
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron')
const IMAP_PORT = 21143
const SMTP_PORT = 21025
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(USER_DATA, { recursive: true })

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

const server = (port) => ({ host: '127.0.0.1', port, secure: false })
const b64 = (s) => Buffer.from(s).toString('base64')

;(async () => {
  // ---- local mail servers ----
  const imap = hoodiecrow({
    plugins: ['IDLE', 'UIDPLUS', 'SPECIAL-USE', 'ENABLE'],
    users: { 'me@x.test': { password: 'pw' } },
    storage: {
      INBOX: { messages: [] },
      '': { separator: '/', folders: { Sent: { 'special-use': '\\Sent' } } },
    },
  })
  await new Promise((r) => imap.listen(IMAP_PORT, r))
  const smtpGot = []
  const smtp = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    onAuth: (a, _s, cb) => (a.password === 'pw' ? cb(null, { user: a.username }) : cb(new Error('bad'))),
    onData: (stream, _s, cb) => {
      let raw = ''
      stream.on('data', (d) => (raw += d))
      stream.on('end', () => {
        smtpGot.push(raw)
        cb()
      })
    },
  })
  await new Promise((r) => smtp.listen(SMTP_PORT, '127.0.0.1', r))

  // Profile with one mail account (password obfuscated: no keyring under Xvfb).
  fs.writeFileSync(
    path.join(USER_DATA, 'config.json'),
    JSON.stringify({
      notifications: true,
      whatsapp: true,
      mail: [
        {
          id: 'acc1',
          label: 'Test',
          user: 'me@x.test',
          name: 'Me Tester',
          imap: server(IMAP_PORT),
          smtp: server(SMTP_PORT),
          secret: 'plain:' + b64('pw'),
        },
      ],
    }),
  )

  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: {
      ...process.env,
      DI_USER_DATA: USER_DATA,
      DI_WHATSAPP_ENGINE: 'fake',
      DI_FAKE_WA_READY_MS: '1500',
      DI_DEMO_LOG: WA_LOG,
      DYNAMIC_ISLAND_SOCK: path.join(TMP, 'island.sock'),
    },
  })
  const logs = []
  app.process().stderr.on('data', (d) => logs.push(d.toString()))
  app.process().stdout.on('data', (d) => logs.push(d.toString()))
  const page = await app.firstWindow()
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, omitBackground: true })
  const islandFocusable = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocusable())
  const waLog = () => (fs.existsSync(WA_LOG) ? fs.readFileSync(WA_LOG, 'utf8') : '')

  try {
    // ---- WhatsApp ----
    await page.waitForSelector('.card.message.whatsapp', { timeout: 10000 })
    await until(async () => (await page.$$('.card.message .line')).length >= 2)
    const lines = await page.$$eval('.card.message .line', (e) => e.map((x) => x.textContent))
    check('WhatsApp messages from one chat stack in one card', lines.length === 2, JSON.stringify(lines))
    check('sender shown', (await page.textContent('.card.message .title')) === 'Alice')
    await sleep(400)
    await shot(page, '10-whatsapp')

    check('island is not focusable before replying', (await islandFocusable()) === false)
    await page.click('.card.message .reply-btn')
    await page.waitForSelector('.reply textarea', { timeout: 3000 })
    check('reply box takes keyboard focus', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'))
    check('island window becomes focusable while typing', await until(islandFocusable, 2000))
    // Stays open while the reply is being written, beyond its normal 12s.
    await page.keyboard.type('Yes! See you at 1')
    await sleep(400)
    await shot(page, '11-whatsapp-reply')
    await page.keyboard.press('Enter')
    check(
      'reply is sent to the WhatsApp chat',
      await until(() => waLog().includes('"chatId":"15550001111@c.us","text":"Yes! See you at 1"')),
    )
    await page.waitForSelector('.card.message .status.ok', { timeout: 3000 })
    check('card shows Sent ✓', true)
    await page.waitForSelector('.card.message', { state: 'detached', timeout: 4000 })
    check('card closes after sending', true)
    check('island gives keyboard focus back', await until(async () => (await islandFocusable()) === false, 2000))

    // ---- Mail (real IMAP IDLE + SMTP) ----
    imap.appendMessage(
      'INBOX',
      [],
      false,
      'From: Bob Builder <bob@x.test>\r\nSubject: Quarterly report\r\nMessage-ID: <q1@x.test>\r\n\r\nHi! Draft attached, thoughts?\r\n',
    )
    const gotMail = await page
      .waitForSelector('.card.message.mail', { timeout: 30000 })
      .then(() => true, () => false)
    check('new mail appears via IMAP IDLE', gotMail)
    if (gotMail) {
      check('subject shown', (await page.textContent('.card.message .subject')) === 'Quarterly report')
      await sleep(400)
      await shot(page, '12-mail')
      await page.click('.card.message .reply-btn')
      await page.waitForSelector('.reply textarea', { timeout: 3000 })
      await page.keyboard.type('Looks good, ship it.')
      await page.keyboard.press('Enter')
      check('reply delivered over SMTP', await until(() => smtpGot.length === 1, 8000))
      if (smtpGot.length) {
        const out = await simpleParser(smtpGot[0])
        check(
          'reply is threaded to the original',
          out.subject === 'Re: Quarterly report' && out.inReplyTo === '<q1@x.test>',
          `${out.subject} ${out.inReplyTo}`,
        )
        check('reply comes from the account', out.from?.value?.[0]?.address === 'me@x.test')
      }
      const flags = () => imap.getMailbox('INBOX').messages[0].flags
      check('original flagged answered + read', await until(() => flags().includes('\\Answered') && flags().includes('\\Seen')))
      check('copy filed in Sent', imap.getMailbox('Sent').messages.length === 1)
    }

    // Mark read from the island
    imap.appendMessage('INBOX', [], false, 'From: Carol <carol@x.test>\r\nSubject: FYI\r\n\r\nNo reply needed\r\n')
    if (await page.waitForSelector('.card.message.mail', { timeout: 30000 }).then(() => true, () => false)) {
      await page.click('text=Mark as Read')
      const msg = () => imap.getMailbox('INBOX').messages[1]
      check('mark read sets \\Seen on the server', await until(() => msg()?.flags.includes('\\Seen')))
      await page.waitForSelector('.card.message', { state: 'detached', timeout: 3000 })
    } else check('second mail appears', false)

    // ---- Hub: browse chats and inbox any time; Ctrl+I opens / closes ----
    const key = (combo) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), 'key', combo])
    key('ctrl+i')
    check('Ctrl+I opens the island panel', await page.waitForSelector('.hub', { timeout: 3000 }).then(() => true, () => false))
    await sleep(2500)
    check('a panel opened from the keyboard stays open without hover', !!(await page.$('.hub')))

    await page.click('.tabs button:has-text("Chats")')
    await page.waitForSelector('.chat-row', { timeout: 5000 })
    const chatNames = await page.$$eval('.chat-row .title', (e) => e.map((x) => x.textContent))
    check('Chats tab lists WhatsApp chats', chatNames.includes('Alice') && chatNames.includes('Weekend Trip'), chatNames.join(', '))
    await page.click('.chat-row:has-text("Weekend Trip")')
    await page.waitForSelector('.thread .bubble', { timeout: 5000 })
    check('opening a chat shows its history', (await page.$$('.thread .bubble')).length >= 3)
    await page.click('.composer textarea')
    await page.keyboard.type('Leaving now')
    await page.keyboard.press('Enter')
    check(
      'message sent from the conversation view',
      await until(() => waLog().includes('"chatId":"120363000000000000@g.us","text":"Leaving now"')),
    )
    check(
      'sent message appears in the thread',
      await page.waitForSelector('.thread .bubble.mine:has-text("Leaving now")', { timeout: 3000 }).then(() => true, () => false),
    )
    await page.click('.back')

    await page.click('.tabs button:has-text("Mail")')
    await page.waitForSelector('.mail-row', { timeout: 10000 })
    const subjects = await page.$$eval('.mail-row .subject', (e) => e.map((x) => x.textContent))
    check('Mail tab lists the inbox, newest first', subjects[0] === 'FYI' && subjects.includes('Quarterly report'), subjects.join(', '))
    const sentBefore = smtpGot.length
    await page.click('.mail-row:has-text("Quarterly report")')
    await page.waitForSelector('.mail-body', { timeout: 5000 })
    check(
      'opening a mail shows its body',
      await until(async () => ((await page.textContent('.mail-body')) ?? '').includes('Draft attached')),
    )
    await page.click('.view-head .pill:has-text("Reply")')
    await page.waitForSelector('.composer textarea')
    await page.keyboard.type('Second thoughts: ship Monday.')
    await page.keyboard.press('Enter')
    check('reply from the reader goes out over SMTP', await until(() => smtpGot.length === sentBefore + 1, 8000))
    await shot(page, '14-hub-mail')

    key('ctrl+i')
    check('Ctrl+I closes it again', await page.waitForSelector('.hub', { state: 'detached', timeout: 3000 }).then(() => true, () => false))

    // ---- Settings window ----
    const [settings] = await Promise.all([app.waitForEvent('window'), page.evaluate(() => window.island.openSettings())])
    await settings.waitForSelector('text=Connected as Demo User', { timeout: 5000 })
    check('settings shows WhatsApp linked', true)
    await settings.waitForSelector('.account .dot.ok', { timeout: 5000 })
    check('settings shows the mail account connected', true)

    // Island position from settings
    const bounds = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((b) => b.webContents.getURL().includes('index.html'))
          .getBounds(),
      )
    await settings.click('.segmented button:has-text("Left")')
    check('settings can move the island to the left edge', await until(async () => (await bounds()).x === 0, 3000))
    await settings.click('.segmented button:has-text("Right")')
    check('and back to the right', await until(async () => (await bounds()).x > 0, 3000))

    await settings.click('text=Add Account…')
    await settings.fill('input[placeholder="Email address"]', 'me@x.test')
    await settings.fill('input[placeholder="Label (e.g. Work)"]', 'Second')
    await settings.fill('input[placeholder="App password"]', 'wrong')
    const hosts = await settings.$$('.server input[placeholder="host"]')
    const ports = await settings.$$('.server input.port')
    const tls = await settings.$$('.server input[type="checkbox"]')
    for (const [i, port] of [IMAP_PORT, SMTP_PORT].entries()) {
      await hosts[i].fill('127.0.0.1')
      await ports[i].fill(String(port))
      await tls[i].uncheck()
    }
    await settings.click('button:has-text("Test")')
    check('wrong password is reported', await settings.waitForSelector('.editor .error', { timeout: 8000 }).then(() => true, () => false))
    await settings.fill('input[placeholder="App password"]', 'pw')
    await settings.click('button:has-text("Test")')
    check('connection test passes', await settings.waitForSelector('text=Connection works', { timeout: 8000 }).then(() => true, () => false))
    await settings.click('button:has-text("Save")')
    check('second account saved', await until(async () => (await settings.$$('.account')).length === 2, 5000))
    const saved = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'config.json'), 'utf8'))
    check(
      'password is not stored in plain text',
      !JSON.stringify(saved).includes('"pw"') && saved.mail[1]?.secret?.length > 0,
    )
    await sleep(500)
    await settings.screenshot({ path: `${OUT}/13-settings.png` })
    await settings.close()
  } catch (e) {
    check('unexpected error', false, e.message)
    for (const [i, w] of app.windows().entries()) {
      await w.screenshot({ path: `${OUT}/99-failure-${i}.png` }).catch(() => {})
      if (process.env.E2E_VERBOSE) console.log(`window ${i} text:`, (await w.textContent('body').catch(() => '')).slice(0, 600))
    }
  }

  await app.close().catch(() => {})
  await new Promise((r) => smtp.close(r))
  await new Promise((r) => imap.close(r))
  if (process.env.E2E_VERBOSE) console.log(logs.join(''))
  const errs = logs.join('').split('\n').filter((l) => /error|Uncaught/i.test(l))
  console.log('app log errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none')
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (screenshots: ${OUT})`)
  process.exit(failed ? 1 : 0)
})()
