import type { MailSummary, MailMessageView, MailStatus } from '@shared/types'
import type { MailWatcher } from '../mailManager'
import type { IncomingMail } from './mail'

const h = 3600_000

type Stored = MailMessageView

/** Demo-mode inbox: a handful of believable messages, replies are no-ops. */
export class FakeMailWatcher implements MailWatcher {
  private box: Stored[]

  constructor(
    private accountId: string,
    private onStatus: (s: MailStatus) => void = () => {},
    private onMail: (m: IncomingMail) => void = () => {},
  ) {
    const now = Date.now()
    const m = (uid: number, name: string, address: string, subject: string, text: string, ago: number, unread: boolean): Stored => ({
      accountId,
      uid,
      from: { name, address },
      subject,
      snippet: text.replace(/\s+/g, ' ').slice(0, 140),
      text,
      date: now - ago,
      unread,
    })
    this.box = [
      m(5, 'Bob Builder', 'bob@example.com', 'Quarterly report', 'Hi!\n\nAttached is the draft of the quarterly report. Let me know what you think before Friday.\n\nThanks,\nBob', 0.2 * h, true),
      m(4, 'GitHub', 'noreply@github.com', '[dynamic-island-linux] CI passed on main', 'All checks have passed for commit 7797bc5.\n\ncheck: success\ne2e: success', 2 * h, true),
      m(3, 'Priya Shah', 'priya@example.com', 'Weekend plans', 'Are we still on for the trip? I booked the cabin, we just need to sort out the car.', 20 * h, false),
      m(2, 'Calendar', 'calendar@example.com', 'Invitation: Design review', 'You have been invited to Design review on Monday at 11:00.', 30 * h, false),
      m(1, 'Airline', 'no-reply@air.example', 'Your boarding pass', 'Your boarding pass for flight DI 482 is attached. Gate closes 20 minutes before departure.', 50 * h, false),
    ]
  }

  start(): void {
    this.onStatus({ state: 'connected' })
  }

  async stop(): Promise<void> {}

  async listRecent(limit: number): Promise<MailSummary[]> {
    return this.box.slice(0, limit).map(({ text: _t, to: _to, ...s }) => ({ ...s }))
  }

  async getMessage(uid: number): Promise<MailMessageView> {
    const m = this.box.find((x) => x.uid === uid)
    if (!m) throw new Error('That message is no longer in the inbox')
    m.unread = false
    return { ...m, to: 'me@example.com' }
  }

  async reply(): Promise<void> {}

  async markRead(uid: number): Promise<void> {
    const m = this.box.find((x) => x.uid === uid)
    if (m) m.unread = false
  }
}
