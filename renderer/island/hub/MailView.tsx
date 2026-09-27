import { useState } from 'react'
import type { InboxSources, MailSummary } from '@shared/types'
import { relativeTime, fullTime } from '@shared/format'
import { BackButton, Empty, Spinner, errorText, initials, useLoad, useNow } from './common'
import { Composer } from './Composer'
import { MailIcon } from '../icons'

const onMail = (reload: () => void) =>
  window.island.inbox.onChanged((w) => {
    if (w === 'mail') reload()
  })

function Reader({ mail, onBack, onTyping }: { mail: MailSummary; onBack: () => void; onTyping: (on: boolean) => void }) {
  const { data, error } = useLoad(() => window.island.inbox.mailGet(mail.accountId, mail.uid), [mail.accountId, mail.uid])
  const [replying, setReplying] = useState(false)
  const [sent, setSent] = useState(false)

  return (
    <div className="view">
      <div className="view-head">
        <BackButton onClick={onBack} label="Inbox" />
        <span className="spacer" />
        {!replying && !sent && (
          <button className="pill primary small" onClick={(e) => (e.stopPropagation(), setReplying(true))}>
            Reply
          </button>
        )}
      </div>
      <div className="reader">
        <div className="headline">{mail.subject}</div>
        <div className="row" style={{ gap: 10, margin: '10px 0 12px' }}>
          <div className="avatar placeholder small">{initials(mail.from.name)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="title ellipsis">{mail.from.name}</div>
            <div className="caption ellipsis">
              {mail.from.address}
              {data?.to && ` → ${data.to}`}
            </div>
          </div>
          <span className="when">{fullTime(mail.date)}</span>
        </div>
        <div className="mail-body">
          {!data && !error && <Spinner />}
          {error && <div className="status error">{error}</div>}
          {data && (data.text || <i className="secondary">(no text content)</i>)}
        </div>
      </div>
      {sent && <div className="status ok" style={{ padding: '0 14px 12px' }}>Reply sent</div>}
      {replying && (
        <Composer
          autoFocus
          placeholder={`Reply to ${mail.from.name}`}
          onTyping={onTyping}
          onSend={async (text) => {
            await window.island.inbox.mailReply(mail.accountId, mail.uid, text)
            setReplying(false)
            setSent(true)
          }}
        />
      )}
    </div>
  )
}

export function MailView({ sources, onTyping }: { sources: InboxSources; onTyping: (on: boolean) => void }) {
  const [account, setAccount] = useState<string | undefined>(undefined)
  const [open, setOpen] = useState<MailSummary | null>(null)
  const has = sources.mail.length > 0
  const { data, error, loading, reload } = useLoad(
    () => (has ? window.island.inbox.mailList(account) : Promise.resolve([])),
    [has, account, open === null],
    onMail,
  )
  const now = useNow()

  if (!has)
    return (
      <Empty
        icon={<MailIcon />}
        title="No mail account"
        body="Add an IMAP account (Gmail, iCloud, Yahoo, Fastmail…) to read your inbox here."
        action={
          <button className="pill primary" onClick={() => window.island.openSettings('mail')}>
            Add Account
          </button>
        }
      />
    )
  if (open) return <Reader mail={open} onBack={() => setOpen(null)} onTyping={onTyping} />

  return (
    <>
      {sources.mail.length > 1 && (
        <div className="chips" onClick={(e) => e.stopPropagation()}>
          {[{ id: undefined, label: 'All Inboxes' }, ...sources.mail].map((a) => (
            <button key={a.id ?? 'all'} className={`chip${account === a.id ? ' on' : ''}`} onClick={() => setAccount(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div className="list">
        {!data && loading && <Spinner />}
        {error && !data && (
          <Empty
            title="Couldn't load the inbox"
            body={error}
            action={
              <button className="pill" onClick={(e) => (e.stopPropagation(), reload())}>
                Try Again
              </button>
            }
          />
        )}
        {data && data.length === 0 && <Empty icon={<MailIcon />} title="Inbox is empty" />}
        {data?.map((m) => (
          <button
            key={`${m.accountId}:${m.uid}`}
            className={`list-row mail-row${m.unread ? ' unread' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(m)
              window.island.inbox.mailRead(m.accountId, m.uid).catch((err) => console.error(errorText(err)))
            }}
          >
            <span className="unread-dot" />
            <div className="list-main">
              <div className="list-top">
                <span className="title ellipsis">{m.from.name}</span>
                <span className="when">{relativeTime(m.date, now)}</span>
              </div>
              <div className="subject ellipsis">{m.subject}</div>
              <div className="secondary clamp2 snippet">{m.snippet}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
