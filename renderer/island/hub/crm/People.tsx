import { useState } from 'react'
import {
  CONTACT_STATUSES,
  STATUS_LABEL,
  money,
  type ContactForm,
  type ContactPage,
  type ContactStatus,
  type ContactSummary,
} from '@shared/crm'
import { relativeTime } from '@shared/format'
import { Avatar, Empty, Spinner, errorText, useLoad, useNow } from '../common'
import { SearchField } from '../SearchField'
import { TrashIcon } from '../../icons'
import { Field, LogComposer, Section, StagePill, StatusPill, TaskRow, Timeline } from './parts'
import type { CrmNav } from './CrmView'

const FILTERS: { id: '' | ContactStatus; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'lead', label: 'Leads' },
  { id: 'customer', label: 'Customers' },
  { id: 'partner', label: 'Partners' },
]

/** Everyone, searchable, the people you dealt with lately first. */
export function PeopleList({ nav, onTyping }: { nav: CrmNav; onTyping: (on: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'' | ContactStatus>('')
  const now = useNow()
  const { data, error, loading } = useLoad<ContactSummary[]>(
    () => window.island.crm.contacts(query, status || undefined),
    [query, status],
    (r) => window.island.crm.onChanged(() => r()),
  )
  const empty = data && !data.length && !query && !status
  return (
    <>
      <div className="crm-toolbar">
        <SearchField value={query} onChange={setQuery} onTyping={onTyping} placeholder="Search people" />
      </div>
      {!empty && (
        <div className="chips crm-filters">
          {FILTERS.map((f) => (
            <button key={f.id || 'all'} className={`chip${status === f.id ? ' on' : ''}`} onClick={() => setStatus(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div className="list crm-list">
        {!data && loading && <Spinner />}
        {error && !data && <Empty title="Couldn't load your contacts" body={error} />}
        {empty && (
          <Empty
            title="Your people live here"
            body="Add the people you work with, or import them from a CSV, Excel or vCard file (Google Contacts, Outlook, your phone). Everything stays on this computer."
            action={
              <div className="crm-empty-actions">
                <button className="pill primary" onClick={() => nav.go({ kind: 'editContact' })}>
                  Add Contact
                </button>
                <button className="pill" onClick={() => nav.importContacts()}>
                  Import…
                </button>
              </div>
            }
          />
        )}
        {data && !data.length && !empty && <Empty title="Nobody matches" />}
        {data?.map((c) => (
          <button key={c.id} className="list-row crm-person" data-contact={c.name} onClick={() => nav.go({ kind: 'contact', id: c.id })}>
            <Avatar name={c.name} small />
            <div className="list-main">
              <div className="list-top">
                <span className="title ellipsis">{c.name}</span>
                <span className="when">{c.lastTouch ? relativeTime(c.lastTouch, now) : ''}</span>
              </div>
              <div className="crm-person-sub">
                <span className="caption ellipsis">{[c.title, c.company].filter(Boolean).join(' · ') || c.email || c.phone || ''}</span>
                <StatusPill status={c.status} />
                {c.openTasks > 0 && (
                  <span className="crm-count" title={`${c.openTasks} open follow-up${c.openTasks === 1 ? '' : 's'}`}>
                    {c.openTasks}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

/** Copy a detail when tapped, saying so for a moment. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="crm-detail plain"
      title="Copy"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }
    >
      <span className="caption">{label}</span>
      <span className="crm-detail-value">{copied ? 'Copied' : value}</span>
    </button>
  )
}

/** Everything about one person: details, follow-ups, deals and the timeline. */
export function ContactPageView({ id, nav, onTyping, currency }: { id: string; nav: CrmNav; onTyping: (on: boolean) => void; currency: string }) {
  const { data, error } = useLoad<ContactPage>(
    () => window.island.crm.contact(id),
    [id],
    (r) => window.island.crm.onChanged(() => r()),
  )
  if (error && !data) return <Empty title="This contact was deleted" body={error} />
  if (!data) return <Spinner />
  const c = data.contact
  const open = data.tasks.filter((t) => !t.done)
  const done = data.tasks.filter((t) => t.done)
  const setStatus = (s: ContactStatus) => void window.island.crm.saveContact(c.id, { ...formOf(data), status: c.status === s ? '' : s })
  return (
    <div className="crm-page" data-page={c.name}>
      <div className="crm-hero">
        <Avatar name={c.name} />
        <div className="crm-hero-text">
          <div className="crm-hero-name">{c.name}</div>
          {(c.title || c.company) && <div className="caption">{[c.title, c.company].filter(Boolean).join(' at ')}</div>}
        </div>
      </div>
      <div className="chips crm-status-chips">
        {CONTACT_STATUSES.map((s) => (
          <button key={s} className={`chip status-${s}${c.status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="crm-details">
        {c.emails.map((e) => (
          <CopyRow key={e} label="Email" value={e} />
        ))}
        {c.phones.map((p) => (
          <CopyRow key={p} label="Phone" value={p} />
        ))}
        {c.website && <CopyRow label="Website" value={c.website} />}
        {c.address && <CopyRow label="Address" value={c.address} />}
        {c.birthday && <CopyRow label="Birthday" value={c.birthday} />}
        {Object.entries(c.fields).map(([k, v]) => (
          <CopyRow key={k} label={k} value={v} />
        ))}
        {c.tags.length > 0 && (
          <div className="crm-tags">
            {c.tags.map((t) => (
              <span key={t} className="crm-tag">
                {t}
              </span>
            ))}
          </div>
        )}
        {c.about && <div className="crm-about">{c.about}</div>}
      </div>

      <Section
        title={open.length ? `Follow-ups · ${open.length}` : 'Follow-ups'}
        action={
          <button className="plain crm-add" onClick={() => nav.go({ kind: 'editTask', contactId: c.id, contactName: c.name })}>
            + Add
          </button>
        }
      >
        {open.length === 0 && <div className="caption crm-empty-line">Nothing to do for {c.name.split(' ')[0]}.</div>}
        {open.map((t) => (
          <TaskRow key={t.id} task={t} showContact={false} onOpen={() => nav.go({ kind: 'editTask', id: t.id, task: t })} />
        ))}
        {done.slice(0, 3).map((t) => (
          <TaskRow key={t.id} task={t} showContact={false} />
        ))}
      </Section>

      <Section
        title="Deals"
        action={
          <button className="plain crm-add" onClick={() => nav.go({ kind: 'editDeal', contactId: c.id, contactName: c.name })}>
            + Add
          </button>
        }
      >
        {data.deals.length === 0 && <div className="caption crm-empty-line">No deals yet.</div>}
        {data.deals.map((d) => (
          <button key={d.id} className="crm-deal-card plain" onClick={() => nav.go({ kind: 'deal', id: d.id })}>
            <span className="crm-deal-title ellipsis">{d.title}</span>
            <StagePill stage={d.stage} />
            {d.value != null && <span className="crm-money">{money(d.value, d.currency ?? currency)}</span>}
          </button>
        ))}
      </Section>

      <Section title="Timeline">
        <LogComposer contactId={c.id} onTyping={onTyping} />
        <Timeline activities={data.activities} onDeleted={nav.deleted} />
      </Section>
    </div>
  )
}

/** A contact's details as the form edits them. Pure. */
export function formOf(p: Pick<ContactPage, 'contact'>): ContactForm {
  const c = p.contact
  return {
    name: c.name,
    company: c.company ?? '',
    title: c.title ?? '',
    emails: c.emails,
    phones: c.phones,
    tags: c.tags,
    status: c.status ?? '',
    address: c.address ?? '',
    website: c.website ?? '',
    birthday: c.birthday ?? '',
    about: c.about ?? '',
  }
}

const list = (v: string) =>
  v
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Add someone, or change their details. */
export function ContactFormView({ id, nav, onTyping }: { id?: string; nav: CrmNav; onTyping: (on: boolean) => void }) {
  const { data } = useLoad<ContactPage | null>(() => (id ? window.island.crm.contact(id) : Promise.resolve(null)), [id])
  if (id && !data) return <Spinner />
  return <ContactFormInner key={id ?? 'new'} id={id} initial={data ? formOf(data) : null} nav={nav} onTyping={onTyping} />
}

function ContactFormInner({ id, initial, nav, onTyping }: { id?: string; initial: ContactForm | null; nav: CrmNav; onTyping: (on: boolean) => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    company: initial?.company ?? '',
    title: initial?.title ?? '',
    emails: (initial?.emails ?? []).join(', '),
    phones: (initial?.phones ?? []).join(', '),
    tags: (initial?.tags ?? []).join(', '),
    status: (initial?.status ?? '') as '' | ContactStatus,
    website: initial?.website ?? '',
    address: initial?.address ?? '',
    birthday: initial?.birthday ?? '',
    about: initial?.about ?? '',
  })
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    try {
      const c = await window.island.crm.saveContact(id ?? null, { ...f, emails: list(f.emails), phones: list(f.phones), tags: list(f.tags) })
      nav.replace({ kind: 'contact', id: c.id })
    } catch (e) {
      setErr(errorText(e))
    }
  }
  return (
    <div className="crm-form" onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && void save()}>
      <Field label="Name" placeholder="Full name" value={f.name} onChange={set('name')} onTyping={onTyping} autoFocus={!id} />
      <div className="crm-form-row">
        <Field label="Company" placeholder="Company" value={f.company} onChange={set('company')} onTyping={onTyping} />
        <Field label="Job title" placeholder="Job title" value={f.title} onChange={set('title')} onTyping={onTyping} />
      </div>
      <Field label="Emails" placeholder="Email (several: separate with commas)" value={f.emails} onChange={set('emails')} onTyping={onTyping} />
      <Field label="Phones" placeholder="Phone" value={f.phones} onChange={set('phones')} onTyping={onTyping} />
      <div className="chips crm-status-chips">
        {CONTACT_STATUSES.map((s) => (
          <button key={s} className={`chip status-${s}${f.status === s ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, status: x.status === s ? '' : s }))}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <Field label="Tags" placeholder="Tags, like vip, expo" value={f.tags} onChange={set('tags')} onTyping={onTyping} />
      <div className="crm-form-row">
        <Field label="Website" placeholder="Website" value={f.website} onChange={set('website')} onTyping={onTyping} />
        <Field label="Birthday" placeholder="Birthday (1990-04-23)" value={f.birthday} onChange={set('birthday')} onTyping={onTyping} />
      </div>
      <Field label="Address" placeholder="Address" value={f.address} onChange={set('address')} onTyping={onTyping} />
      <Field label="About" placeholder="Notes about them" value={f.about} onChange={set('about')} onTyping={onTyping} multiline />
      {err && <div className="status error">{err}</div>}
      <div className="crm-form-actions">
        {id &&
          (confirm ? (
            <button className="pill small danger" onClick={() => void window.island.crm.remove('contact', id).then((b) => (nav.deleted(b, f.name), nav.home()))}>
              Delete {f.name.split(' ')[0]}
            </button>
          ) : (
            <button className="icon-btn" title="Delete contact" aria-label="Delete contact" onClick={() => setConfirm(true)}>
              <TrashIcon />
            </button>
          ))}
        <span className="spacer" />
        <button className="pill small" onClick={() => nav.back()}>
          Cancel
        </button>
        <button className="pill small primary" disabled={!f.name.trim()} onClick={() => void save()}>
          {id ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
