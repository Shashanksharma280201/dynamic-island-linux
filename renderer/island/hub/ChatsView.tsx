import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatSummary, InboxSources } from '@shared/types'
import { relativeTime, clockTime, dayKey, dayLabel } from '@shared/format'
import { nameColor } from '@shared/avatar'
import { Avatar as ChatAvatar, BackButton, Empty, Spinner, useLoad, useNow } from './common'
import { Composer } from './Composer'
import { SearchField } from './SearchField'
import { ChatIcon } from '../icons'

const onWhatsApp = (reload: () => void) =>
  window.island.inbox.onChanged((w) => {
    if (w === 'whatsapp') reload()
  })

function Conversation({ chat, onBack, onTyping }: { chat: ChatSummary; onBack: () => void; onTyping: (on: boolean) => void }) {
  const { data, error, loading, reload } = useLoad(() => window.island.inbox.chat(chat.id), [chat.id], onWhatsApp)
  const scroller = useRef<HTMLDivElement>(null)
  const now = useNow()

  // Stay pinned to the newest message, like Messages.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [data])

  return (
    <div className="view conversation">
      <div className="view-head chat-head">
        <BackButton onClick={onBack} label="" />
        <ChatAvatar name={chat.name} src={chat.avatar} small />
        <div className="chat-head-text">
          <div className="title ellipsis">{chat.name}</div>
          <div className="caption">{chat.isGroup ? 'Group' : 'WhatsApp'}</div>
        </div>
      </div>
      <div className="thread" ref={scroller}>
        {!data && loading && <Spinner />}
        {error && !data && <Empty title="Couldn't load messages" body={error} />}
        {data && data.length === 0 && <Empty title="No messages yet" body="Say hello below." />}
        {data?.map((m, i) => {
          const prev = data[i - 1]
          const newDay = !prev || dayKey(prev.time) !== dayKey(m.time)
          // Consecutive messages from the same sender are grouped (no repeated name, tighter gap).
          const sameSender = !newDay && prev && prev.fromMe === m.fromMe && prev.author === m.author
          return (
            <Fragment key={m.id}>
              {newDay && m.time > 0 && <div className="day-sep">{dayLabel(m.time, now)}</div>}
              <div className={`bubble${m.fromMe ? ' mine' : ''}${sameSender ? ' cont' : ''}`}>
                {m.author && !m.fromMe && !sameSender && (
                  <span className="author" style={{ color: nameColor(m.author) }}>
                    {m.author}
                  </span>
                )}
                <span className="bubble-text">{m.text || <i className="secondary">(no text)</i>}</span>
                {m.time > 0 && <span className="stamp">{clockTime(m.time)}</span>}
              </div>
            </Fragment>
          )
        })}
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
  const [query, setQuery] = useState('')
  const ready = sources.whatsapp === 'ready'
  const { data, error, loading, reload } = useLoad(
    () => (ready ? window.island.inbox.chats() : Promise.resolve([])),
    [ready, open === null],
    onWhatsApp,
  )
  const now = useNow()
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? data?.filter((c) => c.name.toLowerCase().includes(q) || c.last.toLowerCase().includes(q)) : data
  }, [data, query])

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

  const unread = data?.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0) ?? 0

  return (
    <div className="view">
      <div className="section-head">
        <span className="large-title">Chats</span>
        {unread > 0 && <span className="caption">{unread} unread</span>}
      </div>
      {data && data.length > 0 && <SearchField value={query} onChange={setQuery} onTyping={onTyping} placeholder="Search chats" />}
      <div className="list chat-list">
        {!data && loading && <Spinner />}
        {error && !data && (
          <Empty
            title="Couldn't load chats"
            body={error}
            action={
              <button className="pill" onClick={(e) => (e.stopPropagation(), reload())}>
                Try Again
              </button>
            }
          />
        )}
        {data && data.length === 0 && <Empty title="No chats yet" />}
        {shown && data && data.length > 0 && shown.length === 0 && <Empty title="No results" body={`Nothing matches “${query.trim()}”.`} />}
        {shown?.map((c) => (
          <button
            key={c.id}
            className={`list-row chat-row${c.unread > 0 ? ' unread' : ''}`}
            onClick={(e) => (e.stopPropagation(), setOpen(c))}
          >
            <ChatAvatar name={c.name} src={c.avatar} />
            <div className="list-main">
              <div className="list-top">
                <span className="title ellipsis">{c.name}</span>
                <span className="when">{c.time ? relativeTime(c.time, now) : ''}</span>
              </div>
              <div className="list-bottom">
                <span className="preview ellipsis">
                  {c.lastFromMe && <span className="you">You: </span>}
                  {c.last || (c.isGroup ? 'Group' : '')}
                </span>
                {c.unread > 0 && <span className="count">{c.unread > 99 ? '99+' : c.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
