import { ImapFlow, type FetchMessageObject } from 'imapflow'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import { simpleParser } from 'mailparser'

import type { MailServer, MailStatus, MailSummary, MailMessageView } from '@shared/types'

export type ServerConfig = MailServer

export type MailAccount = {
  id: string
  label: string
  /** Login and From address. */
  user: string
  name?: string
  imap: ServerConfig
  smtp: ServerConfig
}

export type MailPreset = { imap: ServerConfig; smtp: ServerConfig; note?: string }

/** Known providers (all need an app password when 2-step verification is on). */
export const MAIL_PRESETS: Record<string, MailPreset> = {
  gmail: {
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    note: 'Use an app password: myaccount.google.com/apppasswords',
  },
  yahoo: {
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    note: 'Use an app password from Yahoo account security settings',
  },
  icloud: {
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    note: 'Use an app-specific password from appleid.apple.com',
  },
  fastmail: {
    imap: { host: 'imap.fastmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.fastmail.com', port: 465, secure: true },
    note: 'Use an app password from Fastmail settings',
  },
}

/** Guess a preset from an email address. Pure. */
export function presetFor(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'gmail'
  if (/^yahoo\./.test(domain) || domain === 'ymail.com') return 'yahoo'
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) return 'icloud'
  if (/^fastmail\./.test(domain)) return 'fastmail'
  return null
}

/** "Re: " once, never "Re: Re:". Pure. */
export function replySubject(subject: string | undefined): string {
  const s = (subject ?? '').trim()
  return /^re:/i.test(s) ? s : `Re: ${s}`.trim()
}

/** In-Reply-To / References for a reply (RFC 5322 §3.6.4). Pure. */
export function replyThreading(
  messageId: string | undefined,
  references: string | string[] | undefined,
): { inReplyTo?: string; references?: string[] } {
  if (!messageId) return {}
  const refs = Array.isArray(references)
    ? references
    : (references ?? '').split(/\s+/).filter(Boolean)
  return { inReplyTo: messageId, references: [...refs.filter((r) => r !== messageId), messageId] }
}

/** Short preview: drops quoted replies and signatures, collapses whitespace. Pure. */
export function snippet(text: string | undefined, max = 180): string {
  if (!text) return ''
  const lines: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (/^-- ?$/.test(line)) break // signature
    if (/^On .+wrote:\s*$/.test(line.trim())) break // start of quoted reply
    if (line.trimStart().startsWith('>')) continue
    lines.push(line)
  }
  const s = lines.join(' ').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

/** Gmail's SMTP server files sent mail itself; others need an IMAP APPEND. Pure. */
export function smtpSavesSent(smtpHost: string): boolean {
  return /(^|\.)gmail\.com$|(^|\.)googlemail\.com$/i.test(smtpHost)
}

export type IncomingMail = {
  accountId: string
  uid: number
  from: { name: string; address: string }
  replyTo?: string
  subject: string
  snippet: string
  date: number
  messageId?: string
  references?: string[]
}

export type AccountStatus = MailStatus

/** Arrival time of a fetched message: INTERNALDATE, else its Date header, else now. */
function arrival(msg: FetchMessageObject): number {
  const d = msg.internalDate ?? msg.envelope?.date
  const t = d ? new Date(d).getTime() : NaN
  return Number.isFinite(t) ? t : Date.now()
}

/** Plain text from an HTML-only mail body (good enough for reading). Pure. */
export function htmlToText(html: string | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const MAX_SOURCE = 256 * 1024
const PREVIEW_SOURCE = 16 * 1024
const FULL_SOURCE = 2 * 1024 * 1024

/**
 * Watches one account's INBOX over IMAP IDLE and replies over SMTP. New,
 * unread messages that arrive while running are reported; nothing already in
 * the mailbox at startup is.
 */
export class MailAccountWatcher {
  private client: ImapFlow | null = null
  private lastUid = 0
  private stopped = false
  private retryMs = 2000
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private known = new Map<number, IncomingMail>()
  private fetching: Promise<unknown> = Promise.resolve()
  /** INBOX is open on the current connection. */
  private ready = false

  constructor(
    private account: MailAccount,
    private password: string,
    private onMail: (m: IncomingMail) => void,
    private onStatus: (s: AccountStatus) => void = () => {},
  ) {}

  start(): void {
    this.stopped = false
    void this.connect()
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    this.onStatus({ state: 'connecting' })
    const { imap, user } = this.account
    const client = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      auth: { user, pass: this.password },
      logger: false,
    })
    this.client = client
    client.on('error', () => {}) // 'close' follows and handles reconnection
    client.on('close', () => {
      this.ready = false
      this.scheduleReconnect()
    })
    client.on('exists', () => void this.queue(() => this.fetchNew()).catch(() => {}))
    try {
      await client.connect()
      const box = await client.mailboxOpen('INBOX')
      this.ready = true
      if (!this.lastUid) this.lastUid = Number(box.uidNext) - 1
      else void this.queue(() => this.fetchNew()).catch(() => {})
      this.retryMs = 2000
      this.onStatus({ state: 'connected' })
    } catch (e: any) {
      this.onStatus({ state: 'error', error: e?.responseText || e?.message || String(e) })
      client.close()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, 5 * 60 * 1000)
  }

  /** Run IMAP work one operation at a time on this connection. */
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.fetching.then(fn, fn)
    this.fetching = p.catch(() => {})
    return p
  }

  private usable(): ImapFlow {
    if (!this.ready || !this.client?.usable) throw new Error('Not connected to the mail server yet')
    return this.client
  }

  private remember(mail: IncomingMail): void {
    this.known.set(mail.uid, mail)
    if (this.known.size > 300) this.known.delete(this.known.keys().next().value!)
  }

  /** Parse a fetched message into what the island needs. */
  private async toMail(msg: FetchMessageObject): Promise<{ mail: IncomingMail; text: string; to?: string }> {
    let text = ''
    let references: string[] | undefined
    let to: string | undefined
    try {
      const parsed = await simpleParser(msg.source ?? Buffer.alloc(0))
      text = parsed.text?.trim() || htmlToText(typeof parsed.html === 'string' ? parsed.html : '')
      const r = parsed.references
      references = Array.isArray(r) ? r : r ? [r] : undefined
      const t = parsed.to
      to = Array.isArray(t) ? t.map((x) => x.text).join(', ') : t?.text
    } catch {
      // headers-only
    }
    const from = msg.envelope?.from?.[0]
    const mail: IncomingMail = {
      accountId: this.account.id,
      uid: msg.uid,
      from: { name: from?.name || from?.address || 'Unknown', address: from?.address || '' },
      replyTo: msg.envelope?.replyTo?.[0]?.address,
      subject: msg.envelope?.subject || '(no subject)',
      snippet: snippet(text),
      // When it arrived (server time) beats the sender's Date header, which can be missing or wrong.
      date: arrival(msg),
      messageId: msg.envelope?.messageId,
      references,
    }
    return { mail, text, to }
  }

  /** How many messages in INBOX are unread. */
  unreadCount(): Promise<number> {
    return this.queue(async () => {
      const found = await this.usable().search({ seen: false }, { uid: true })
      return Array.isArray(found) ? found.length : 0
    })
  }

  /** The newest messages in INBOX, newest first. */
  listRecent(limit = 30): Promise<MailSummary[]> {
    return this.queue(async () => {
      const client = this.usable()
      const box = client.mailbox
      const exists = box && typeof box === 'object' ? box.exists : 0
      if (!exists) return []
      const out: MailSummary[] = []
      const from = Math.max(1, exists - limit + 1)
      const found: FetchMessageObject[] = []
      for await (const msg of client.fetch(`${from}:*`, {
        uid: true,
        flags: true,
        envelope: true,
        internalDate: true,
        source: { maxLength: PREVIEW_SOURCE },
      })) {
        found.push(msg)
      }
      // A server that mishandles partial fetches returns an empty body; fetch those whole.
      const empty = found.filter((m) => !m.source?.length).map((m) => m.uid)
      if (empty.length) {
        const full = new Map<number, FetchMessageObject>()
        for await (const m of client.fetch(empty.join(','), { uid: true, source: true }, { uid: true })) {
          full.set(m.uid, m)
        }
        for (const m of found) if (full.has(m.uid)) m.source = full.get(m.uid)!.source
      }
      for (const msg of found) {
        const { mail } = await this.toMail(msg)
        this.remember(mail)
        out.push({
          accountId: mail.accountId,
          uid: mail.uid,
          from: mail.from,
          subject: mail.subject,
          snippet: mail.snippet,
          date: mail.date,
          unread: !msg.flags?.has('\\Seen'),
        })
      }
      // Newest first; UIDs grow with arrival, so they break ties reliably.
      return out.sort((a, b) => b.date - a.date || b.uid - a.uid)
    })
  }

  /** One full message for reading; opening it marks it as read, like Mail does. */
  getMessage(uid: number): Promise<MailMessageView> {
    return this.queue(async () => {
      const client = this.usable()
      const msg = await client.fetchOne(
        String(uid),
        { uid: true, flags: true, envelope: true, internalDate: true, source: { maxLength: FULL_SOURCE } },
        { uid: true },
      )
      if (!msg) throw new Error('That message is no longer in the inbox')
      const { mail, text, to } = await this.toMail(msg)
      this.remember(mail)
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {})
      return {
        accountId: mail.accountId,
        uid,
        from: mail.from,
        subject: mail.subject,
        snippet: mail.snippet,
        date: mail.date,
        unread: false,
        to,
        text,
      }
    })
  }

  private async fetchNew(): Promise<void> {
    const client = this.client
    if (!client?.usable) return
    const found: FetchMessageObject[] = []
    for await (const msg of client.fetch(
      `${this.lastUid + 1}:*`,
      { uid: true, flags: true, envelope: true, internalDate: true, source: { maxLength: MAX_SOURCE } },
      { uid: true },
    )) {
      found.push(msg)
    }
    for (const msg of found) {
      if (msg.uid <= this.lastUid) continue // `n:*` always returns the last message
      this.lastUid = msg.uid
      if (msg.flags?.has('\\Seen')) continue
      const from = msg.envelope?.from?.[0]
      if (!from?.address || from.address.toLowerCase() === this.account.user.toLowerCase()) continue
      const { mail } = await this.toMail(msg)
      this.remember(mail)
      this.onMail(mail)
    }
  }

  async markRead(uid: number): Promise<void> {
    await this.queue(() => this.usable().messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }))
  }

  /** Reply to a message in the inbox. */
  async reply(uid: number, text: string): Promise<void> {
    if (!this.known.has(uid)) await this.getMessage(uid)
    const orig = this.known.get(uid)
    if (!orig) throw new Error('That message is no longer available')
    const { smtp, user, name } = this.account
    const mail = {
      from: name ? { name, address: user } : user,
      to: orig.replyTo || orig.from.address,
      subject: replySubject(orig.subject),
      text,
      ...replyThreading(orig.messageId, orig.references),
    }
    const raw = await new MailComposer(mail).compile().build()
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user, pass: this.password },
    })
    try {
      await transport.sendMail({
        envelope: { from: user, to: [mail.to] },
        raw,
      })
    } finally {
      transport.close()
    }
    if (!smtpSavesSent(smtp.host)) await this.appendToSent(raw).catch(() => {})
    await this.client
      ?.messageFlagsAdd(String(uid), ['\\Seen', '\\Answered'], { uid: true })
      .catch(() => {})
  }

  private async appendToSent(raw: Buffer): Promise<void> {
    const client = this.client
    if (!client?.usable) return
    const boxes = await client.list()
    const sent = boxes.find((b) => b.specialUse === '\\Sent')
    if (sent) await client.append(sent.path, raw, ['\\Seen'])
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    await this.client?.logout().catch(() => this.client?.close())
    this.client = null
  }
}

/** Try logging in to IMAP and SMTP with these settings; throws a readable error. */
export async function testMailAccount(account: MailAccount, password: string): Promise<void> {
  const { imap, smtp, user } = account
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user, pass: password },
    logger: false,
  })
  client.on('error', () => {})
  try {
    await client.connect()
  } catch (e: any) {
    throw new Error(`IMAP: ${e?.responseText || e?.message || e}`)
  } finally {
    await client.logout().catch(() => client.close())
  }
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user, pass: password },
  })
  try {
    await transport.verify()
  } catch (e: any) {
    throw new Error(`SMTP: ${e?.response || e?.message || e}`)
  } finally {
    transport.close()
  }
}
