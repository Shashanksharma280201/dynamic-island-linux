import type { MessageData, ChatLine, MessageSource } from '@shared/types'
import type { TransientCards } from './transient'
import type { WaIncoming } from './providers/whatsapp'
import type { IncomingMail } from './providers/mail'

/** How a message source answers and marks conversations as read. */
export type MessageBackend = {
  reply(threadId: string, text: string): Promise<void>
  markRead(threadId: string): Promise<void>
}

const MAX_LINES = 4
export const MESSAGE_MS = 12000
const SENT_MS = 1500

export function messageId(source: MessageSource, threadId: string): string {
  return `${source}:${threadId}`
}

/** Append a line to a conversation card, keeping the most recent few. Pure. */
export function withLine(lines: ChatLine[], line: ChatLine): ChatLine[] {
  return [...lines, line].slice(-MAX_LINES)
}

/** What the notification center hears about a new message. */
export type MessageArrival = { id: string; source: MessageSource; app: string; icon?: string; title: string; body: string; thread: string; at: number }

/**
 * Turns incoming WhatsApp messages and mail into island cards, and routes
 * replies / mark-as-read back to the right backend. Every arrival is also
 * told to `record` (the notification center); while `quiet()` (Do Not
 * Disturb) no card is shown.
 */
export class MessageHub {
  private cards = new Map<string, MessageData>()
  private backends: Partial<Record<MessageSource, MessageBackend>> = {}

  constructor(
    private transient: TransientCards,
    private record: (m: MessageArrival) => void = () => {},
    private quiet: () => boolean = () => false,
  ) {
    transient.onDismiss((id) => this.cards.delete(id))
  }

  setBackend(source: MessageSource, b: MessageBackend | null): void {
    if (b) this.backends[source] = b
    else delete this.backends[source]
  }

  private show(id: string, m: MessageData, ms = MESSAGE_MS): void {
    this.cards.set(id, m)
    this.transient.show({ kind: 'message', id, priority: 5, message: m }, ms)
  }

  /** A WhatsApp message: one card per chat, accumulating lines. */
  addWhatsApp(w: WaIncoming): void {
    const id = messageId('whatsapp', w.chatId)
    const sender = w.isGroup ? (w.chatName ?? w.sender) : w.sender
    this.record({
      id,
      source: 'whatsapp',
      app: 'WhatsApp',
      icon: w.avatar,
      title: sender,
      body: w.isGroup ? `${w.sender}: ${w.text}` : w.text,
      thread: w.chatId,
      at: w.time,
    })
    if (this.quiet()) return
    const prev = this.cards.get(id)
    const line: ChatLine = { text: w.text, time: w.time, author: w.isGroup ? w.sender : undefined }
    this.show(id, {
      source: 'whatsapp',
      threadId: w.chatId,
      sender,
      title: w.isGroup ? w.chatName : undefined,
      avatar: w.avatar ?? prev?.avatar,
      lines: withLine(prev?.lines ?? [], line),
      canReply: !!this.backends.whatsapp,
    })
  }

  /** A new mail: one card per message. */
  addMail(m: IncomingMail, accountLabel?: string): void {
    const threadId = `${m.accountId}:${m.uid}`
    this.record({
      id: messageId('mail', threadId),
      source: 'mail',
      app: accountLabel ? `Mail · ${accountLabel}` : 'Mail',
      title: m.from.name || m.from.address,
      body: [m.subject, m.snippet].filter(Boolean).join(' · '),
      thread: threadId,
      at: m.date || Date.now(),
    })
    if (this.quiet()) return
    this.show(messageId('mail', threadId), {
      source: 'mail',
      threadId,
      sender: m.from.name,
      title: m.subject,
      account: accountLabel,
      lines: [{ text: m.snippet, time: m.date }],
      canReply: !!this.backends.mail,
    })
  }

  private update(id: string, patch: Partial<MessageData>, ms?: number): void {
    const cur = this.cards.get(id)
    if (!cur) return
    this.show(id, { ...cur, ...patch }, ms)
  }

  async reply(id: string, text: string): Promise<void> {
    const cur = this.cards.get(id)
    const backend = cur && this.backends[cur.source]
    if (!cur || !backend) return
    this.update(id, { status: { kind: 'sending' } })
    this.transient.hold(id, true)
    try {
      await backend.reply(cur.threadId, text)
      this.update(id, {
        status: { kind: 'sent' },
        lines: withLine(cur.lines, { text, time: Date.now(), author: 'You' }),
      })
      this.transient.dismissIn(id, SENT_MS)
    } catch (e: any) {
      this.update(id, { status: { kind: 'error', text: e?.message ?? String(e) } })
    }
  }

  /** Close the card for a conversation (e.g. it was opened in the hub). */
  closeThread(source: MessageSource, threadId: string): void {
    const id = messageId(source, threadId)
    if (this.cards.has(id)) this.transient.dismiss(id)
  }

  async markRead(id: string): Promise<void> {
    const cur = this.cards.get(id)
    const backend = cur && this.backends[cur.source]
    if (!cur) return
    this.transient.dismiss(id)
    await backend?.markRead(cur.threadId).catch((e) => console.error('mark read:', e))
  }
}
