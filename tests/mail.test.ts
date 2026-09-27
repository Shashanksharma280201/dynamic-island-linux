import { createRequire } from 'node:module'
import { SMTPServer } from 'smtp-server'
import { simpleParser } from 'mailparser'
import {
  MailAccountWatcher,
  presetFor,
  replySubject,
  replyThreading,
  snippet,
  smtpSavesSent,
  testMailAccount,
  type IncomingMail,
  type MailAccount,
} from '../electron/providers/mail'

const require = createRequire(import.meta.url)
const hoodiecrow = require('hoodiecrow-imap')

test('presetFor', () => {
  expect(presetFor('a@gmail.com')).toBe('gmail')
  expect(presetFor('a@yahoo.co.in')).toBe('yahoo')
  expect(presetFor('a@me.com')).toBe('icloud')
  expect(presetFor('a@example.org')).toBeNull()
})

test('replySubject never stacks Re:', () => {
  expect(replySubject('Lunch')).toBe('Re: Lunch')
  expect(replySubject('RE: Lunch')).toBe('RE: Lunch')
  expect(replySubject(undefined)).toBe('Re:')
})

test('replyThreading appends the parent id once', () => {
  expect(replyThreading('<b@x>', '<a@x>')).toEqual({ inReplyTo: '<b@x>', references: ['<a@x>', '<b@x>'] })
  expect(replyThreading('<b@x>', ['<a@x>', '<b@x>'])).toEqual({
    inReplyTo: '<b@x>',
    references: ['<a@x>', '<b@x>'],
  })
  expect(replyThreading(undefined, undefined)).toEqual({})
})

test('snippet drops quotes and signatures', () => {
  const text = 'Hi Sam,\n\nSee you at  1pm.\n\nOn Mon, Bob wrote:\n> earlier\n-- \nsig'
  expect(snippet(text)).toBe('Hi Sam, See you at 1pm.')
  expect(snippet('a'.repeat(300), 10)).toBe('aaaaaaaaa…')
  expect(snippet('> only quote')).toBe('')
})

test('smtpSavesSent only for Gmail', () => {
  expect(smtpSavesSent('smtp.gmail.com')).toBe(true)
  expect(smtpSavesSent('smtp.fastmail.com')).toBe(false)
})

// ---- integration: real IMAP (hoodiecrow) + SMTP (smtp-server) on localhost ----

function startImap(port: number) {
  const server = hoodiecrow({
    plugins: ['IDLE', 'UIDPLUS', 'SPECIAL-USE', 'ENABLE'],
    users: { 'me@x.test': { password: 'pw' } },
    storage: {
      INBOX: { messages: [{ raw: 'From: old@x.test\r\nSubject: old\r\n\r\nalready here', flags: [] }] },
      '': { separator: '/', folders: { Sent: { 'special-use': '\\Sent' } } },
    },
  })
  return new Promise<any>((r) => server.listen(port, () => r(server)))
}

function startSmtp(port: number, got: (raw: string) => void) {
  const server = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    onAuth: (auth, _s, cb) =>
      auth.username === 'me@x.test' && auth.password === 'pw' ? cb(null, { user: 'me' }) : cb(new Error('bad')),
    onData: (stream, _s, cb) => {
      let raw = ''
      stream.on('data', (d) => (raw += d))
      stream.on('end', () => {
        got(raw)
        cb()
      })
    },
  })
  return new Promise<SMTPServer>((r) => server.listen(port, '127.0.0.1', () => r(server)))
}

const ACCOUNT: MailAccount = {
  id: 'acc1',
  label: 'Test',
  user: 'me@x.test',
  name: 'Me Tester',
  imap: { host: '127.0.0.1', port: 11143, secure: false },
  smtp: { host: '127.0.0.1', port: 11025, secure: false },
}

test(
  'new mail is pushed over IDLE, reply is sent threaded, flagged and filed in Sent',
  async () => {
    const imap = await startImap(11143)
    const sent: string[] = []
    const smtp = await startSmtp(11025, (r) => sent.push(r))
    const mails: IncomingMail[] = []
    const w = new MailAccountWatcher(ACCOUNT, 'pw', (m) => mails.push(m))
    try {
      await testMailAccount(ACCOUNT, 'pw')
      await expect(testMailAccount(ACCOUNT, 'wrong')).rejects.toThrow(/IMAP/)

      w.start()
      await new Promise((r) => setTimeout(r, 1500))
      expect(mails).toHaveLength(0) // existing mail isn't announced
      imap.appendMessage(
        'INBOX',
        [],
        false,
        'From: Alice <alice@x.test>\r\nSubject: Lunch?\r\nMessage-ID: <m1@x.test>\r\n\r\nFree at 1?\r\n> quoted',
      )
      const deadline = Date.now() + 20000
      while (mails.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200))
      expect(mails).toHaveLength(1)
      expect(mails[0]).toMatchObject({
        from: { name: 'Alice', address: 'alice@x.test' },
        subject: 'Lunch?',
        snippet: 'Free at 1?',
        messageId: '<m1@x.test>',
      })

      await w.reply(mails[0].uid, 'Yes, see you then')
      expect(sent).toHaveLength(1)
      const out = await simpleParser(sent[0])
      expect(out.subject).toBe('Re: Lunch?')
      expect(out.inReplyTo).toBe('<m1@x.test>')
      expect(out.to && 'text' in out.to ? out.to.text : '').toContain('alice@x.test')
      expect(out.text?.trim()).toBe('Yes, see you then')

      const inbox = imap.getMailbox('INBOX')
      const msg = inbox.messages.find((m: any) => m.uid === mails[0].uid)
      expect(msg.flags).toEqual(expect.arrayContaining(['\\Seen', '\\Answered']))
      expect(imap.getMailbox('Sent').messages).toHaveLength(1)
    } finally {
      await w.stop()
      await new Promise<void>((r) => smtp.close(() => r()))
      await new Promise<void>((r) => imap.close(() => r()))
    }
  },
  40000,
)

import { htmlToText } from '../electron/providers/mail'

test('htmlToText keeps paragraphs and drops markup', () => {
  expect(htmlToText('<style>p{}</style><p>Hi&nbsp;Sam</p><p>See <b>you</b> &amp; bye<br>x</p>')).toBe(
    'Hi Sam\nSee you & bye\nx',
  )
  expect(htmlToText(undefined)).toBe('')
})

test(
  'inbox: lists newest first, opening marks read, can reply to an older message',
  async () => {
    const imap = await startImap(12143)
    imap.appendMessage(
      'INBOX',
      [],
      false,
      'From: Zoe <zoe@x.test>\r\nSubject: Newer\r\nDate: Tue, 2 Jan 2024 10:00:00 +0000\r\nMessage-ID: <z@x.test>\r\nContent-Type: text/html\r\n\r\n<p>Hello <b>there</b></p>',
    )
    const sent: string[] = []
    const smtp = await startSmtp(12025, (r) => sent.push(r))
    const acc = { ...ACCOUNT, imap: { ...ACCOUNT.imap, port: 12143 }, smtp: { ...ACCOUNT.smtp, port: 12025 } }
    const w = new MailAccountWatcher(acc, 'pw', () => {})
    try {
      w.start()
      let list: Awaited<ReturnType<typeof w.listRecent>> = []
      const deadline = Date.now() + 10000
      while (Date.now() < deadline) {
        try {
          list = await w.listRecent(10)
          break
        } catch {
          await new Promise((r) => setTimeout(r, 200))
        }
      }
      expect(list.map((m) => m.subject)).toEqual(['Newer', 'old'])
      expect(list[0]).toMatchObject({ unread: true, snippet: 'Hello there', from: { name: 'Zoe' } })

      const full = await w.getMessage(list[1].uid)
      expect(full.text).toBe('already here')
      expect(imap.getMailbox('INBOX').messages[0].flags).toContain('\\Seen')

      await w.reply(list[0].uid, 'Hi Zoe')
      const out = await simpleParser(sent[0])
      expect(out.subject).toBe('Re: Newer')
      expect(out.inReplyTo).toBe('<z@x.test>')
    } finally {
      await w.stop()
      await new Promise<void>((r) => smtp.close(() => r()))
      await new Promise<void>((r) => imap.close(() => r()))
    }
  },
  30000,
)
