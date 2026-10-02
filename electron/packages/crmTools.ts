import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { STAGE_LABEL, STATUS_LABEL, KIND_LABEL, money, type Activity, type Contact, type Deal, type TaskSummary } from '@shared/crm'
import type { DocEntry } from '@shared/docs'
import { schema, str, strList, type AgentTool, type ScalarProp } from '../agent/tools'
import type { CrmStore, ContactInput, TaskFilter } from '../crm/store'
import { contactsCsv, contactsFromFile, dealsCsv, importContacts, tasksCsv } from '../crm/io'
import { xlsxRows, toCsv } from '../docs/sheet'

/** What the CRM tools reach. */
export type CrmContext = {
  store: CrmStore
  /** This answer's changes, so they undo in one go. */
  batch: string
  /** Files: where imports come from and exports go (the Documents workspace). */
  files: {
    /** A document by id, name or path (CSV or Excel). */
    resolve: (ref: string) => Promise<Pick<DocEntry, 'path' | 'name' | 'kind'>>
    /** A path in the home folder for other files (like .vcf), or null. */
    homeFile: (ref: string) => string | null
    save: (bytes: Uint8Array, name: string, ext: string) => Promise<DocEntry>
    outLabel: () => string
  }
  now?: () => Date
}

const contactParam: ScalarProp = { type: 'string', description: 'The contact: their id from crm_find (like "c12"), name or email.' }
const dealParam: ScalarProp = { type: 'string', description: 'The deal: its id (like "deal3") or name.' }
const fieldsParam = {
  type: 'array' as const,
  description: 'Extra details, like LinkedIn or account number. An empty value removes one.',
  items: { type: 'object' as const, properties: { name: { type: 'string' as const }, value: { type: 'string' as const } }, required: ['name', 'value'], additionalProperties: false as const },
}

/** "2026-10-02 14:05" in local time. Pure. */
const when = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** A time the model gave ("2026-10-02" or "2026-10-02T15:30"), as epoch ms. */
function parseWhen(v: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(v.trim())
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0).getTime() : NaN
  if (!Number.isFinite(t)) throw new Error('“when” must look like 2026-10-02 or 2026-10-02T15:30.')
  return t
}

const fieldsOf = (v: unknown): Record<string, string> | undefined =>
  Array.isArray(v) ? Object.fromEntries(v.map((f: any) => [str(f?.name), str(f?.value)]).filter(([k]) => k)) : undefined

/** One line about a contact. */
function contactLine(c: Pick<Contact, 'id' | 'name' | 'company' | 'title' | 'status' | 'tags'> & { email?: string; phone?: string; lastTouch?: number; openTasks?: number; openDeals?: number }): string {
  const job = [c.title, c.company].filter(Boolean).join(' at ')
  return [
    `${c.id} · ${c.name}`,
    job,
    c.status ? STATUS_LABEL[c.status] : '',
    c.email ?? '',
    c.phone ?? '',
    c.tags.length ? `tags: ${c.tags.join(', ')}` : '',
    c.lastTouch ? `last contact ${when(c.lastTouch).slice(0, 10)}` : '',
    c.openTasks ? `${c.openTasks} open follow-up${c.openTasks === 1 ? '' : 's'}` : '',
    c.openDeals ? `${c.openDeals} open deal${c.openDeals === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function dealLine(d: Deal & { contactName?: string }, currency: string): string {
  return [`${d.id} · ${d.title}`, STAGE_LABEL[d.stage], money(d.value, d.currency ?? currency), d.contactName ?? '', d.company ?? '', d.expectedClose ? `close by ${d.expectedClose}` : '']
    .filter(Boolean)
    .join(' · ')
}

function taskLine(t: TaskSummary): string {
  return [`${t.id} · ${t.done ? '[done] ' : ''}${t.title}`, t.due ? `due ${t.due.replace('T', ' ')}` : 'no due date', t.contactName ?? '', t.dealTitle ? `deal: ${t.dealTitle}` : ''].filter(Boolean).join(' · ')
}

const activityLine = (a: Activity) => `${when(a.at)} · ${KIND_LABEL[a.kind]}: ${a.text.replace(/\s+/g, ' ').slice(0, 600)}`

export function crmTools(ctx: CrmContext): AgentTool[] {
  const { store } = ctx
  const b = ctx.batch
  const contactInput = (i: Record<string, unknown>): ContactInput => ({
    company: typeof i.company === 'string' ? i.company : undefined,
    title: typeof i.title === 'string' ? i.title : undefined,
    status: typeof i.status === 'string' ? i.status : undefined,
    address: typeof i.address === 'string' ? i.address : undefined,
    website: typeof i.website === 'string' ? i.website : undefined,
    birthday: typeof i.birthday === 'string' ? i.birthday : undefined,
    about: typeof i.about === 'string' ? i.about : undefined,
    fields: fieldsOf(i.fields),
  })
  const contactDetails = {
    company: { type: 'string' as const, description: 'Company or organisation.' },
    title: { type: 'string' as const, description: 'Job title.' },
    status: { type: 'string' as const, description: 'lead, customer, partner or other.' },
    address: { type: 'string' as const },
    website: { type: 'string' as const },
    birthday: { type: 'string' as const, description: 'Like 1990-04-23, or 04-23 without the year.' },
    about: { type: 'string' as const, description: 'Notes about them (not the timeline).' },
    fields: fieldsParam,
  }

  return [
    {
      name: 'crm_find',
      description:
        'Find people in the user’s CRM by name, company, email, phone, tag or any detail (all words must match), best first; with no query, the people they dealt with most recently. Can filter by status or tag.',
      input_schema: schema({
        query: { type: 'string', description: 'Words to look for; empty for the most recent.' },
        status: { type: 'string', description: 'Only lead, customer, partner or other.' },
        tag: { type: 'string', description: 'Only people with this tag.' },
      }),
      label: (i) => (str(i.query) ? `Looking for “${str(i.query)}” in your contacts` : 'Looking through your contacts'),
      run: async (i) => {
        const hits = store.search(str(i.query), { status: str(i.status) || undefined, tag: str(i.tag) || undefined, limit: 30 })
        if (!hits.length) return store.all().contacts.length ? 'Nobody matches.' : 'The CRM is empty. Add people with crm_add_contact (or crm_import).'
        return hits.map(contactLine).join('\n')
      },
    },
    {
      name: 'crm_contact',
      description: 'Everything about one person: their details, open follow-ups, deals and timeline (calls, meetings, notes), newest first.',
      input_schema: schema({ contact: contactParam }, ['contact']),
      label: (i) => `Looking at ${str(i.contact)}`,
      run: async (i) => {
        const p = store.contactPage(store.findContact(str(i.contact)).id)
        const c = p.contact
        const details = [
          contactLine({ ...c, email: undefined, phone: undefined }),
          c.emails.length ? `Emails: ${c.emails.join(', ')}` : '',
          c.phones.length ? `Phones: ${c.phones.join(', ')}` : '',
          c.address ? `Address: ${c.address}` : '',
          c.website ? `Website: ${c.website}` : '',
          c.birthday ? `Birthday: ${c.birthday}` : '',
          ...Object.entries(c.fields).map(([k, v]) => `${k}: ${v}`),
          c.about ? `About: ${c.about}` : '',
          `Added ${when(c.createdAt).slice(0, 10)}`,
        ]
        const open = p.tasks.filter((t) => !t.done)
        return [
          details.filter(Boolean).join('\n'),
          open.length ? `Open follow-ups:\n${open.map((t) => `- ${taskLine(t)}`).join('\n')}` : 'No open follow-ups.',
          p.deals.length ? `Deals:\n${p.deals.map((d) => `- ${dealLine(d, store.currency)}`).join('\n')}` : '',
          p.activities.length ? `Timeline (newest first):\n${p.activities.slice(0, 30).map((a) => `- ${activityLine(a)}`).join('\n')}` : 'Nothing logged yet.',
        ]
          .filter(Boolean)
          .join('\n\n')
      },
    },
    {
      name: 'crm_add_contact',
      description: 'Add a person to the CRM. Check with crm_find first that they aren’t there already.',
      input_schema: schema(
        {
          name: { type: 'string', description: 'Their full name.' },
          ...contactDetails,
          emails: { type: 'array', items: { type: 'string' } },
          phones: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
        ['name'],
      ),
      label: (i) => `Adding ${str(i.name)}`,
      run: async (i) => {
        const c = store.addContact(b, { ...contactInput(i), name: str(i.name), emails: strList(i.emails), phones: strList(i.phones), tags: strList(i.tags) })
        return `Added ${c.name} (${c.id}).`
      },
    },
    {
      name: 'crm_update_contact',
      description:
        'Change someone’s details. Give only what changes. "emails", "phones" and "tags" replace the whole list; use add_emails, add_phones, add_tags and remove_tags to change part of it.',
      input_schema: schema(
        {
          contact: contactParam,
          name: { type: 'string' },
          ...contactDetails,
          emails: { type: 'array', items: { type: 'string' } },
          add_emails: { type: 'array', items: { type: 'string' } },
          phones: { type: 'array', items: { type: 'string' } },
          add_phones: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          add_tags: { type: 'array', items: { type: 'string' } },
          remove_tags: { type: 'array', items: { type: 'string' } },
        },
        ['contact'],
      ),
      label: (i) => `Updating ${str(i.contact)}`,
      run: async (i) => {
        const before = store.findContact(str(i.contact))
        const after = store.updateContact(b, before.id, {
          ...contactInput(i),
          name: typeof i.name === 'string' ? i.name : undefined,
          emails: Array.isArray(i.emails) ? strList(i.emails) : undefined,
          phones: Array.isArray(i.phones) ? strList(i.phones) : undefined,
          tags: Array.isArray(i.tags) ? strList(i.tags) : undefined,
          addEmails: strList(i.add_emails),
          addPhones: strList(i.add_phones),
          addTags: strList(i.add_tags),
          removeTags: strList(i.remove_tags),
        })
        return after === before ? `Nothing to change for ${before.name}.` : `Updated ${after.name}.`
      },
    },
    {
      name: 'crm_log',
      description: 'Log something that happened on someone’s timeline: a call, meeting, email, message or a note. Use it to remember what was said or agreed.',
      input_schema: schema(
        {
          text: { type: 'string', description: 'What happened, in a sentence or two.' },
          contact: contactParam,
          deal: dealParam,
          kind: { type: 'string', description: 'note (default), call, meeting, email or message.' },
          when: { type: 'string', description: 'When it happened, like 2026-10-02 or 2026-10-02T15:30 (default: now).' },
        },
        ['text'],
      ),
      label: () => 'Logging it',
      run: async (i) => {
        if (!str(i.contact) && !str(i.deal)) throw new Error('Say whose timeline it goes on (contact or deal).')
        const contact = str(i.contact) ? store.findContact(str(i.contact)) : undefined
        const deal = str(i.deal) ? store.findDeal(str(i.deal)) : undefined
        const a = store.log(b, { text: str(i.text), kind: str(i.kind) || undefined, contact: contact?.id, deal: deal?.id, at: str(i.when) ? parseWhen(str(i.when)) : undefined })
        return `Logged (${a.id}) on ${contact?.name ?? deal?.title}’s timeline.`
      },
    },
    {
      name: 'crm_tasks',
      description: 'The user’s follow-ups: open ones (default) by due date, or only overdue, due today (and overdue), upcoming, or done. Can be for one person.',
      input_schema: schema({
        show: { type: 'string', description: 'open (default), overdue, today, upcoming or done.' },
        contact: contactParam,
      }),
      label: () => 'Checking your follow-ups',
      run: async (i) => {
        const show = (str(i.show) || 'open') as TaskFilter
        if (!['open', 'overdue', 'today', 'upcoming', 'done'].includes(show)) throw new Error('show must be open, overdue, today, upcoming or done.')
        const contact = str(i.contact) ? store.findContact(str(i.contact)) : undefined
        const list = store.tasks(show, { contact: contact?.id }).slice(0, 50)
        const now = ctx.now?.() ?? new Date()
        if (!list.length) return `No ${show === 'open' ? 'open' : show} follow-ups${contact ? ` with ${contact.name}` : ''}.`
        return `It’s ${when(now.getTime())} now.\n${list.map(taskLine).join('\n')}`
      },
    },
    {
      name: 'crm_add_task',
      description: 'Add a follow-up (a to-do), optionally for a person or deal and with a due date. The island reminds the user when it’s due.',
      input_schema: schema(
        {
          title: { type: 'string', description: 'What to do, like "Send the proposal".' },
          contact: contactParam,
          deal: dealParam,
          due: { type: 'string', description: 'Like 2026-10-05, or 2026-10-05T15:30 for a time (local).' },
        },
        ['title'],
      ),
      label: () => 'Adding a follow-up',
      run: async (i) => {
        const contact = str(i.contact) ? store.findContact(str(i.contact)) : undefined
        const deal = str(i.deal) ? store.findDeal(str(i.deal)) : undefined
        const t = store.addTask(b, { title: str(i.title), contact: contact?.id, deal: deal?.id, due: str(i.due) || undefined })
        return `Added follow-up ${t.id}: “${t.title}”${t.due ? `, due ${t.due.replace('T', ' ')}` : ''}${contact ? ` (${contact.name})` : ''}.`
      },
    },
    {
      name: 'crm_update_task',
      description: 'Tick off a follow-up (done), reopen it, rename it or change its due date (empty due removes it).',
      input_schema: schema(
        {
          task: { type: 'string', description: 'The follow-up’s id (like "t4") or words from its title.' },
          done: { type: 'boolean' },
          title: { type: 'string' },
          due: { type: 'string', description: 'New due date; empty to remove it.' },
        },
        ['task'],
      ),
      label: (i) => (i.done === true ? 'Ticking off a follow-up' : 'Changing a follow-up'),
      run: async (i) => {
        const t = store.findTask(str(i.task))
        const after = store.updateTask(b, t.id, {
          done: typeof i.done === 'boolean' ? i.done : undefined,
          title: typeof i.title === 'string' ? i.title : undefined,
          due: typeof i.due === 'string' ? i.due || null : undefined,
        })
        return after.done ? `Done: “${after.title}”.` : `Follow-up ${after.id}: “${after.title}”${after.due ? `, due ${after.due.replace('T', ' ')}` : ''}.`
      },
    },
    {
      name: 'crm_deals',
      description: 'The sales pipeline: deals with their stage, value and contact, and the total value per stage. Can be for one stage or one person.',
      input_schema: schema({ stage: { type: 'string', description: 'new, qualified, proposal, negotiation, won or lost.' }, contact: contactParam }),
      label: () => 'Checking your deals',
      run: async (i) => {
        const contact = str(i.contact) ? store.findContact(str(i.contact)) : undefined
        const list = store.deals({ stage: str(i.stage) || undefined, contact: contact?.id })
        if (!list.length) return 'No deals here.'
        const totals = new Map<string, Map<string, number>>()
        for (const d of list) {
          const cur = d.currency ?? store.currency
          const m = totals.get(d.stage) ?? new Map<string, number>()
          m.set(cur, (m.get(cur) ?? 0) + (d.value ?? 0))
          totals.set(d.stage, m)
        }
        const sums = [...totals].map(([s, m]) => `${STAGE_LABEL[s as Deal['stage']]}: ${list.filter((d) => d.stage === s).length} (${[...m].map(([c, v]) => money(v, c)).join(' + ')})`)
        return `${sums.join(' · ')}\n${list.slice(0, 60).map((d) => dealLine(d, store.currency)).join('\n')}`
      },
    },
    {
      name: 'crm_add_deal',
      description: 'Add a deal (a sale or opportunity) to the pipeline.',
      input_schema: schema(
        {
          title: { type: 'string', description: 'Like "Website redesign for Acme".' },
          contact: contactParam,
          value: { type: 'number', description: 'How much it’s worth.' },
          currency: { type: 'string', description: '3-letter code like USD or INR (default: the CRM’s).' },
          stage: { type: 'string', description: 'new (default), qualified, proposal, negotiation, won or lost.' },
          expected_close: { type: 'string', description: 'Like 2026-11-30.' },
          notes: { type: 'string' },
        },
        ['title'],
      ),
      label: (i) => `Adding deal “${str(i.title)}”`,
      run: async (i) => {
        const contact = str(i.contact) ? store.findContact(str(i.contact)) : undefined
        const d = store.addDeal(b, {
          title: str(i.title),
          contact: contact?.id,
          value: typeof i.value === 'number' ? i.value : undefined,
          currency: str(i.currency) || undefined,
          stage: str(i.stage) || undefined,
          expectedClose: str(i.expected_close) || undefined,
          notes: str(i.notes) || undefined,
        })
        return `Added deal ${d.id}: ${dealLine({ ...d, contactName: contact?.name }, store.currency)}.`
      },
    },
    {
      name: 'crm_update_deal',
      description: 'Change a deal: move it to another stage (won, lost…), or change its value, close date, notes or contact. Give only what changes.',
      input_schema: schema(
        {
          deal: dealParam,
          title: { type: 'string' },
          stage: { type: 'string', description: 'new, qualified, proposal, negotiation, won or lost.' },
          value: { type: 'number' },
          currency: { type: 'string' },
          expected_close: { type: 'string', description: 'Like 2026-11-30; empty to remove it.' },
          notes: { type: 'string' },
          contact: contactParam,
        },
        ['deal'],
      ),
      label: (i) => (str(i.stage) ? `Moving a deal to ${str(i.stage)}` : 'Updating a deal'),
      run: async (i) => {
        const d = store.findDeal(str(i.deal))
        const contact = str(i.contact) ? store.findContact(str(i.contact)) : undefined
        const after = store.updateDeal(b, d.id, {
          title: typeof i.title === 'string' ? i.title : undefined,
          stage: str(i.stage) || undefined,
          value: typeof i.value === 'number' ? i.value : undefined,
          currency: str(i.currency) || undefined,
          expectedClose: typeof i.expected_close === 'string' ? i.expected_close || null : undefined,
          notes: typeof i.notes === 'string' ? i.notes : undefined,
          contact: contact?.id,
        })
        return after === d ? 'Nothing to change.' : `Updated: ${dealLine(after, store.currency)}.`
      },
    },
    {
      name: 'crm_delete',
      description:
        'Delete a contact (with their timeline and follow-ups; their deals stay), a deal, a follow-up or one timeline entry. The user is asked first. Prefer crm_update_* when something only needs changing.',
      input_schema: schema(
        {
          what: { type: 'string', description: 'contact, deal, task or activity.' },
          id: { type: 'string', description: 'Its id (c…, deal…, t… or a…), or a contact’s name.' },
        },
        ['what', 'id'],
      ),
      label: (i) => `Deleting ${str(i.what)} ${str(i.id)}`,
      asks: async (i) => {
        switch (str(i.what)) {
          case 'contact': {
            const c = store.findContact(str(i.id))
            const p = store.contactPage(c.id)
            const gone = [p.activities.length && `${p.activities.length} timeline entr${p.activities.length === 1 ? 'y' : 'ies'}`, p.tasks.length && `${p.tasks.length} follow-up${p.tasks.length === 1 ? '' : 's'}`].filter(Boolean)
            return { title: `Delete ${c.name} from the CRM`, body: `${gone.length ? `Their ${gone.join(' and ')} go too. ` : ''}${p.deals.length ? 'Their deals stay. ' : ''}You can undo it in the CRM tab.` }
          }
          case 'deal': {
            const d = store.findDeal(str(i.id))
            return { title: `Delete the deal “${d.title}”`, body: 'Its follow-ups and history stay with the contact.' }
          }
          case 'task': {
            const t = store.findTask(str(i.id))
            return { title: `Delete the follow-up “${t.title}”`, body: t.due ? `Due ${t.due.replace('T', ' ')}.` : '' }
          }
          case 'activity': {
            const a = store.all().activities.find((x) => x.id === str(i.id))
            if (!a) throw new Error(`No timeline entry ${str(i.id)}.`)
            return { title: `Delete a ${KIND_LABEL[a.kind].toLowerCase()} from the timeline`, body: a.text.slice(0, 300) }
          }
          default:
            throw new Error('what must be contact, deal, task or activity.')
        }
      },
      run: async (i) => {
        switch (str(i.what)) {
          case 'contact':
            return `Deleted ${store.deleteContact(b, store.findContact(str(i.id)).id).name}.`
          case 'deal':
            return `Deleted the deal “${store.deleteDeal(b, store.findDeal(str(i.id)).id).title}”.`
          case 'task':
            return `Deleted the follow-up “${store.deleteTask(b, store.findTask(str(i.id)).id).title}”.`
          case 'activity':
            store.deleteActivity(b, str(i.id))
            return 'Deleted it from the timeline.'
          default:
            throw new Error('what must be contact, deal, task or activity.')
        }
      },
    },
    {
      name: 'crm_undo',
      description: 'Undo the CRM changes you (the assistant) made most recently, all of them in one go, when the user asks to undo or says it was wrong. Things they changed themselves since are kept.',
      input_schema: schema({}),
      label: () => 'Undoing my last changes',
      run: async () => {
        const r = store.undo()
        return `Undid ${r.undone} change${r.undone === 1 ? '' : 's'}: ${r.summary.join('; ')}.${r.kept ? ` Kept ${r.kept} that the user changed since.` : ''}`
      },
    },
    {
      name: 'crm_import',
      description: 'Import contacts from a file: CSV or Excel (from a spreadsheet, Google Contacts or Outlook) or vCard (.vcf, from a phone). People already there are filled in, not duplicated.',
      input_schema: schema({ file: { type: 'string', description: 'The file: its id or name in Documents, or its full path.' } }, ['file']),
      label: () => 'Importing contacts',
      run: async (i) => {
        const ref = str(i.file)
        let path: string
        let name: string
        let text: string
        const vcf = /\.vcf$/i.test(ref) ? ctx.files.homeFile(ref) : null
        if (vcf) {
          path = vcf
          name = vcf
          text = await readFile(vcf, 'utf8')
        } else {
          const e = await ctx.files.resolve(ref)
          if (e.kind !== 'csv' && e.kind !== 'xlsx') throw new Error(`${e.name} isn’t a CSV, Excel or vCard file.`)
          path = e.path
          name = e.name
          const bytes = new Uint8Array(await readFile(path))
          text = e.kind === 'xlsx' ? toCsv(await xlsxRows(bytes)) : Buffer.from(bytes).toString('utf8')
        }
        const parsed = contactsFromFile(name, text)
        if (!parsed.contacts.length) throw new Error(`No contacts found in ${basename(name)}. A CSV needs a header row with a name or email column.`)
        const r = importContacts(store, b, parsed.contacts)
        const skipped = r.skipped + parsed.skipped
        return `Imported from ${basename(name)}: ${r.added} added, ${r.updated} filled in${skipped ? `, ${skipped} skipped` : ''}. The user can undo it in the CRM tab.`
      },
    },
    {
      name: 'crm_export',
      description: 'Save the CRM’s contacts, deals or follow-ups as a CSV file (it appears in Documents).',
      input_schema: schema({ what: { type: 'string', description: 'contacts (default), deals or tasks.' } }),
      label: () => 'Exporting from the CRM',
      run: async (i) => {
        const what = str(i.what) || 'contacts'
        const csv = what === 'contacts' ? contactsCsv(store.all()) : what === 'deals' ? dealsCsv(store.all()) : what === 'tasks' ? tasksCsv(store.all()) : null
        if (!csv) throw new Error('what must be contacts, deals or tasks.')
        const day = when((ctx.now?.() ?? new Date()).getTime()).slice(0, 10)
        const e = await ctx.files.save(Buffer.from(csv), `CRM ${what} ${day}`, 'csv')
        return `Saved ${e.name} (Documents id ${e.id}) in ${ctx.files.outLabel()}.`
      },
    },
  ]
}
