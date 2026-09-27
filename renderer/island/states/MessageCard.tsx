import { useEffect, useState, type MouseEvent } from 'react'
import type { MessageData } from '@shared/types'
import { Badge } from './Badge'
import { ReplyBox } from './ReplyBox'

const SOURCE = {
  whatsapp: { label: 'WhatsApp', color: '#25d366', glyph: '💬' },
  mail: { label: 'Mail', color: '#5aa9ff', glyph: '✉' },
} as const

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  )
}

/** WhatsApp chat / new mail, with quick reply and mark-as-read. */
export function MessageCard({
  id,
  message: m,
  queued,
  onReplying,
}: {
  id: string
  message: MessageData
  queued: number
  onReplying: (on: boolean) => void
}) {
  const [replying, setReplying] = useState(false)
  const src = SOURCE[m.source]
  const busy = m.status?.kind === 'sending'
  const sent = m.status?.kind === 'sent'

  useEffect(() => onReplying(replying), [replying, onReplying])
  // Close the box once the reply has gone out.
  useEffect(() => {
    if (sent) setReplying(false)
  }, [sent])

  const act = (e: MouseEvent, fn: () => void) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div className={`card message ${m.source}`}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        {m.avatar ? (
          <img className="avatar" src={m.avatar} alt="" />
        ) : (
          <div className="avatar placeholder" style={{ background: src.color }}>
            {m.source === 'mail' ? src.glyph : initials(m.sender)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
            <div className="sub ellipsis">
              <span style={{ color: src.color }}>{src.label}</span>
              {m.account && ` · ${m.account}`}
            </div>
            <Badge count={queued} />
          </div>
          <div className="title ellipsis">{m.sender}</div>
          {m.source === 'mail' && m.title && <div className="subject ellipsis">{m.title}</div>}
          <div className="lines">
            {m.lines.map((l, i) => (
              <div key={i} className={`line${l.author === 'You' ? ' mine' : ''}`}>
                {l.author && <span className="author">{l.author}: </span>}
                {l.text || <span className="sub">(no text)</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {m.status?.kind === 'error' && <div className="error">Couldn't send: {m.status.text}</div>}
      {sent && <div className="ok">Sent ✓</div>}

      {replying ? (
        <ReplyBox
          placeholder={`Reply to ${m.sender}…`}
          onSend={(text) => window.island.reply(id, text)}
          onClose={() => setReplying(false)}
        />
      ) : (
        !sent && (
          <div className="row actions" style={{ justifyContent: 'flex-end' }}>
            <button className="link" onClick={(e) => act(e, () => window.island.dismiss(id))}>
              Dismiss
            </button>
            <button className="btn small" onClick={(e) => act(e, () => window.island.markRead(id))}>
              Mark read
            </button>
            {m.canReply && (
              <button
                className="btn allow small"
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
