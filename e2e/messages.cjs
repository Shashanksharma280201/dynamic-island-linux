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
      DI_FAKE_WA_LIST_MS: '400', // listing chats takes a moment, like the real thing
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

    check(
      'the section icons sit in a rail beside the panel',
      (await page.$$('.rail-btn[aria-label]')).length === 7 && !(await page.$('.tabs')),
    )
    // Record the Chats panel's height every frame while it opens and loads.
    await page.evaluate(() => {
      const hs = (window.__chatHeights = [])
      const end = performance.now() + 1500
      const tick = () => {
        const hub = document.querySelector('.card.panel.hub.chats')
        if (hub) hs.push(hub.offsetHeight)
        if (performance.now() < end) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.click('.rail-btn[aria-label="Chats"]')
    await page.waitForSelector('.chat-row', { timeout: 5000 })
    await sleep(1600)
    const chatHeights = [...new Set(await page.evaluate(() => window.__chatHeights))]
    check('Chats opens at its full size instead of growing as it loads', chatHeights.length === 1, chatHeights.join(', '))
    const searchH = await page.$eval('.hub .search', (e) => e.getBoundingClientRect().height)
    check('the chat search box is one line tall', searchH <= 40, `${searchH}px`)
    await page.click('.hub .search', { position: { x: 6, y: 6 } })
    check(
      'clicking anywhere in the search box starts typing',
      await until(() => page.evaluate(() => document.activeElement?.matches('.hub .search input')), 2000),
    )
    await page.keyboard.press('Escape')
    const room = await page.evaluate(() => window.innerWidth - document.querySelector('.island-outer').offsetWidth - 10)
    check('the window leaves room for the panel’s shadow (no hard edge)', room >= 100, `${room}px`)
    const chatNames = await page.$$eval('.chat-row .title', (e) => e.map((x) => x.textContent))
    check('Chats tab lists WhatsApp chats', chatNames.includes('Alice') && chatNames.includes('Weekend Trip'), chatNames.join(', '))
    const badgeOf = (label) => page.$eval(`.rail-btn[aria-label="${label}"]`, (b) => Number(b.querySelector('.rail-badge')?.textContent || 0))
    const unreadTotal = await page.$$eval('.chat-row .count', (cs) => cs.reduce((n, c) => n + Number(c.textContent), 0))
    check('the Chats icon shows the unread message count', (await until(async () => (await badgeOf('Chats')) === unreadTotal, 5000)) && unreadTotal > 0, `${await badgeOf('Chats')} vs ${unreadTotal}`)
    const tripUnread = Number(await page.textContent('.chat-row:has-text("Weekend Trip") .count'))
    await page.click('.chat-row:has-text("Weekend Trip")')
    await page.waitForSelector('.thread .bubble', { timeout: 5000 })
    check('opening a chat shows its history', (await page.$$('.thread .bubble')).length >= 3)
    check('reading a chat lowers the badge', await until(async () => (await badgeOf('Chats')) === unreadTotal - tripUnread, 5000), `${await badgeOf('Chats')}`)
    check('the conversation is split by day', (await page.$$eval('.day-sep', (e) => e.map((x) => x.textContent))).join() === 'Yesterday,Today')
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
    await page.waitForSelector('.chat-row')
    await page.click('.chat-row:has-text("Gym Buddies")')
    await page.waitForSelector('.thread .bubble', { timeout: 5000 })
    await sleep(500)
    const heights = await page.$$eval('.thread .bubble', (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)))
    check('a long conversation scrolls instead of squashing the bubbles', heights.length >= 30 && Math.min(...heights) >= 26, `${heights.length} bubbles, smallest ${Math.min(...heights)}px`)
    const lastVisible = await page.evaluate(() => {
      const t = document.querySelector('.thread')
      const last = [...t.querySelectorAll('.bubble')].pop()
      return last.getBoundingClientRect().bottom <= t.getBoundingClientRect().bottom + 1
    })
    check('it opens at the newest message', lastVisible)
    await page.click('.back')
    await page.waitForSelector('.chat-row')
    await page.click('.search input')
    await until(() => page.evaluate(() => document.activeElement?.matches('.search input')))
    await page.keyboard.type('trip')
    const filtered = async () => (await page.$$eval('.chat-row .title', (e) => e.map((x) => x.textContent))).join()
    check(
      'searching chats filters the list',
      await until(async () => (await filtered()) === 'Weekend Trip'),
      await filtered(),
    )
    await page.keyboard.press('Escape')

    await page.click('.rail-btn[aria-label="Mail"]')
    await page.waitForSelector('.mail-row', { timeout: 10000 })
    const subjects = await page.$$eval('.mail-row .subject', (e) => e.map((x) => x.textContent))
    check('Mail tab lists the inbox, newest first', subjects[0] === 'FYI' && subjects.includes('Quarterly report'), subjects.join(', '))
    const mailUnread = (await page.$$('.mail-row.unread')).length
    check('the Mail icon shows the unread count', await until(async () => (await badgeOf('Mail')) === mailUnread, 5000), `${await badgeOf('Mail')} vs ${mailUnread}`)
    imap.appendMessage('INBOX', [], false, 'From: Dana <dana@x.test>\r\nSubject: Lunch?\r\n\r\nNoon at the usual place?\r\n')
    check('new mail raises the Mail badge', await until(async () => (await badgeOf('Mail')) === mailUnread + 1, 30000), `${await badgeOf('Mail')}`)
    await page.waitForSelector('.mail-row:has-text("Lunch?")', { timeout: 10000 })
    await page.click('.mail-row:has-text("Lunch?")')
    await page.waitForSelector('.mail-body', { timeout: 5000 })
    check('reading it lowers the badge again', await until(async () => (await badgeOf('Mail')) === mailUnread, 5000), `${await badgeOf('Mail')}`)
    await page.click('.back')
    await page.waitForSelector('.mail-row:has-text("Quarterly report")', { timeout: 5000 })
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

    // ---- Notes: new, list, reopen, edit, delete; plain files on disk ----
    const notesDir = path.join(USER_DATA, 'notes')
    const noteFiles = () => (fs.existsSync(notesDir) ? fs.readdirSync(notesDir).filter((f) => f.endsWith('.md')) : [])
    await page.click('.rail-btn[aria-label="Notes"]')
    await page.waitForSelector('text=No notes yet', { timeout: 5000 })
    check('Notes starts empty', noteFiles().length === 0)
    await page.click('.new-note')
    await page.waitForSelector('.note-editor')
    check('a new note is focused and ready to type', await until(() => page.evaluate(() => document.activeElement?.classList.contains('note-editor'))))
    await page.keyboard.type('Groceries\nMilk, eggs')
    check(
      'a note is saved as a Markdown file as you type',
      await until(() => noteFiles().length === 1 && fs.readFileSync(path.join(notesDir, noteFiles()[0]), 'utf8') === 'Groceries\nMilk, eggs'),
    )
    await page.click('.back')
    await page.waitForSelector('.note-row')
    check('the note is listed by its first line', (await page.textContent('.note-row .title')) === 'Groceries')
    await page.click('.note-row')
    await page.waitForSelector('.note-editor')
    check('reopening a note shows what was written', (await page.inputValue('.note-editor')) === 'Groceries\nMilk, eggs')
    await page.click('.note-editor')
    await page.keyboard.press('End')
    await page.keyboard.type(', bread')
    check(
      'edits to an old note are saved',
      await until(() => fs.readFileSync(path.join(notesDir, noteFiles()[0]), 'utf8').endsWith('eggs, bread')),
    )
    await page.click('[aria-label="Delete note"]')
    await page.click('.pill.danger')
    await page.waitForSelector('text=No notes yet', { timeout: 5000 })
    check('deleting a note removes its file', noteFiles().length === 0)

    // ---- Typing with the real keyboard (X key events, not injected into the page) ----
    // Injected keys skip X keyboard focus; on a real desktop the island must
    // actually take focus, which dock windows don't get by default.
    const xt = (...a) => execFileSync('node', [path.join(__dirname, 'xtest.cjs'), ...a.map(String)])
    const realClick = async (sel) => {
      const b = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')).getBounds(),
      )
      // Wait for the island to stop moving (it re-centres when the panel resizes).
      const centre = () => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] })
      let r = await centre()
      for (let i = 0; i < 20; i++) {
        await sleep(150)
        const n = await centre()
        if (n[0] === r[0] && n[1] === r[1]) break
        r = n
      }
      xt('click', b.x + r[0], b.y + r[1])
    }
    const realType = async (sel, text) => {
      await realClick(sel)
      await sleep(600)
      xt('type', text)
      return until(async () => ((await page.inputValue(sel)) ?? '').includes(text), 3000)
    }
    await realClick('.rail-btn[aria-label="Chats"]')
    await page.waitForSelector('.chat-row', { timeout: 5000 })
    await realClick('.chat-row:has-text("Alice")')
    await page.waitForSelector('.composer textarea', { timeout: 5000 })
    check('real keyboard: typing in a chat', await realType('.composer textarea', 'typed for real'))
    await page.fill('.composer textarea', '')
    await page.click('.back')
    await realClick('.rail-btn[aria-label="Mail"]')
    await page.waitForSelector('.mail-row', { timeout: 10000 })
    await realClick('.mail-row:has-text("FYI")')
    await page.waitForSelector('.view-head .pill:has-text("Reply")', { timeout: 5000 })
    await realClick('.view-head .pill:has-text("Reply")')
    await page.waitForSelector('.composer textarea')
    check('real keyboard: typing a mail reply', await realType('.composer textarea', 'mail typed for real'))
    await page.fill('.composer textarea', '')
    await page.click('.back')
    await realClick('.rail-btn[aria-label="Notes"]')
    await page.waitForSelector('.new-note')
    await realClick('.new-note')
    await page.waitForSelector('.note-editor')
    check('real keyboard: typing a note', await realType('.note-editor', 'note typed for real'))
    await realClick('.rail-btn[aria-label="Chats"]')
    await page.waitForSelector('.search input', { timeout: 5000 })
    check('real keyboard: searching chats', await realType('.search input', 'alice'))

    // Typing, then going back to another app: the island lets go and closes.
    await page.fill('.search input', '')
    await realClick('.chat-row:has-text("Alice")')
    await page.waitForSelector('.composer textarea', { timeout: 5000 })
    check('real keyboard: typing again', await realType('.composer textarea', 'half a thought'))
    await page.fill('.composer textarea', '')
    xt('steal')
    xt(20, 20) // pointer away from the island
    check(
      'clicking into another app while typing lets the island close',
      await page.waitForSelector('.hub', { state: 'detached', timeout: 6000 }).then(() => true, () => false),
    )
    key('ctrl+i')
    await page.waitForSelector('.hub', { timeout: 3000 })

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
