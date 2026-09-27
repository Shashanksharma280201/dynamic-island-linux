import { MailAccountWatcher, type IncomingMail, type MailAccount } from './providers/mail'
import type { MailStatus } from '@shared/types'
import type { MessageBackend } from './messages'

type Entry = { account: MailAccount; watcher: MailAccountWatcher; status: MailStatus }

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
    ) => new MailAccountWatcher(a, password, onMail, onStatus),
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

  status(id: string): MailStatus | undefined {
    return this.entries.get(id)?.status
  }

  get size(): number {
    return this.entries.size
  }

  private watcherFor(threadId: string): { w: MailAccountWatcher; uid: number } {
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
