import { useState } from 'react'
import { DEAL_STAGES, OPEN_STAGES, STAGE_LABEL, money, type CrmDealPage, type DealStage, type DealSummary } from '@shared/crm'
import { Empty, Spinner, errorText, useLoad } from '../common'
import { TrashIcon } from '../../icons'
import { ContactPicker, Field, LogComposer, Section, StagePill, TaskRow, Timeline } from './parts'
import type { CrmNav } from './CrmView'

type Filter = 'open' | DealStage

/** Total value of some deals, per currency ("$12,500 + €900"). Pure. */
export function totalOf(deals: DealSummary[], currency: string): string {
  const sums = new Map<string, number>()
  for (const d of deals) if (d.value != null) sums.set(d.currency ?? currency, (sums.get(d.currency ?? currency) ?? 0) + d.value)
  return [...sums].map(([c, v]) => money(v, c)).join(' + ')
}

/** The pipeline: open deals by stage, or one stage at a time. */
export function DealsList({ nav, currency }: { nav: CrmNav; currency: string }) {
  const [filter, setFilter] = useState<Filter>('open')
  const { data, error, loading } = useLoad<DealSummary[]>(
    () => window.island.crm.deals(),
    [],
    (r) => window.island.crm.onChanged(() => r()),
    'crm-deals',
  )
  const all = data ?? []
  const shown = all.filter((d) => (filter === 'open' ? OPEN_STAGES.includes(d.stage) : d.stage === filter))
  const open = all.filter((d) => OPEN_STAGES.includes(d.stage))
  return (
    <>
      {all.length > 0 && (
        <div className="crm-pipeline">
          <span className="crm-pipeline-total">{totalOf(open, currency) || money(0, currency)}</span>
          <span className="caption">
            in {open.length} open deal{open.length === 1 ? '' : 's'}
          </span>
        </div>
      )}
      {all.length > 0 && (
        <div className="chips crm-filters">
          {(['open', ...DEAL_STAGES] as Filter[]).map((f) => {
            const n = f === 'open' ? open.length : all.filter((d) => d.stage === f).length
            return (
              <button key={f} className={`chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'open' ? 'Open' : STAGE_LABEL[f]}
                {n > 0 && <span className="chip-count">{n}</span>}
              </button>
            )
          })}
        </div>
      )}
      <div className="list crm-list">
        {!data && loading && <Spinner />}
        {error && !data && <Empty title="Couldn't load your deals" body={error} />}
        {data && !all.length && (
          <Empty
            title="No deals yet"
            body="Track what you're selling: who it's for, what it's worth and how far along it is."
            action={
              <button className="pill primary" onClick={() => nav.go({ kind: 'editDeal' })}>
                Add Deal
              </button>
            }
          />
        )}
        {data && all.length > 0 && !shown.length && <Empty title={`Nothing ${filter === 'open' ? 'open' : `in ${STAGE_LABEL[filter]}`}`} />}
        {shown.map((d) => (
          <button key={d.id} className="list-row crm-deal-row" data-deal={d.title} onClick={() => nav.go({ kind: 'deal', id: d.id })}>
            <div className="list-main">
              <div className="list-top">
                <span className="title ellipsis">{d.title}</span>
                <span className="crm-money">{money(d.value, d.currency ?? currency)}</span>
              </div>
              <div className="crm-person-sub">
                <span className="caption ellipsis">{[d.contactName, d.company !== d.contactName ? d.company : '', d.expectedClose ? `close by ${d.expectedClose}` : ''].filter(Boolean).join(' · ')}</span>
                <StagePill stage={d.stage} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

/** One deal: move it along, see what happened, plan what's next. */
export function DealPageView({ id, nav, onTyping, currency }: { id: string; nav: CrmNav; onTyping: (on: boolean) => void; currency: string }) {
  const { data, error } = useLoad<CrmDealPage>(
    () => window.island.crm.deal(id),
    [id],
    (r) => window.island.crm.onChanged(() => r()),
  )
  if (error && !data) return <Empty title="This deal was deleted" body={error} />
  if (!data) return <Spinner />
  const d = data.deal
  const open = data.tasks.filter((t) => !t.done)
  return (
    <div className="crm-page" data-page={d.title}>
      <div className="crm-deal-hero">
        <div className="crm-hero-name">{d.title}</div>
        <div className="crm-deal-value">{d.value != null ? money(d.value, d.currency ?? currency) : 'No value yet'}</div>
        <div className="caption">
          {d.contactName ? (
            <button className="plain crm-link" onClick={() => nav.go({ kind: 'contact', id: d.contactId! })}>
              {d.contactName}
            </button>
          ) : (
            d.company || 'No contact'
          )}
          {d.expectedClose ? ` · close by ${d.expectedClose}` : ''}
        </div>
      </div>
      <div className="chips crm-stages" role="radiogroup" aria-label="Stage">
        {DEAL_STAGES.map((s) => (
          <button key={s} role="radio" aria-checked={d.stage === s} className={`chip stage-${s}${d.stage === s ? ' on' : ''}`} onClick={() => void window.island.crm.saveDeal(d.id, { stage: s })}>
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
      {d.notes && <div className="crm-about">{d.notes}</div>}
      <Section
        title={open.length ? `Follow-ups · ${open.length}` : 'Follow-ups'}
        action={
          <button className="plain crm-add" onClick={() => nav.go({ kind: 'editTask', dealId: d.id, contactId: d.contactId, contactName: d.contactName })}>
            + Add
          </button>
        }
      >
        {open.length === 0 && <div className="caption crm-empty-line">No next step planned.</div>}
        {open.map((t) => (
          <TaskRow key={t.id} task={t} onOpen={() => nav.go({ kind: 'editTask', id: t.id, task: t })} />
        ))}
      </Section>
      <Section title="Timeline">
        <LogComposer dealId={d.id} contactId={d.contactId} onTyping={onTyping} />
        <Timeline activities={data.activities} onDeleted={nav.deleted} />
      </Section>
    </div>
  )
}

/** Add a deal, or change one. */
export function DealFormView({
  id,
  contact,
  nav,
  onTyping,
  currency,
}: {
  id?: string
  contact?: { id: string; name: string }
  nav: CrmNav
  onTyping: (on: boolean) => void
  currency: string
}) {
  const { data } = useLoad<CrmDealPage | null>(() => (id ? window.island.crm.deal(id) : Promise.resolve(null)), [id])
  if (id && !data) return <Spinner />
  return <DealFormInner key={id ?? 'new'} id={id} page={data} contact={contact} nav={nav} onTyping={onTyping} currency={currency} />
}

function DealFormInner({
  id,
  page,
  contact,
  nav,
  onTyping,
  currency,
}: {
  id?: string
  page: CrmDealPage | null
  contact?: { id: string; name: string }
  nav: CrmNav
  onTyping: (on: boolean) => void
  currency: string
}) {
  const d = page?.deal
  const [title, setTitle] = useState(d?.title ?? '')
  const [value, setValue] = useState(d?.value != null ? String(d.value) : '')
  const [cur, setCur] = useState(d?.currency ?? currency)
  const [stage, setStage] = useState<DealStage>(d?.stage ?? 'new')
  const [close, setClose] = useState(d?.expectedClose ?? '')
  const [notes, setNotes] = useState(d?.notes ?? '')
  const [who, setWho] = useState<{ id: string; name: string } | null>(d?.contactId ? { id: d.contactId, name: d.contactName ?? '' } : contact ?? null)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const save = async () => {
    const v = value.trim() ? Number(value.replace(/[^\d.]/g, '')) : null
    if (v !== null && !Number.isFinite(v)) return setErr('The value must be a number.')
    try {
      const saved = await window.island.crm.saveDeal(id ?? null, {
        title,
        value: v,
        currency: cur.trim().toUpperCase() || undefined,
        stage,
        expectedClose: close || null,
        notes,
        contactId: who?.id ?? null,
      })
      nav.replace({ kind: 'deal', id: saved.id })
    } catch (e) {
      setErr(errorText(e))
    }
  }
  return (
    <div className="crm-form">
      <Field label="Deal" placeholder="What is it, like “Website redesign”" value={title} onChange={setTitle} onTyping={onTyping} autoFocus={!id} />
      <ContactPicker value={who} onChange={setWho} onTyping={onTyping} />
      <div className="crm-form-row">
        <Field label="Value" placeholder="Value" value={value} onChange={setValue} onTyping={onTyping} />
        <Field label="Currency" placeholder="USD" value={cur} onChange={(v) => setCur(v.slice(0, 3))} onTyping={onTyping} className="crm-currency" />
      </div>
      <div className="chips crm-stages">
        {DEAL_STAGES.map((s) => (
          <button key={s} className={`chip stage-${s}${stage === s ? ' on' : ''}`} onClick={() => setStage(s)}>
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
      <label className="crm-label">
        <span className="caption">Expected to close</span>
        <Field type="date" label="Expected close" value={close} onChange={setClose} onTyping={onTyping} />
      </label>
      <Field label="Notes" placeholder="Notes" value={notes} onChange={setNotes} onTyping={onTyping} multiline />
      {err && <div className="status error">{err}</div>}
      <div className="crm-form-actions">
        {id &&
          (confirm ? (
            <button className="pill small danger" onClick={() => void window.island.crm.remove('deal', id).then((b) => (nav.deleted(b, `“${title}”`), nav.home()))}>
              Delete Deal
            </button>
          ) : (
            <button className="icon-btn" title="Delete deal" aria-label="Delete deal" onClick={() => setConfirm(true)}>
              <TrashIcon />
            </button>
          ))}
        <span className="spacer" />
        <button className="pill small" onClick={() => nav.back()}>
          Cancel
        </button>
        <button className="pill small primary" disabled={!title.trim()} onClick={() => void save()}>
          {id ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
