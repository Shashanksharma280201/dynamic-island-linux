import { useEffect, useRef, useState } from 'react'
import type { ChatSummary, InboxSources } from '@shared/types'
import { relativeTime } from '@shared/format'
import { BackButton, Empty, Spinner, initials, useLoad, useNow } from './common'
import { Composer } from './Composer'
import { ChatIcon } from '../icons'

const onWhatsApp = (reload: () => void) =>
  window.island.inbox.onChanged((w) => {
    if (w === 'whatsapp') reload()
  })

function Conversation({ chat, onBack, onTyping }: { chat: ChatSummary; onBack: () => void; onTyping: (on: boolean) => void }) {
  const { data, error, loading, reload } = useLoad(() => window.island.inbox.chat(chat.id), [chat.id], onWhatsApp)
  const scroller = useRef<HTMLDivElement>(null)

  // Stay pinned to the newest message, like Messages.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [data])

  return (
    <div className="view">
      <div className="view-head">
        <BackButton onClick={onBack} label="Chats" />
        <div className="view-title ellipsis">{chat.name}</div>
        <span style={{ width: 60 }} />
      </div>
      <div className="thread" ref={scroller}>
        {!data && loading && <Spinner />}
        {error && !data && <Empty title="Couldn't load messages" body={error} />}
        {data?.map((m) => (
          <div key={m.id} className={`bubble${m.fromMe ? ' mine' : ''}`}>
            {m.author && <span className="author">{m.author}</span>}
            {m.text || <i className="secondary">(no text)</i>}
          </div>
        ))}
      </div>
      <Composer
        placeholder="Message"
        onTyping={onTyping}
        onSend={async (text) => {
          await window.island.inbox.sendChat(chat.id, text)
          reload()
        }}
      />
    </div>
  )
}

export function ChatsView({ sources, onTyping }: { sources: InboxSources; onTyping: (on: boolean) => void }) {
  const [open, setOpen] = useState<ChatSummary | null>(null)
  const ready = sources.whatsapp === 'ready'
  const { data, error, loading } = useLoad(
    () => (ready ? window.island.inbox.chats() : Promise.resolve([])),
    [ready, open === null],
    onWhatsApp,
  )
  const now = useNow()

  if (sources.whatsapp === 'off')
    return (
      <Empty
        icon={<ChatIcon />}
        title="WhatsApp isn't connected"
        body="Link your phone to see your chats and reply here."
        action={
          <button className="pill primary" onClick={() => window.island.openSettings('whatsapp')}>
            Set Up WhatsApp
          </button>
        }
      />
    )
  if (!ready)
    return (
      <Empty
        icon={<Spinner />}
        title="Connecting to WhatsApp…"
        body="If this is the first time, scan the QR code in Settings."
        action={
          <button className="pill" onClick={() => window.island.openSettings('whatsapp')}>
            Open Settings
          </button>
        }
      />
    )
  if (open) return <Conversation chat={open} onBack={() => setOpen(null)} onTyping={onTyping} />

  return (
    <div className="list">
      {!data && loading && <Spinner />}
      {error && !data && <Empty title="Couldn't load chats" body={error} />}
      {data && data.length === 0 && <Empty title="No chats yet" />}
      {data?.map((c) => (
        <button key={c.id} className="list-row chat-row" onClick={(e) => (e.stopPropagation(), setOpen(c))}>
          <div className="avatar placeholder">{initials(c.name)}</div>
          <div className="list-main">
            <div className="list-top">
              <span className="title ellipsis">{c.name}</span>
              <span className="when">{c.time ? relativeTime(c.time, now) : ''}</span>
            </div>
            <div className="list-bottom">
              <span className="secondary clamp2">
                {c.lastFromMe && 'You: '}
                {c.last}
              </span>
              {c.unread > 0 && <span className="count">{c.unread}</span>}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
