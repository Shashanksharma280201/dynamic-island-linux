import { useEffect, useState, type MouseEvent } from 'react'
import type { MessageData } from '@shared/types'
import { Badge } from './Badge'
import { ReplyBox } from './ReplyBox'
import { Avatar } from '../hub/common'
import { ChatIcon, MailIcon, XIcon } from '../icons'

const SOURCE = {
  whatsapp: { label: 'WhatsApp', color: 'var(--whatsapp)', Icon: ChatIcon },
  mail: { label: 'Mail', color: 'var(--blue)', Icon: MailIcon },
} as const

/** WhatsApp chat / new mail, with quick reply and mark-as-read. */
export function MessageCard({
  id,
  message: m,
  queued,
  onReplying,
  onOpen,
}: {
  id: string
  message: MessageData
  queued: number
  onReplying: (on: boolean) => void
  /** Open this source in the hub (full chat list / inbox). */
  onOpen: () => void
}) {
  const [replying, setReplying] = useState(false)
  const src = SOURCE[m.source]
  const busy = m.status?.kind === 'sending'
  const sent = m.status?.kind === 'sent'

  useEffect(() => onReplying(replying), [replying, onReplying])
  // Close the field once the reply has gone out.
  useEffect(() => {
    if (sent) setReplying(false)
  }, [sent])

  const act = (e: MouseEvent, fn: () => void) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div className={`card message ${m.source}`}>
      <div className="card-head">
        <span className="app-glyph" style={{ background: src.color }}>
          <src.Icon />
        </span>
        <span className="app-name ellipsis">
          {src.label}
          {m.account && ` · ${m.account}`}
        </span>
        <span className="spacer" />
        <Badge count={queued} />
        <span className="when">now</span>
        <button className="close-btn" title="Dismiss" onClick={(e) => act(e, () => window.island.dismiss(id))}>
          <XIcon />
        </button>
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <Avatar name={m.sender} src={m.avatar} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title ellipsis">{m.sender}</div>
          {m.source === 'mail' && m.title && <div className="subject ellipsis">{m.title}</div>}
          <div className="lines">
            {m.lines.map((l, i) =>
              m.source === 'mail' && l.author !== 'You' ? (
                <div key={i} className="line notif-body clamp2 secondary">
                  {l.text || '(no preview)'}
                </div>
              ) : (
                <div key={i} className={`line bubble${l.author === 'You' ? ' mine' : ''}`}>
                  {l.author && l.author !== 'You' && <span className="author">{l.author}</span>}
                  {l.text || '(no text)'}
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      {m.status?.kind === 'error' && <div className="status error">Couldn't send: {m.status.text}</div>}
      {sent && <div className="status ok">Sent</div>}

      {replying ? (
        <ReplyBox
          placeholder={m.source === 'whatsapp' ? 'Message' : `Reply to ${m.sender}`}
          onSend={(text) => window.island.reply(id, text)}
          onClose={() => setReplying(false)}
        />
      ) : (
        !sent && (
          <div className="actions">
            <button className="plain" onClick={(e) => act(e, onOpen)}>
              {m.source === 'mail' ? 'Open Inbox' : 'Open Chats'}
            </button>
            <span className="spacer" />
            <button className="pill" onClick={(e) => act(e, () => window.island.markRead(id))}>
              Mark as Read
            </button>
            {m.canReply && (
              <button
                className="pill primary reply-btn"
                disabled={busy}
                onClick={(e) => act(e, () => setReplying(true))}
              >
                {busy ? 'Sending…' : 'Reply'}
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}
