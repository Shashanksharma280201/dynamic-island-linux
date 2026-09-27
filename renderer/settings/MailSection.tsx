import { useEffect, useState } from 'react'
import type { MailAccountView, MailServer } from '@shared/types'
import { useAction } from './Settings'

type Preset = { imap: MailServer; smtp: MailServer; note?: string }
type Draft = {
  id?: string
  label: string
  user: string
  name: string
  password: string
  imap: MailServer
  smtp: MailServer
}

const EMPTY: Draft = {
  label: '',
  user: '',
  name: '',
  password: '',
  imap: { host: '', port: 993, secure: true },
  smtp: { host: '', port: 465, secure: true },
}

function ServerFields({ title, v, onChange }: { title: string; v: MailServer; onChange: (v: MailServer) => void }) {
  return (
    <div className="server">
      <span className="hint">{title}</span>
      <input placeholder="host" value={v.host} onChange={(e) => onChange({ ...v, host: e.target.value })} />
      <input
        className="port"
        type="number"
        value={v.port}
        onChange={(e) => onChange({ ...v, port: Number(e.target.value) })}
      />
      <label className="inline">
        <input type="checkbox" checked={v.secure} onChange={(e) => onChange({ ...v, secure: e.target.checked })} /> SSL/TLS
      </label>
    </div>
  )
}

function Editor({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const [note, setNote] = useState<string | undefined>()
  const [tested, setTested] = useState(false)
  const { error, busy, run } = useAction()
  const editing = !!initial.id

  // Fill server settings from a known provider when the address is typed.
  useEffect(() => {
    if (editing || !d.user.includes('@')) return
    window.settings.mailPresets(d.user).then(({ presets, suggested }: { presets: Record<string, Preset>; suggested: string | null }) => {
      const p = suggested ? presets[suggested] : null
      setNote(p?.note)
      if (p) setD((x) => ({ ...x, imap: p.imap, smtp: p.smtp }))
    })
  }, [d.user, editing])

  const account = () => ({
    id: d.id,
    label: d.label || d.user,
    user: d.user.trim(),
    name: d.name || undefined,
    imap: d.imap,
    smtp: d.smtp,
  })

  return (
    <div className="editor">
      <input placeholder="Email address" value={d.user} disabled={editing} onChange={(e) => setD({ ...d, user: e.target.value })} />
      <input placeholder="Your name (shown on replies)" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      <input placeholder="Label (e.g. Work)" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      <input
        type="password"
        placeholder={editing ? 'Password (leave empty to keep)' : 'App password'}
        value={d.password}
        onChange={(e) => setD({ ...d, password: e.target.value })}
      />
      {note && <p className="hint">{note}</p>}
      <ServerFields title="IMAP (incoming)" v={d.imap} onChange={(imap) => setD({ ...d, imap })} />
      <ServerFields title="SMTP (outgoing)" v={d.smtp} onChange={(smtp) => setD({ ...d, smtp })} />
      {error && <p className="error">{error}</p>}
      {tested && !error && <p className="ok-text">Connection works ✓</p>}
      <div className="row">
        <button className="secondary" onClick={onDone}>
          Cancel
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setTested(false)
            const ok = await run(async () => {
              await window.settings.mailTest(account(), d.password || undefined)
              return true
            })
            setTested(!!ok)
          }}
        >
          {busy ? 'Checking…' : 'Test'}
        </button>
        <button
          disabled={busy || !d.user}
          onClick={async () => {
            const id = await run(() => window.settings.mailSave(account(), d.password || undefined))
            if (id) onDone()
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

export function MailSection({ accounts }: { accounts: MailAccountView[] }) {
  const [editing, setEditing] = useState<Draft | null>(null)
  return (
    <>
      {accounts.length === 0 && !editing && (
        <p className="hint">Add an IMAP/SMTP account to see new mail on the island and reply to it.</p>
      )}
      {accounts.map((a) => (
        <div key={a.id} className="account">
          <span className={`dot ${a.status?.state === 'connected' ? 'ok' : a.status?.state === 'error' ? 'bad' : ''}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{a.label}</div>
            <div className="hint">
              {a.user}
              {a.status?.state === 'error' && <span className="error"> · {a.status.error}</span>}
              {a.status?.state === 'connecting' && ' · connecting…'}
            </div>
          </div>
          <button className="secondary" onClick={() => setEditing({ ...EMPTY, ...a, name: a.name ?? '', password: '' })}>
            Edit
          </button>
          <button className="danger" onClick={() => window.settings.mailRemove(a.id)}>
            Remove
          </button>
        </div>
      ))}
      {editing ? (
        <Editor key={editing.id ?? 'new'} initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <button onClick={() => setEditing(EMPTY)}>Add account</button>
      )}
    </>
  )
}
