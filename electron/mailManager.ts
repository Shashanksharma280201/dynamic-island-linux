import { MailAccountWatcher, type IncomingMail, type MailAccount } from './providers/mail'
import type { MailStatus, MailSummary, MailMessageView } from '@shared/types'
import type { MessageBackend } from './messages'

/** What the manager needs from an account watcher (a fake one backs demo mode). */
export type MailWatcher = Pick<
  MailAccountWatcher,
  'start' | 'stop' | 'listRecent' | 'getMessage' | 'reply' | 'markRead'
>

type Entry = { account: MailAccount; watcher: MailWatcher; status: MailStatus }

/** Split a mail thread id `<accountId>:<uid>`. Pure. */
export function parseMailThread(threadId: string): { accountId: string; uid: number } | null {
  const i = threadId.lastIndexOf(':')
  const uid = Number(threadId.slice(i + 1))
  if (i <= 0 || !Number.isInteger(uid) || uid <= 0) return null
  return { accountId: threadId.slice(0, i), uid }
}

/** Runs one IMAP watcher per account and routes replies to the right one. */
export class MailManager implements MessageBackend {
  private entries = new Map<string, Entry>()

  constructor(
    private onMail: (m: IncomingMail, account: MailAccount) => void,
    private onStatus: () => void,
    private makeWatcher = (
      a: MailAccount,
      password: string,
      onMail: (m: IncomingMail) => void,
      onStatus: (s: MailStatus) => void,
    ): MailWatcher => new MailAccountWatcher(a, password, onMail, onStatus),
  ) {}

  /** Start or restart an account's watcher. */
  async set(account: MailAccount, password: string): Promise<void> {
    await this.remove(account.id)
    const entry: Entry = {
      account,
      status: { state: 'connecting' },
      watcher: this.makeWatcher(
        account,
        password,
        (m) => this.onMail(m, account),
        (s) => {
          entry.status = s
          this.onStatus()
        },
      ),
    }
    this.entries.set(account.id, entry)
    entry.watcher.start()
    this.onStatus()
  }

  async remove(id: string): Promise<void> {
    const e = this.entries.get(id)
    if (!e) return
    this.entries.delete(id)
    await e.watcher.stop()
    this.onStatus()
  }

  /** Configured accounts, for the inbox picker. */
  accounts(): { id: string; label: string }[] {
    return [...this.entries.values()].map((e) => ({ id: e.account.id, label: e.account.label }))
  }

  /** Newest inbox messages of one account, or of all accounts merged. */
  async listRecent(accountId?: string, limit = 30): Promise<MailSummary[]> {
    const entries = [...this.entries.values()].filter((e) => !accountId || e.account.id === accountId)
    if (!entries.length) throw new Error('No mail account is set up')
    const lists = await Promise.allSettled(entries.map((e) => e.watcher.listRecent(limit)))
    const ok = lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (!ok.length) {
      const failed = lists.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed) throw failed.reason
    }
    return ok.sort((a, b) => b.date - a.date).slice(0, limit)
  }

  async getMessage(accountId: string, uid: number): Promise<MailMessageView> {
    const e = this.entries.get(accountId)
    if (!e) throw new Error('That mail account is no longer set up')
    return e.watcher.getMessage(uid)
  }

  status(id: string): MailStatus | undefined {
    return this.entries.get(id)?.status
  }

  get size(): number {
    return this.entries.size
  }

  private watcherFor(threadId: string): { w: MailWatcher; uid: number } {
    const t = parseMailThread(threadId)
    const e = t && this.entries.get(t.accountId)
    if (!t || !e) throw new Error('That mail account is no longer set up')
    return { w: e.watcher, uid: t.uid }
  }

  async reply(threadId: string, text: string): Promise<void> {
    const { w, uid } = this.watcherFor(threadId)
    await w.reply(uid, text)
  }

  async markRead(threadId: string): Promise<void> {
    const { w, uid } = this.watcherFor(threadId)
    await w.markRead(uid)
  }

  async stop(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.remove(id)))
  }
}
