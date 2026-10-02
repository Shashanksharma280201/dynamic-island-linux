import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTACT_STATUSES,
  DEAL_STAGES,
  OPEN_STAGES,
  STAGE_LABEL,
  ACTIVITY_KINDS,
  KIND_LABEL,
  dueTime,
  type Activity,
  type ActivityKind,
  type ChangeBy,
  type Contact,
  type ContactPage,
  type ContactStatus,
  type ContactSummary,
  type CrmChanges,
  type CrmOverview,
  type Deal,
  type DealStage,
  type DealSummary,
  type Task,
  type TaskSummary,
} from '@shared/crm'

/** What's saved: everything in one file. */
export type CrmData = {
  version: 1
  /** Last number used for each kind of id. */
  seq: { c: number; deal: number; t: number; a: number }
  /** For deals without their own currency. */
  currency: string
  contacts: Contact[]
  deals: Deal[]
  tasks: Task[]
  activities: Activity[]
  /** Follow-ups the island already reminded you of (id → when). */
  reminded: Record<string, number>
}

type Coll = 'contacts' | 'deals' | 'tasks' | 'activities'
type Item = Contact | Deal | Task | Activity

/** One change to one record: how it was before, and how it was left. */
type Change = { coll: Coll; id: string; before: Item | null; after: string | null }

/** Changes made together (one click, or one answer of the agent). */
type Batch = { id: string; by: ChangeBy; at: number; summary: string[]; changes: Map<string, Change>; undone?: boolean }

export type ContactInput = {
  name?: string
  company?: string
  title?: string
  emails?: string[]
  phones?: string[]
  tags?: string[]
  status?: string
  address?: string
  website?: string
  birthday?: string
  about?: string
  /** Set these fields; an empty value removes one. */
  fields?: Record<string, string>
}

export type DealInput = {
  title?: string
  contact?: string | null
  company?: string
  value?: number | null
  currency?: string
  stage?: string
  expectedClose?: string | null
  notes?: string
}

export type TaskFilter = 'open' | 'overdue' | 'today' | 'upcoming' | 'done' | 'all'

const MAX_BATCHES = 40
const BACKUPS_KEPT = 7

const empty = (): CrmData => ({ version: 1, seq: { c: 0, deal: 0, t: 0, a: 0 }, currency: 'USD', contacts: [], deals: [], tasks: [], activities: [], reminded: {} })

// ------------------------------------------------------------ checking ----

const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const opt = (v: string) => v || undefined

/** Emails, trimmed, valid-looking and without repeats. Pure. */
export function cleanEmails(list: unknown): string[] {
  const out: string[] = []
  for (const v of Array.isArray(list) ? list : []) {
    const e = clip(v, 200).replace(/^mailto:/i, '')
    if (!e) continue
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error(`“${e}” isn’t an email address.`)
    if (!out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e)
  }
  return out.slice(0, 10)
}

/** Phone numbers, keeping only what phone numbers are made of. Pure. */
export function cleanPhones(list: unknown): string[] {
  const out: string[] = []
  for (const v of Array.isArray(list) ? list : []) {
    const p = clip(v, 40).replace(/^tel:/i, '')
    if (!p) continue
    if (!/^\+?[\d\s().\-/]{3,}(?:\s*(?:x|ext\.?)\s*\d+)?$/i.test(p) || (p.match(/\d/g)?.length ?? 0) < 3) throw new Error(`“${p}” isn’t a phone number.`)
    if (!out.some((x) => x.replace(/\D/g, '') === p.replace(/\D/g, ''))) out.push(p)
  }
  return out.slice(0, 10)
}

/** Tags without repeats (ignoring case). Pure. */
export function cleanTags(list: unknown): string[] {
  const out: string[] = []
  for (const v of Array.isArray(list) ? list : []) {
    const t = clip(v, 40).replace(/^#/, '')
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out.slice(0, 20)
}

const checkDate = (v: string, what: string, time = false): string => {
  const re = time ? /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/ : /^\d{4}-\d{2}-\d{2}$/
  if (!re.test(v) || dueTime(v) == null) throw new Error(`${what} must be a date like 2026-10-31${time ? ' (or 2026-10-31T15:30)' : ''}.`)
  return v
}

const checkStatus = (v: string): ContactStatus | undefined => {
  if (!v) return undefined
  const s = v.toLowerCase() as ContactStatus
  if (!CONTACT_STATUSES.includes(s)) throw new Error(`Status must be one of: ${CONTACT_STATUSES.join(', ')}.`)
  return s
}

const checkStage = (v: string): DealStage => {
  const s = v.toLowerCase() as DealStage
  if (!DEAL_STAGES.includes(s)) throw new Error(`Stage must be one of: ${DEAL_STAGES.join(', ')}.`)
  return s
}

const checkCurrency = (v: string): string => {
  const c = v.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(c)) throw new Error('Currency must be a 3-letter code like USD, EUR or INR.')
  return c
}

// ---------------------------------------------------------------- store ----

/**
 * The CRM's data, kept in one JSON file on this computer and written through a
 * temporary file (a crash never leaves half a file), with a copy each day for
 * the last week. Every change is recorded with what it replaced, so the
 * agent's changes can be undone in one go.
 */
export class CrmStore {
  private data: CrmData = empty()
  private batches: Batch[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private backedUp = ''

  constructor(
    private d: {
      dir: string
      /** Something changed (`changes` when the agent changed something). */
      onChange: (changes?: CrmChanges) => void
      now?: () => number
    },
  ) {
    this.data = this.load()
  }

  private now(): number {
    return this.d.now?.() ?? Date.now()
  }

  private get file(): string {
    return join(this.d.dir, 'crm.json')
  }

  /** The saved data, or the newest backup if the file is damaged. */
  private load(): CrmData {
    const read = (f: string): CrmData => {
      const j = JSON.parse(readFileSync(f, 'utf8'))
      const base = empty()
      return {
        version: 1,
        seq: { ...base.seq, ...(j.seq ?? {}) },
        currency: typeof j.currency === 'string' && /^[A-Z]{3}$/.test(j.currency) ? j.currency : base.currency,
        contacts: Array.isArray(j.contacts)
          ? j.contacts.map((c: Partial<Contact>) => ({ ...c, emails: c.emails ?? [], phones: c.phones ?? [], tags: c.tags ?? [], fields: c.fields ?? {} }) as Contact)
          : [],
        deals: Array.isArray(j.deals) ? j.deals : [],
        tasks: Array.isArray(j.tasks) ? j.tasks : [],
        activities: Array.isArray(j.activities) ? j.activities : [],
        reminded: j.reminded && typeof j.reminded === 'object' ? j.reminded : {},
      }
    }
    if (!existsSync(this.file)) return empty()
    try {
      return read(this.file)
    } catch (e) {
      console.error('[crm] damaged data file, using the latest backup:', e)
      const broken = `${this.file}.damaged-${this.now()}`
      try {
        renameSync(this.file, broken)
      } catch {
        // leave it
      }
      for (const b of this.backups()) {
        try {
          return read(join(this.d.dir, 'backups', b))
        } catch {
          // try an older one
        }
      }
      return empty()
    }
  }

  private backups(): string[] {
    try {
      return readdirSync(join(this.d.dir, 'backups'))
        .filter((f) => /^crm-\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
        .reverse()
    } catch {
      return []
    }
  }

  /** Write now (also before quitting). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      mkdirSync(this.d.dir, { recursive: true })
      // Once a day, keep a copy of how it was (the last week of them).
      const day = new Date(this.now()).toISOString().slice(0, 10)
      if (this.backedUp !== day && existsSync(this.file)) {
        const dir = join(this.d.dir, 'backups')
        mkdirSync(dir, { recursive: true })
        const copy = join(dir, `crm-${day}.json`)
        if (!existsSync(copy)) copyFileSync(this.file, copy)
        for (const old of this.backups().slice(BACKUPS_KEPT)) unlinkSync(join(dir, old))
        this.backedUp = day
      }
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data))
      renameSync(`${this.file}.tmp`, this.file)
    } catch (e) {
      console.error('[crm] save failed:', e)
    }
  }

  private save(): void {
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 300)
  }

  private quiet = 0
  private missed: Batch | null = null

  private changed(b: Batch): void {
    this.save()
    if (this.quiet) this.missed = b
    else this.d.onChange(b.by === 'agent' ? this.view(b) : undefined)
  }

  /** Many changes at once (an import): one notice at the end, not one each. */
  bulk<T>(fn: () => T): T {
    this.quiet++
    try {
      return fn()
    } finally {
      if (--this.quiet === 0 && this.missed) {
        const b = this.missed
        this.missed = null
        this.d.onChange(b.by === 'agent' ? this.view(b) : undefined)
      }
    }
  }

  // ------------------------------------------------------- changes, undo ----

  /**
   * A name for changes that belong together: one click in the tab, or one
   * answer of the agent. It's only kept once something actually changes.
   */
  begin(by: ChangeBy): string {
    return `${by}-${this.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  }

  private batch(id: string): Batch {
    let b = this.batches.find((x) => x.id === id)
    if (!b) {
      const by = id.split('-')[0]
      if (by !== 'you' && by !== 'agent') throw new Error('Unknown change batch')
      b = { id, by, at: this.now(), summary: [], changes: new Map() }
      this.batches.push(b)
      while (this.batches.length > MAX_BATCHES) this.batches.shift()
    }
    return b
  }

  private list<T extends Item>(coll: Coll): T[] {
    return this.data[coll] as T[]
  }

  /** Insert or replace a record, remembering what it was. */
  private put(b: Batch, coll: Coll, rec: Item): void {
    const arr = this.list<Item>(coll)
    const i = arr.findIndex((x) => x.id === rec.id)
    const key = `${coll}:${rec.id}`
    if (!b.changes.has(key)) b.changes.set(key, { coll, id: rec.id, before: i >= 0 ? structuredClone(arr[i]) : null, after: null })
    if (i >= 0) arr[i] = rec
    else arr.push(rec)
    b.changes.get(key)!.after = JSON.stringify(rec)
  }

  private drop(b: Batch, coll: Coll, id: string): void {
    const arr = this.list<Item>(coll)
    const i = arr.findIndex((x) => x.id === id)
    if (i < 0) return
    const key = `${coll}:${id}`
    if (!b.changes.has(key)) b.changes.set(key, { coll, id, before: structuredClone(arr[i]), after: null })
    arr.splice(i, 1)
    b.changes.get(key)!.after = null
  }

  private view(b: Batch): CrmChanges {
    return { id: b.id, by: b.by, at: b.at, summary: [...b.summary], undone: b.undone }
  }

  /** The agent's latest changes, while they can still be undone. */
  lastAgentChanges(): CrmChanges | undefined {
    const b = [...this.batches].reverse().find((x) => x.by === 'agent' && x.changes.size > 0)
    return b && !b.undone ? this.view(b) : undefined
  }

  /**
   * Put back how things were before a batch of changes. A record changed again
   * since is left as it is now.
   */
  undo(id?: string): { undone: number; kept: number; summary: string[] } {
    const b = id ? this.batch(id) : [...this.batches].reverse().find((x) => x.by === 'agent' && x.changes.size > 0 && !x.undone)
    if (!b || !b.changes.size) throw new Error('There’s nothing to undo.')
    if (b.undone) throw new Error('That was already undone.')
    let undone = 0
    let kept = 0
    for (const c of [...b.changes.values()].reverse()) {
      const arr = this.list<Item>(c.coll)
      const i = arr.findIndex((x) => x.id === c.id)
      const now = i >= 0 ? JSON.stringify(arr[i]) : null
      if (now !== c.after) {
        kept++
        continue
      }
      if (c.before && i >= 0) arr[i] = c.before
      else if (c.before) arr.push(c.before)
      else if (i >= 0) arr.splice(i, 1)
      undone++
    }
    b.undone = true
    this.save()
    this.d.onChange(b.by === 'agent' ? this.view(b) : undefined)
    return { undone, kept, summary: b.summary }
  }

  // ------------------------------------------------------------ finding ----

  get currency(): string {
    return this.data.currency
  }

  setCurrency(code: string): void {
    this.data.currency = checkCurrency(code)
    this.save()
    this.d.onChange()
  }

  contact(id: string): Contact | undefined {
    return this.data.contacts.find((c) => c.id === id)
  }

  /**
   * A contact by id, email, exact name, or a unique part of the name. Throws
   * a helpful message when there's none, or several.
   */
  findContact(ref: string): Contact {
    const r = ref.trim()
    if (/^c\d+$/.test(r)) {
      const c = this.contact(r)
      if (!c) throw new Error(`There’s no contact ${r}.`)
      return c
    }
    const lower = r.toLowerCase()
    const all = this.data.contacts
    const exact = all.filter((c) => c.name.toLowerCase() === lower || c.emails.some((e) => e.toLowerCase() === lower))
    if (exact.length === 1) return exact[0]
    const some = exact.length ? exact : all.filter((c) => c.name.toLowerCase().includes(lower))
    if (some.length === 1) return some[0]
    if (some.length > 1)
      throw new Error(`“${r}” could be ${some.slice(0, 6).map((c) => `${c.name}${c.company ? ` (${c.company})` : ''} [${c.id}]`).join(', ')}. Use the id.`)
    throw new Error(`No contact called “${r}”. Use crm_find to look, or crm_add_contact to add them.`)
  }

  findDeal(ref: string): Deal {
    const r = ref.trim()
    if (/^deal\d+$/.test(r)) {
      const d = this.data.deals.find((x) => x.id === r)
      if (!d) throw new Error(`There’s no deal ${r}.`)
      return d
    }
    const lower = r.toLowerCase()
    const some = this.data.deals.filter((d) => d.title.toLowerCase() === lower)
    const hits = some.length ? some : this.data.deals.filter((d) => d.title.toLowerCase().includes(lower))
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) throw new Error(`“${r}” could be ${hits.slice(0, 6).map((d) => `${d.title} [${d.id}]`).join(', ')}. Use the id.`)
    throw new Error(`No deal called “${r}”. Use crm_deals to see them.`)
  }

  findTask(ref: string): Task {
    const r = ref.trim()
    const t = /^t\d+$/.test(r) ? this.data.tasks.find((x) => x.id === r) : undefined
    if (t) return t
    const hits = this.data.tasks.filter((x) => x.title.toLowerCase().includes(r.toLowerCase()) && !x.done)
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) throw new Error(`“${r}” could be ${hits.slice(0, 6).map((x) => `${x.title} [${x.id}]`).join(', ')}. Use the id.`)
    throw new Error(`No follow-up “${r}”. Use crm_tasks to see them.`)
  }

  /** When something was last logged with each contact. */
  private touches(): Map<string, number> {
    const m = new Map<string, number>()
    for (const a of this.data.activities) if (a.contactId && (m.get(a.contactId) ?? 0) < a.at) m.set(a.contactId, a.at)
    return m
  }

  private summary(c: Contact, touch: Map<string, number>): ContactSummary {
    return {
      id: c.id,
      name: c.name,
      company: c.company,
      title: c.title,
      status: c.status,
      tags: c.tags,
      email: c.emails[0],
      phone: c.phones[0],
      lastTouch: touch.get(c.id),
      openTasks: this.data.tasks.filter((t) => t.contactId === c.id && !t.done).length,
      openDeals: this.data.deals.filter((d) => d.contactId === c.id && OPEN_STAGES.includes(d.stage)).length,
    }
  }

  /**
   * Contacts matching words in their name, company, title, emails, phones,
   * tags or fields (all words must match), best first; without words, the
   * ones you dealt with most recently.
   */
  search(query = '', o: { status?: string; tag?: string; limit?: number } = {}): ContactSummary[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const status = o.status ? checkStatus(o.status) : undefined
    const tag = o.tag?.toLowerCase().replace(/^#/, '')
    const touch = this.touches()
    const scored: { c: Contact; score: number }[] = []
    for (const c of this.data.contacts) {
      if (status && c.status !== status) continue
      if (tag && !c.tags.some((t) => t.toLowerCase() === tag)) continue
      const name = c.name.toLowerCase()
      const hay = [c.name, c.company, c.title, ...c.emails, ...c.phones, ...c.tags, ...Object.values(c.fields)].filter(Boolean).join(' ').toLowerCase()
      // Phone numbers match by their digits, however they're written.
      const phones = c.phones.map((p) => p.replace(/\D/g, '')).join(' ')
      const matches = (w: string) => hay.includes(w) || (w.replace(/\D/g, '').length >= 4 && phones.includes(w.replace(/\D/g, '')))
      if (!words.every(matches)) continue
      const score = !words.length ? 0 : name.startsWith(words[0]) ? 3 : name.includes(words[0]) ? 2 : 1
      scored.push({ c, score })
    }
    const recent = (c: Contact) => Math.max(touch.get(c.id) ?? 0, c.updatedAt)
    const seq = (c: Contact) => Number(c.id.slice(1))
    scored.sort((a, b) => b.score - a.score || recent(b.c) - recent(a.c) || seq(b.c) - seq(a.c))
    return scored.slice(0, o.limit ?? 200).map((s) => this.summary(s.c, touch))
  }

  contactPage(id: string): ContactPage {
    const contact = this.contact(id)
    if (!contact) throw new Error('That contact was deleted.')
    return {
      contact,
      activities: this.data.activities.filter((a) => a.contactId === id || (a.dealId && this.data.deals.some((d) => d.id === a.dealId && d.contactId === id))).sort((a, b) => b.at - a.at),
      tasks: this.data.tasks.filter((t) => t.contactId === id).sort(taskOrder),
      deals: this.data.deals.filter((d) => d.contactId === id).sort((a, b) => b.updatedAt - a.updatedAt),
    }
  }

  deals(o: { stage?: string; contact?: string } = {}): DealSummary[] {
    const stage = o.stage ? checkStage(o.stage) : undefined
    const names = new Map(this.data.contacts.map((c) => [c.id, c.name]))
    return this.data.deals
      .filter((d) => (!stage || d.stage === stage) && (!o.contact || d.contactId === o.contact))
      .sort((a, b) => DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage) || b.updatedAt - a.updatedAt)
      .map((d) => ({ ...d, contactName: d.contactId ? names.get(d.contactId) : undefined }))
  }

  deal(id: string): Deal | undefined {
    return this.data.deals.find((d) => d.id === id)
  }

  /** Activities and follow-ups about a deal. */
  dealHistory(id: string): { activities: Activity[]; tasks: Task[] } {
    return {
      activities: this.data.activities.filter((a) => a.dealId === id).sort((a, b) => b.at - a.at),
      tasks: this.data.tasks.filter((t) => t.dealId === id).sort(taskOrder),
    }
  }

  tasks(filter: TaskFilter = 'open', o: { contact?: string } = {}): TaskSummary[] {
    const now = this.now()
    const today = new Date(now)
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime()
    const names = new Map(this.data.contacts.map((c) => [c.id, c.name]))
    const titles = new Map(this.data.deals.map((d) => [d.id, d.title]))
    return this.data.tasks
      .filter((t) => {
        if (o.contact && t.contactId !== o.contact) return false
        const at = t.due ? dueTime(t.due) : null
        switch (filter) {
          case 'all':
            return true
          case 'done':
            return t.done
          case 'open':
            return !t.done
          case 'overdue':
            return !t.done && at != null && at < now
          case 'today':
            return !t.done && at != null && at < endOfToday
          case 'upcoming':
            return !t.done && at != null && at >= endOfToday
        }
      })
      .sort(filter === 'done' ? (a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) : taskOrder)
      .map((t) => ({ ...t, contactName: t.contactId ? names.get(t.contactId) : undefined, dealTitle: t.dealId ? titles.get(t.dealId) : undefined }))
  }

  overview(): CrmOverview {
    const now = this.now()
    const open = this.data.tasks.filter((t) => !t.done)
    return {
      currency: this.data.currency,
      counts: {
        contacts: this.data.contacts.length,
        openDeals: this.data.deals.filter((d) => OPEN_STAGES.includes(d.stage)).length,
        openTasks: open.length,
        dueTasks: open.filter((t) => t.due && (dueTime(t.due) ?? Infinity) <= now).length,
      },
      lastAgentChanges: this.lastAgentChanges(),
    }
  }

  // ------------------------------------------------------------ changing ----

  private nextId(kind: keyof CrmData['seq']): string {
    this.data.seq[kind]++
    return `${kind}${this.data.seq[kind]}`
  }

  /** A new contact from what's given (a name at least). */
  addContact(batch: string, i: ContactInput): Contact {
    const b = this.batch(batch)
    const name = clip(i.name, 120)
    if (!name) throw new Error('A contact needs a name.')
    const now = this.now()
    const c: Contact = {
      id: this.nextId('c'),
      name,
      emails: cleanEmails(i.emails),
      phones: cleanPhones(i.phones),
      tags: cleanTags(i.tags),
      fields: {},
      createdAt: now,
      updatedAt: now,
    }
    applyContact(c, { ...i, name: undefined, emails: undefined, phones: undefined, tags: undefined })
    this.put(b, 'contacts', c)
    b.summary.push(`Added ${c.name}`)
    this.changed(b)
    return c
  }

  /** Change the given details of a contact (lists given replace the old ones). */
  updateContact(batch: string, id: string, i: ContactInput & { addTags?: string[]; removeTags?: string[]; addEmails?: string[]; addPhones?: string[] }): Contact {
    const b = this.batch(batch)
    const old = this.contact(id)
    if (!old) throw new Error('That contact was deleted.')
    const c: Contact = structuredClone(old)
    const what: string[] = []
    if (i.name !== undefined) {
      const name = clip(i.name, 120)
      if (!name) throw new Error('A contact needs a name.')
      if (name !== c.name) (c.name = name), what.push('name')
    }
    if (i.emails !== undefined) c.emails = cleanEmails(i.emails)
    if (i.addEmails?.length) c.emails = cleanEmails([...c.emails, ...i.addEmails])
    if (i.phones !== undefined) c.phones = cleanPhones(i.phones)
    if (i.addPhones?.length) c.phones = cleanPhones([...c.phones, ...i.addPhones])
    if (i.tags !== undefined) c.tags = cleanTags(i.tags)
    if (i.addTags?.length) c.tags = cleanTags([...c.tags, ...i.addTags])
    if (i.removeTags?.length) {
      const gone = i.removeTags.map((t) => t.toLowerCase().replace(/^#/, ''))
      c.tags = c.tags.filter((t) => !gone.includes(t.toLowerCase()))
    }
    applyContact(c, { ...i, name: undefined, emails: undefined, phones: undefined, tags: undefined })
    for (const k of ['company', 'title', 'emails', 'phones', 'tags', 'status', 'address', 'website', 'birthday', 'about', 'fields'] as const)
      if (JSON.stringify(c[k]) !== JSON.stringify(old[k])) what.push(k === 'about' ? 'notes' : k)
    if (!what.length) return old
    c.updatedAt = this.now()
    this.put(b, 'contacts', c)
    b.summary.push(`Updated ${c.name} (${what.join(', ')})`)
    this.changed(b)
    return c
  }

  /** Delete a contact with its timeline and follow-ups; their deals stay, without them. */
  deleteContact(batch: string, id: string): Contact {
    const b = this.batch(batch)
    const c = this.contact(id)
    if (!c) throw new Error('That contact was already deleted.')
    for (const a of this.data.activities.filter((x) => x.contactId === id)) this.drop(b, 'activities', a.id)
    for (const t of this.data.tasks.filter((x) => x.contactId === id)) this.drop(b, 'tasks', t.id)
    for (const d of this.data.deals.filter((x) => x.contactId === id)) this.put(b, 'deals', { ...d, contactId: undefined, company: d.company ?? c.company })
    this.drop(b, 'contacts', id)
    b.summary.push(`Deleted ${c.name}`)
    this.changed(b)
    return c
  }

  /** Log something that happened (a call, a meeting, a note…). */
  log(batch: string, i: { kind?: string; text: string; contact?: string; deal?: string; at?: number }): Activity {
    const b = this.batch(batch)
    const body = text(i.text, 20_000)
    if (!body) throw new Error('Say what happened.')
    const kind = (i.kind || 'note').toLowerCase() as ActivityKind
    if (!ACTIVITY_KINDS.includes(kind)) throw new Error(`Kind must be one of: ${ACTIVITY_KINDS.join(', ')}.`)
    const contact = i.contact ? this.contact(i.contact) : undefined
    if (i.contact && !contact) throw new Error('That contact was deleted.')
    const deal = i.deal ? this.deal(i.deal) : undefined
    if (i.deal && !deal) throw new Error('That deal was deleted.')
    const now = this.now()
    const a: Activity = { id: this.nextId('a'), kind, text: body, contactId: contact?.id ?? deal?.contactId, dealId: deal?.id, at: i.at && Number.isFinite(i.at) ? i.at : now, createdAt: now }
    this.put(b, 'activities', a)
    const who = contact?.name ?? (a.contactId ? this.contact(a.contactId)?.name : undefined)
    b.summary.push(`Logged ${kind === 'note' ? 'a note' : `a ${KIND_LABEL[kind].toLowerCase()}`}${who ? ` with ${who}` : deal ? ` on “${deal.title}”` : ''}`)
    this.changed(b)
    return a
  }

  deleteActivity(batch: string, id: string): Activity {
    const b = this.batch(batch)
    const a = this.data.activities.find((x) => x.id === id)
    if (!a) throw new Error('That was already deleted.')
    this.drop(b, 'activities', id)
    b.summary.push(`Deleted a ${KIND_LABEL[a.kind].toLowerCase()} from the timeline`)
    this.changed(b)
    return a
  }

  addTask(batch: string, i: { title: string; contact?: string; deal?: string; due?: string }): Task {
    const b = this.batch(batch)
    const title = clip(i.title, 300)
    if (!title) throw new Error('Say what to do.')
    const contact = i.contact ? this.contact(i.contact) : undefined
    if (i.contact && !contact) throw new Error('That contact was deleted.')
    const deal = i.deal ? this.deal(i.deal) : undefined
    if (i.deal && !deal) throw new Error('That deal was deleted.')
    const t: Task = {
      id: this.nextId('t'),
      title,
      contactId: contact?.id ?? deal?.contactId,
      dealId: deal?.id,
      due: i.due ? checkDate(i.due.trim(), 'The due date', true) : undefined,
      done: false,
      createdAt: this.now(),
    }
    this.put(b, 'tasks', t)
    b.summary.push(`Added follow-up “${t.title}”`)
    this.changed(b)
    return t
  }

  updateTask(batch: string, id: string, i: { title?: string; due?: string | null; done?: boolean }): Task {
    const b = this.batch(batch)
    const old = this.data.tasks.find((x) => x.id === id)
    if (!old) throw new Error('That follow-up was deleted.')
    const t = structuredClone(old)
    if (i.title !== undefined) {
      t.title = clip(i.title, 300)
      if (!t.title) throw new Error('Say what to do.')
    }
    if (i.due !== undefined) {
      t.due = i.due ? checkDate(i.due.trim(), 'The due date', true) : undefined
      if (t.due !== old.due) delete this.data.reminded[t.id]
    }
    if (i.done !== undefined && i.done !== t.done) {
      t.done = i.done
      t.doneAt = i.done ? this.now() : undefined
    }
    if (JSON.stringify(t) === JSON.stringify(old)) return old
    this.put(b, 'tasks', t)
    b.summary.push(i.done === true ? `Done: “${t.title}”` : i.done === false ? `Reopened “${t.title}”` : `Changed follow-up “${t.title}”`)
    this.changed(b)
    return t
  }

  deleteTask(batch: string, id: string): Task {
    const b = this.batch(batch)
    const t = this.data.tasks.find((x) => x.id === id)
    if (!t) throw new Error('That follow-up was already deleted.')
    this.drop(b, 'tasks', id)
    b.summary.push(`Deleted follow-up “${t.title}”`)
    this.changed(b)
    return t
  }

  addDeal(batch: string, i: DealInput): Deal {
    const b = this.batch(batch)
    const title = clip(i.title, 200)
    if (!title) throw new Error('A deal needs a name.')
    const now = this.now()
    const d: Deal = { id: this.nextId('deal'), title, stage: 'new', createdAt: now, updatedAt: now }
    this.applyDeal(d, { ...i, title: undefined })
    this.put(b, 'deals', d)
    b.summary.push(`Added deal “${d.title}”`)
    this.changed(b)
    return d
  }

  updateDeal(batch: string, id: string, i: DealInput): Deal {
    const b = this.batch(batch)
    const old = this.deal(id)
    if (!old) throw new Error('That deal was deleted.')
    const d = structuredClone(old)
    if (i.title !== undefined) {
      d.title = clip(i.title, 200)
      if (!d.title) throw new Error('A deal needs a name.')
    }
    this.applyDeal(d, { ...i, title: undefined })
    if (JSON.stringify(d) === JSON.stringify(old)) return old
    d.updatedAt = this.now()
    this.put(b, 'deals', d)
    b.summary.push(d.stage !== old.stage ? `Moved “${d.title}” to ${STAGE_LABEL[d.stage]}` : `Updated deal “${d.title}”`)
    this.changed(b)
    return d
  }

  private applyDeal(d: Deal, i: DealInput): void {
    if (i.contact !== undefined) {
      if (i.contact === null || i.contact === '') d.contactId = undefined
      else {
        const c = this.contact(i.contact)
        if (!c) throw new Error('That contact was deleted.')
        d.contactId = c.id
        if (!d.company && c.company) d.company = c.company
      }
    }
    if (i.company !== undefined) d.company = opt(clip(i.company, 120))
    if (i.value !== undefined) {
      if (i.value === null) d.value = undefined
      else if (!Number.isFinite(i.value) || i.value < 0 || i.value > 1e12) throw new Error('The value must be a positive number.')
      else d.value = Math.round(i.value * 100) / 100
    }
    if (i.currency) d.currency = checkCurrency(i.currency)
    if (i.stage) {
      const s = checkStage(i.stage)
      if (s !== d.stage) d.closedAt = s === 'won' || s === 'lost' ? this.now() : undefined
      d.stage = s
    }
    if (i.expectedClose !== undefined) d.expectedClose = i.expectedClose ? checkDate(i.expectedClose.trim(), 'The close date') : undefined
    if (i.notes !== undefined) d.notes = opt(text(i.notes, 10_000))
  }

  deleteDeal(batch: string, id: string): Deal {
    const b = this.batch(batch)
    const d = this.deal(id)
    if (!d) throw new Error('That deal was already deleted.')
    // Its follow-ups and history stay with the contact.
    for (const t of this.data.tasks.filter((x) => x.dealId === id)) this.put(b, 'tasks', { ...t, dealId: undefined })
    for (const a of this.data.activities.filter((x) => x.dealId === id)) this.put(b, 'activities', { ...a, dealId: undefined })
    this.drop(b, 'deals', id)
    b.summary.push(`Deleted deal “${d.title}”`)
    this.changed(b)
    return d
  }

  // ---------------------------------------------------------- reminders ----

  /** Open follow-ups that are due and haven't been reminded of yet; marks them reminded. */
  dueForReminder(): TaskSummary[] {
    const now = this.now()
    const due = this.tasks('open').filter((t) => !this.data.reminded[t.id] && t.due && (dueTime(t.due) ?? Infinity) <= now)
    if (!due.length) return []
    for (const t of due) this.data.reminded[t.id] = now
    // Forget reminders of follow-ups that are gone or done.
    for (const id of Object.keys(this.data.reminded)) if (!this.data.tasks.some((t) => t.id === id && !t.done)) delete this.data.reminded[id]
    this.save()
    return due
  }

  // ----------------------------------------------------------- everything ----

  /** All of it, for export. */
  all(): Readonly<CrmData> {
    return this.data
  }
}

/** Open follow-ups by due date (undated last), then the newest. Pure. */
function taskOrder(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1
  const da = a.due ? dueTime(a.due) ?? Infinity : Infinity
  const db = b.due ? dueTime(b.due) ?? Infinity : Infinity
  return da - db || b.createdAt - a.createdAt
}

/** Copy the simple details given onto a contact (checked). */
function applyContact(c: Contact, i: ContactInput): void {
  if (i.company !== undefined) c.company = opt(clip(i.company, 120))
  if (i.title !== undefined) c.title = opt(clip(i.title, 120))
  if (i.status !== undefined) c.status = checkStatus(clip(i.status, 20))
  if (i.address !== undefined) c.address = opt(text(i.address, 300))
  if (i.website !== undefined) c.website = opt(clip(i.website, 200))
  if (i.birthday !== undefined) {
    const v = clip(i.birthday, 10)
    if (v && !/^(\d{4}-)?\d{2}-\d{2}$/.test(v)) throw new Error('A birthday must look like 1990-04-23 (or 04-23).')
    c.birthday = opt(v)
  }
  if (i.about !== undefined) c.about = opt(text(i.about, 10_000))
  if (i.fields) {
    for (const [k, v] of Object.entries(i.fields)) {
      const key = clip(k, 40)
      if (!key) continue
      const val = text(v, 500)
      if (val) c.fields[key] = val
      else delete c.fields[key]
    }
    if (Object.keys(c.fields).length > 30) throw new Error('A contact can have at most 30 extra fields.')
  }
}
