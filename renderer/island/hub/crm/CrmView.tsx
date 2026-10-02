import { useEffect, useState } from 'react'
import type { ClaudeView } from '@shared/claude'
import { KIND_LABEL, STAGE_LABEL, money, type ContactPage, type CrmChanges, type CrmDealPage, type CrmOverview, type TaskSummary } from '@shared/crm'
import { BackButton, errorText, useLoad } from '../common'
import { AskBar, type AskIdea } from '../AskBar'
import { Character, useCharacter } from '../../character/Character'
import { ComposeIcon, PlusIcon, XIcon } from '../../icons'
import { ContactFormView, ContactPageView, PeopleList } from './People'
import { DealFormView, DealPageView, DealsList } from './Deals'
import { TaskFormView, TasksList } from './Tasks'
import { Field } from './parts'

export type CrmScreen =
  | { kind: 'people' }
  | { kind: 'deals' }
  | { kind: 'tasks' }
  | { kind: 'contact'; id: string }
  | { kind: 'editContact'; id?: string }
  | { kind: 'deal'; id: string }
  | { kind: 'editDeal'; id?: string; contactId?: string; contactName?: string }
  | { kind: 'editTask'; id?: string; task?: TaskSummary; contactId?: string; contactName?: string; dealId?: string }

/** How the CRM's screens move around and report back. */
export type CrmNav = {
  go: (s: CrmScreen) => void
  back: () => void
  /** Swap this screen for another (a saved form shows what it saved). */
  replace: (s: CrmScreen) => void
  /** Back to the list. */
  home: () => void
  /** Something was deleted: offer to undo it. */
  deleted: (batch: string, what: string) => void
  importContacts: () => void
}

type Tab = 'people' | 'deals' | 'tasks'
const TABS: { id: Tab; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'deals', label: 'Deals' },
  { id: 'tasks', label: 'Follow-ups' },
]

const savedTab = (): Tab => {
  try {
    const t = localStorage.getItem('crm-tab') as Tab | null
    return t && TABS.some((x) => x.id === t) ? t : 'people'
  } catch {
    return 'people'
  }
}

/** What the agent should know about the screen you're on. */
function contactContext(p: ContactPage, code: boolean): string {
  const c = p.contact
  if (!code) return `(CRM contact: ${c.name}, id ${c.id})`
  // Claude Code can't reach the CRM: tell it what's there.
  const lines = [
    `About ${c.name}${c.title || c.company ? ` (${[c.title, c.company].filter(Boolean).join(' at ')})` : ''}, from my CRM:`,
    c.emails.length ? `Email: ${c.emails.join(', ')}` : '',
    c.phones.length ? `Phone: ${c.phones.join(', ')}` : '',
    c.about ? `Notes: ${c.about}` : '',
    ...p.tasks.filter((t) => !t.done).map((t) => `Open follow-up: ${t.title}${t.due ? ` (due ${t.due})` : ''}`),
    ...p.activities.slice(0, 8).map((a) => `${new Date(a.at).toISOString().slice(0, 10)} ${KIND_LABEL[a.kind]}: ${a.text}`),
  ]
  return `(${lines.filter(Boolean).join('\n')})`
}

function dealContext(p: CrmDealPage, code: boolean, currency: string): string {
  const d = p.deal
  if (!code) return `(CRM deal: ${d.title}, id ${d.id})`
  const lines = [
    `The deal “${d.title}” from my CRM: ${STAGE_LABEL[d.stage]}${d.value != null ? `, ${money(d.value, d.currency ?? currency)}` : ''}${d.contactName ? `, with ${d.contactName}` : ''}${d.expectedClose ? `, expected to close ${d.expectedClose}` : ''}.`,
    d.notes ? `Notes: ${d.notes}` : '',
    ...p.activities.slice(0, 8).map((a) => `${new Date(a.at).toISOString().slice(0, 10)} ${KIND_LABEL[a.kind]}: ${a.text}`),
  ]
  return `(${lines.filter(Boolean).join('\n')})`
}

/**
 * The CRM tab: people, deals and follow-ups, all usable without AI; the
 * agent can be asked about whatever is on screen, and its changes undone.
 */
export function CrmView({ claude, onTyping }: { claude: ClaudeView | null; onTyping: (on: boolean) => void }) {
  const { name } = useCharacter()
  const [stack, setStack] = useState<CrmScreen[]>(() => [{ kind: savedTab() }])
  const screen = stack[stack.length - 1]
  const [toast, setToast] = useState<{ text: string; batch?: string; error?: boolean; show?: string } | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const { data: overview, reload } = useLoad<CrmOverview>(
    () => window.island.crm.overview(),
    [],
    (r) => window.island.crm.onChanged(() => r()),
    'crm-overview',
  )
  const currency = overview?.currency ?? 'USD'

  // A new set of changes by the agent shows its undo bar again.
  const [agent, setAgent] = useState<CrmChanges | null>(null)
  useEffect(() => window.island.crm.onChanged((c) => c && setAgent(c)), [])
  const changes = agent ?? overview?.lastAgentChanges ?? null
  const showUndo = changes && !changes.undone && changes.id !== dismissed

  const tab: Tab | null = screen.kind === 'people' || screen.kind === 'deals' || screen.kind === 'tasks' ? screen.kind : null
  const nav: CrmNav = {
    go: (s) => (setStack((x) => [...x, s]), setMenu(false)),
    back: () => setStack((x) => (x.length > 1 ? x.slice(0, -1) : x)),
    replace: (s) => setStack((x) => [...x.slice(0, -1), s]),
    home: () => setStack((x) => [x[0]]),
    deleted: (batch, what) => setToast({ text: `Deleted ${what}.`, batch }),
    importContacts: () => void importContacts(),
  }
  const switchTab = (t: Tab) => {
    setStack([{ kind: t }])
    try {
      localStorage.setItem('crm-tab', t)
    } catch {
      // storage unavailable
    }
  }
  const importContacts = async () => {
    setMenu(false)
    onTyping(true) // the file chooser takes the pointer: keep the panel open
    try {
      const r = await window.island.crm.importFile()
      if (r)
        setToast({
          text: `Imported ${r.file}: ${r.added} added${r.updated ? `, ${r.updated} filled in` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}.`,
          batch: r.added || r.updated ? r.batch : undefined,
        })
    } catch (e) {
      setToast({ text: errorText(e), error: true })
    } finally {
      onTyping(false)
    }
  }
  const exportCsv = async (what: 'contacts' | 'deals' | 'tasks') => {
    setMenu(false)
    try {
      const f = await window.island.crm.exportCsv(what)
      setToast({ text: `Saved “${f.name}” in Documents.`, show: f.id })
    } catch (e) {
      setToast({ text: errorText(e), error: true })
    }
  }
  const undo = async (batch?: string) => {
    try {
      const r = await window.island.crm.undo(batch)
      setToast({ text: r.kept ? `Undone, except ${r.kept} thing${r.kept === 1 ? '' : 's'} you changed since.` : 'Undone.' })
      reload()
    } catch (e) {
      setToast({ text: errorText(e), error: true })
    }
  }

  // What to offer the agent about this screen.
  const contactId = screen.kind === 'contact' ? screen.id : ''
  const dealId = screen.kind === 'deal' ? screen.id : ''
  const { data: contactPage } = useLoad<ContactPage | null>(() => (contactId ? window.island.crm.contact(contactId) : Promise.resolve(null)), [contactId], (r) =>
    window.island.crm.onChanged(() => r()),
  )
  const { data: dealPage } = useLoad<CrmDealPage | null>(() => (dealId ? window.island.crm.deal(dealId) : Promise.resolve(null)), [dealId], (r) =>
    window.island.crm.onChanged(() => r()),
  )
  const first = contactPage?.contact.name.split(' ')[0] ?? ''
  const ask: { ideas: AskIdea[]; compose: (t: string, code: boolean) => string; placeholder: (who: string) => string } | null =
    screen.kind === 'contact' && contactPage
      ? {
          ideas: [
            { name: `Summarize ${first}`, instruction: 'Summarize my history with this person: who they are, what we discussed, and what’s open.' },
            { name: `Draft a follow-up to ${first}`, instruction: 'Draft a short, friendly follow-up message to this person based on our last conversation.' },
            { name: 'What’s next?', instruction: 'What should my next step with this person be? Add it as a follow-up if it makes sense.' },
          ],
          compose: (t, code) => `${t}\n\n${contactContext(contactPage, code)}`,
          placeholder: (who) => `Ask ${who} about ${first}…`,
        }
      : screen.kind === 'deal' && dealPage
        ? {
            ideas: [
              { name: 'Next step', instruction: 'What’s the next step to move this deal forward? Add a follow-up for it.' },
              { name: 'Summarize this deal', instruction: 'Summarize this deal: where it stands, what happened, and the risks.' },
            ],
            compose: (t, code) => `${t}\n\n${dealContext(dealPage, code, currency)}`,
            placeholder: (who) => `Ask ${who} about this deal…`,
          }
        : tab
          ? {
              ideas:
                tab === 'people'
                  ? [
                      { name: 'Who should I follow up with?', instruction: 'Who should I follow up with this week, and why?' },
                      { name: 'Who haven’t I talked to?', instruction: 'Which customers and leads haven’t I talked to in over a month?' },
                    ]
                  : tab === 'deals'
                    ? [
                        { name: 'Summarize my pipeline', instruction: 'Summarize my sales pipeline: totals by stage, what’s likely to close soon, and what’s stuck.' },
                        { name: 'Which deals are stuck?', instruction: 'Which open deals haven’t moved or had any activity in the last two weeks?' },
                      ]
                    : [
                        { name: 'What should I do today?', instruction: 'What should I focus on today? Look at my due and overdue follow-ups and open deals.' },
                        { name: 'Plan my week', instruction: 'Plan my follow-ups for this week and give each open one a sensible due date.' },
                      ],
              compose: (t) => t,
              placeholder: (who) => `Ask ${who} about your ${tab === 'tasks' ? 'follow-ups' : tab}…`,
            }
          : null

  const title =
    screen.kind === 'contact'
      ? contactPage?.contact.name ?? ''
      : screen.kind === 'deal'
        ? 'Deal'
        : screen.kind === 'editContact'
          ? screen.id
            ? 'Edit Contact'
            : 'New Contact'
          : screen.kind === 'editDeal'
            ? screen.id
              ? 'Edit Deal'
              : 'New Deal'
            : screen.kind === 'editTask'
              ? screen.id
                ? 'Follow-up'
                : 'New Follow-up'
              : ''
  const prev = stack[stack.length - 2]
  const backLabel = !prev ? '' : prev.kind === 'people' ? 'People' : prev.kind === 'deals' ? 'Deals' : prev.kind === 'tasks' ? 'Follow-ups' : 'Back'

  return (
    <div className="view crm-view">
      {tab ? (
        <>
          <div className="section-head crm-head">
            <span className="large-title">CRM</span>
            <span className="spacer" />
            <button className="icon-btn" title="Import, export, currency" aria-label="More" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <span className="crm-more">•••</span>
            </button>
            <button
              className="icon-btn"
              title={tab === 'people' ? 'Add a contact' : tab === 'deals' ? 'Add a deal' : 'Add a follow-up'}
              aria-label={tab === 'people' ? 'Add contact' : tab === 'deals' ? 'Add deal' : 'Add follow-up'}
              onClick={() => nav.go(tab === 'people' ? { kind: 'editContact' } : tab === 'deals' ? { kind: 'editDeal' } : { kind: 'editTask' })}
            >
              <PlusIcon />
            </button>
          </div>
          {menu && <CrmMenu currency={currency} onImport={importContacts} onExport={exportCsv} onTyping={onTyping} close={() => setMenu(false)} />}
          <div className="crm-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => switchTab(t.id)}>
                {t.label}
                {t.id === 'tasks' && !!overview?.counts.dueTasks && <span className="crm-due-badge">{overview.counts.dueTasks}</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="view-head crm-subhead">
          <BackButton onClick={nav.back} label={backLabel} />
          <span className="view-title ellipsis">{title}</span>
          {screen.kind === 'contact' || screen.kind === 'deal' ? (
            <button
              className="icon-btn"
              title="Edit"
              aria-label="Edit"
              onClick={() => nav.go(screen.kind === 'contact' ? { kind: 'editContact', id: screen.id } : { kind: 'editDeal', id: screen.id })}
            >
              <ComposeIcon />
            </button>
          ) : (
            <span style={{ width: 60 }} />
          )}
        </div>
      )}

      {showUndo && (
        <div className="crm-undo" role="status">
          <Character mood="done" size={22} />
          <div className="crm-undo-text">
            <b>
              {name} made {changes.summary.length} change{changes.summary.length === 1 ? '' : 's'}
            </b>
            <span className="caption ellipsis" title={changes.summary.join('\n')}>
              {changes.summary.slice(0, 2).join(' · ')}
              {changes.summary.length > 2 ? ` +${changes.summary.length - 2}` : ''}
            </span>
          </div>
          <button className="pill small" onClick={() => void undo(changes.id)}>
            Undo
          </button>
          <button className="close-btn" aria-label="Dismiss" onClick={() => setDismissed(changes.id)}>
            <XIcon />
          </button>
        </div>
      )}

      <div className={`crm-body${tab ? '' : ' deep'}`}>
        {screen.kind === 'people' && <PeopleList nav={nav} onTyping={onTyping} />}
        {screen.kind === 'deals' && <DealsList nav={nav} currency={currency} />}
        {screen.kind === 'tasks' && <TasksList nav={nav} />}
        {screen.kind === 'contact' && <ContactPageView key={screen.id} id={screen.id} nav={nav} onTyping={onTyping} currency={currency} />}
        {screen.kind === 'editContact' && <ContactFormView id={screen.id} nav={nav} onTyping={onTyping} />}
        {screen.kind === 'deal' && <DealPageView key={screen.id} id={screen.id} nav={nav} onTyping={onTyping} currency={currency} />}
        {screen.kind === 'editDeal' && (
          <DealFormView id={screen.id} contact={screen.contactId ? { id: screen.contactId, name: screen.contactName ?? '' } : undefined} nav={nav} onTyping={onTyping} currency={currency} />
        )}
        {screen.kind === 'editTask' && (
          <TaskFormView
            task={screen.task}
            contact={screen.contactId ? { id: screen.contactId, name: screen.contactName ?? '' } : undefined}
            dealId={screen.dealId}
            nav={nav}
            onTyping={onTyping}
          />
        )}
      </div>

      {toast && (
        <div className={`docs-result crm-toast${toast.error ? ' error' : ''}`} role="status">
          <span className="docs-result-text">{toast.text}</span>
          {toast.batch && (
            <button className="chip" onClick={() => (void undo(toast.batch), setToast(null))}>
              Undo
            </button>
          )}
          {toast.show && (
            <button className="chip" onClick={() => void window.island.docs.show(toast.show!).catch(() => {})}>
              Show
            </button>
          )}
          <button className="close-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
            <XIcon />
          </button>
        </div>
      )}

      {ask && (
        <AskBar
          className="crm-ask"
          claude={claude}
          onTyping={onTyping}
          label="about your CRM"
          placeholder={ask.placeholder}
          setupHint={(n) => `Set up an AI in Settings to let ${n} run the CRM for you: log calls, add follow-ups, move deals. Everything here works without it.`}
          ideas={ask.ideas}
          compose={ask.compose}
          onAsk={() => setToast(null)}
        />
      )}
    </div>
  )
}

/** Import, export and the currency, behind the ••• button. */
function CrmMenu({
  currency,
  onImport,
  onExport,
  onTyping,
  close,
}: {
  currency: string
  onImport: () => void
  onExport: (what: 'contacts' | 'deals' | 'tasks') => void
  onTyping: (on: boolean) => void
  close: () => void
}) {
  const [cur, setCur] = useState(currency)
  const [err, setErr] = useState<string | null>(null)
  const saveCurrency = async () => {
    try {
      await window.island.crm.setCurrency(cur)
      setErr(null)
      close()
    } catch (e) {
      setErr(errorText(e))
    }
  }
  return (
    <div className="crm-menu" role="menu">
      <button className="crm-menu-item plain" role="menuitem" onClick={onImport}>
        Import contacts… <span className="caption">CSV, Excel, vCard</span>
      </button>
      <button className="crm-menu-item plain" role="menuitem" onClick={() => onExport('contacts')}>
        Export contacts <span className="caption">CSV, to Documents</span>
      </button>
      <button className="crm-menu-item plain" role="menuitem" onClick={() => onExport('deals')}>
        Export deals
      </button>
      <button className="crm-menu-item plain" role="menuitem" onClick={() => onExport('tasks')}>
        Export follow-ups
      </button>
      <div className="crm-menu-item crm-currency-row">
        <span>Currency</span>
        <Field label="Currency" value={cur} onChange={(v) => setCur(v.toUpperCase().slice(0, 3))} onTyping={onTyping} className="crm-currency" onEnter={() => void saveCurrency()} />
        {cur !== currency && (
          <button className="pill small primary" onClick={() => void saveCurrency()}>
            Set
          </button>
        )}
      </div>
      {err && <div className="status error">{err}</div>}
    </div>
  )
}
