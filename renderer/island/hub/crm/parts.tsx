import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ACTIVITY_KINDS,
  KIND_LABEL,
  STAGE_LABEL,
  STATUS_LABEL,
  dueLabel,
  type Activity,
  type ActivityKind,
  type ContactStatus,
  type ContactSummary,
  type DealStage,
  type TaskSummary,
} from '@shared/crm'
import { relativeTime } from '@shared/format'
import { errorText, useNow } from '../common'
import { useKeyboard } from '../useKeyboard'
import { ChatIcon, MailIcon, NoteIcon, PhoneIcon, XIcon } from '../../icons'

/** "2026-10-02" for a date (local). Pure. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** A text field that takes the keyboard while you type (the island is unfocusable otherwise). */
export function Field({
  value,
  onChange,
  onTyping,
  placeholder,
  label,
  multiline,
  autoFocus,
  type = 'text',
  onEnter,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  onTyping: (on: boolean) => void
  placeholder?: string
  label: string
  multiline?: boolean
  autoFocus?: boolean
  type?: 'text' | 'date' | 'time' | 'number' | 'email'
  onEnter?: () => void
  className?: string
}) {
  const kb = useKeyboard(onTyping)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!autoFocus) return
    kb.take()
    // Unless you've already clicked into another field.
    const t = setTimeout(() => {
      const busy = document.activeElement && document.activeElement !== document.body && document.activeElement !== ref.current
      if (!busy) ref.current?.focus()
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const common = {
    ref,
    value,
    placeholder,
    'aria-label': label,
    className: `crm-input ${className}`,
    onPointerDown: () => {
      kb.take()
      setTimeout(() => ref.current?.focus(), 40)
    },
    onFocus: kb.take,
    onBlur: kb.release,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onKeyDown: (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Enter' && onEnter && (!multiline || !e.shiftKey)) {
        e.preventDefault()
        onEnter()
      } else if (e.key === 'Escape') ref.current?.blur()
    },
  }
  return multiline ? <textarea rows={3} {...common} /> : <input type={type} {...common} />
}

export function StatusPill({ status }: { status?: ContactStatus }) {
  if (!status) return null
  return <span className={`crm-pill status-${status}`}>{STATUS_LABEL[status]}</span>
}

export function StagePill({ stage }: { stage: DealStage }) {
  return <span className={`crm-pill stage-${stage}`}>{STAGE_LABEL[stage]}</span>
}

/** A titled part of a page, with an optional button on the right. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="crm-section">
      <div className="crm-section-head">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Quick due dates, or any date (and time). */
export function DuePicker({ value, onChange, onTyping }: { value: string; onChange: (v: string) => void; onTyping: (on: boolean) => void }) {
  const today = new Date()
  const quick: [string, string][] = [
    ['Today', isoDay(today)],
    ['Tomorrow', isoDay(addDays(today, 1))],
    ['Next week', isoDay(addDays(today, 7))],
  ]
  const [day, time = ''] = value.split('T')
  return (
    <div className="crm-due">
      <div className="chips crm-due-chips">
        {quick.map(([label, v]) => (
          <button key={label} className={`chip${day === v ? ' on' : ''}`} onClick={() => onChange(time ? `${v}T${time}` : v)}>
            {label}
          </button>
        ))}
        <button className={`chip${!value ? ' on' : ''}`} onClick={() => onChange('')}>
          No date
        </button>
      </div>
      <div className="crm-due-exact">
        <Field type="date" label="Due date" value={day ?? ''} onChange={(v) => onChange(v ? (time ? `${v}T${time}` : v) : '')} onTyping={onTyping} />
        <Field type="time" label="Due time" value={time} onChange={(v) => day && onChange(v ? `${day}T${v}` : day)} onTyping={onTyping} />
      </div>
    </div>
  )
}

/** Pick a contact by typing part of their name. */
export function ContactPicker({ value, onChange, onTyping }: { value: { id: string; name: string } | null; onChange: (c: { id: string; name: string } | null) => void; onTyping: (on: boolean) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ContactSummary[]>([])
  useEffect(() => {
    let live = true
    if (!q.trim()) return setHits([])
    window.island.crm
      .contacts(q)
      .then((r) => live && setHits(r.slice(0, 5)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [q])
  if (value)
    return (
      <div className="crm-picked">
        <span className="chip on">{value.name}</span>
        <button className="close-btn" aria-label="No contact" onClick={() => onChange(null)}>
          <XIcon />
        </button>
      </div>
    )
  return (
    <div className="crm-picker">
      <Field value={q} onChange={setQ} onTyping={onTyping} label="Contact" placeholder="Who is it with? (optional)" />
      {hits.length > 0 && (
        <div className="crm-picker-hits">
          {hits.map((c) => (
            <button key={c.id} className="chip" onClick={() => (onChange({ id: c.id, name: c.name }), setQ(''))}>
              {c.name}
              {c.company ? ` · ${c.company}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One follow-up: tick it off, or open what it's about. */
export function TaskRow({ task, onOpen, showContact = true }: { task: TaskSummary; onOpen?: () => void; showContact?: boolean }) {
  const now = new Date(useNow(60_000))
  const due = dueLabel(task.due, now)
  const late = !task.done && due.startsWith('Overdue')
  return (
    <div className={`crm-task${task.done ? ' done' : ''}`} data-task={task.title}>
      <button
        className={`doc-check crm-check${task.done ? ' on' : ''}`}
        aria-label={task.done ? `Reopen “${task.title}”` : `Done: “${task.title}”`}
        onClick={() => void window.island.crm.saveTask(task.id, { done: !task.done })}
      >
        {task.done && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2.5 6.2 2.3 2.3 4.7-5" />
          </svg>
        )}
      </button>
      <button className="crm-task-main plain" onClick={onOpen} disabled={!onOpen}>
        <span className="crm-task-title">{task.title}</span>
        <span className={`caption${late ? ' late' : ''}`}>{[showContact ? task.contactName : '', task.dealTitle, due].filter(Boolean).join(' · ') || 'No date'}</span>
      </button>
    </div>
  )
}

/** A meeting: two people. */
const MeetingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8.5" cy="8" r="3" />
    <circle cx="16.5" cy="9" r="2.5" />
    <path d="M3 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.4c.6-.3 1.3-.4 2-.4 2.3 0 4 1.5 4.5 4" />
  </svg>
)

const KIND_ICON: Record<ActivityKind, ReactNode> = { note: <NoteIcon />, call: <PhoneIcon />, meeting: <MeetingIcon />, email: <MailIcon />, message: <ChatIcon /> }

/** What happened, newest first. */
export function Timeline({ activities, onDeleted }: { activities: Activity[]; onDeleted: (batch: string, what: string) => void }) {
  const now = useNow()
  if (!activities.length) return <div className="caption crm-empty-line">Nothing logged yet.</div>
  return (
    <div className="crm-timeline">
      {activities.map((a) => (
        <div key={a.id} className={`crm-entry kind-${a.kind}`}>
          <span className="crm-entry-icon" aria-hidden>
            {KIND_ICON[a.kind]}
          </span>
          <div className="crm-entry-main">
            <div className="caption">
              {KIND_LABEL[a.kind]} · {relativeTime(a.at, now)}
            </div>
            <div className="crm-entry-text">{a.text}</div>
          </div>
          <button
            className="plain crm-entry-x"
            aria-label="Delete this entry"
            onClick={() => void window.island.crm.remove('activity', a.id).then((b) => onDeleted(b, `this ${KIND_LABEL[a.kind].toLowerCase()}`))}
          >
            <XIcon />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Log a call, meeting, note… on a timeline. */
export function LogComposer({ contactId, dealId, onTyping }: { contactId?: string; dealId?: string; onTyping: (on: boolean) => void }) {
  const [kind, setKind] = useState<ActivityKind>('note')
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!text.trim()) return
    try {
      await window.island.crm.log({ contactId, dealId, kind, text })
      setText('')
      setErr(null)
    } catch (e) {
      setErr(errorText(e))
    }
  }
  return (
    <div className="crm-log">
      <div className="chips">
        {ACTIVITY_KINDS.map((k) => (
          <button key={k} className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="crm-log-row">
        <Field value={text} onChange={setText} onTyping={onTyping} label="What happened" placeholder={kind === 'note' ? 'Add a note…' : `What was the ${KIND_LABEL[kind].toLowerCase()} about?`} onEnter={() => void save()} multiline />
        <button className="pill small primary" disabled={!text.trim()} onClick={() => void save()}>
          Log
        </button>
      </div>
      {err && <div className="status error">{err}</div>}
    </div>
  )
}
