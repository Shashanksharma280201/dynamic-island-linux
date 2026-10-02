import type { Contact } from '@shared/crm'
import { STAGE_LABEL } from '@shared/crm'
import { parseCsv, toCsv } from '../docs/sheet'
import type { CrmData, CrmStore, ContactInput } from './store'

/**
 * Bringing contacts in (CSV from a spreadsheet or Google Contacts, vCard from
 * a phone) and taking everything out as CSV. Pure, apart from importContacts.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "E-mail 1 - Value" → "e mail 1 value". */
const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

type Field = 'name' | 'first' | 'middle' | 'last' | 'email' | 'phone' | 'company' | 'title' | 'tags' | 'status' | 'address' | 'website' | 'birthday' | 'about' | 'skip'

/** Which contact detail a column holds, from its header. */
export function columnField(header: string): Field | null {
  const h = norm(header)
  if (!h) return 'skip'
  // Labels of other columns ("E-mail 1 - Type: * Home") aren't details, and
  // some exports repeat the name or address in pieces.
  if (/\b(type|label)$/.test(h)) return 'skip'
  if (/^(file as|photo|name prefix|name suffix|suffix)$|phonetic|yomi|^address \d+ (street|city|po box|region|postal code|country|extended address)$/.test(h)) return 'skip'
  if (/^(name|full name|fullname|display name|contact|contact name|person)$/.test(h)) return 'name'
  if (/^(first name|firstname|given name|first)$/.test(h)) return 'first'
  if (/^(middle name|additional name)$/.test(h)) return 'middle'
  if (/^(last name|lastname|family name|surname|last)$/.test(h)) return 'last'
  if (/\be ?mails?\b/.test(h)) return 'email'
  if (/\b(phones?|mobile|cell|telephone|tel|whatsapp)\b/.test(h)) return 'phone'
  if (/^(company|company name|organi[sz]ation|org|account|employer|business)( \d+)?( name)?$/.test(h)) return 'company'
  if (/^(title|job title|position|role|designation)$|^organi[sz]ation( \d+)? title$/.test(h)) return 'title'
  if (/^(tags?|labels?|groups?|group membership|categories|category)$/.test(h)) return 'tags'
  if (/^(status|stage|lifecycle stage|contact type)$/.test(h)) return 'status'
  if (/^(address|street|street address|mailing address)$|^address \d+ formatted$/.test(h)) return 'address'
  if (/^(website|web|url|site|homepage|web page)$|^website \d+ value$/.test(h)) return 'website'
  if (/^(birthday|birth date|date of birth|dob)$/.test(h)) return 'birthday'
  if (/^(notes?|about|description|comments?|remarks)$/.test(h)) return 'about'
  return null
}

/** Several values in one cell: "a@x.com; b@y.com", Google's " ::: ". */
const split = (v: string) =>
  v
    .split(/\s*:::\s*|\s*[;,\n]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)

const STATUS_WORDS: Record<string, ContactInput['status']> = {
  lead: 'lead',
  prospect: 'lead',
  customer: 'customer',
  client: 'customer',
  partner: 'partner',
  vendor: 'partner',
  supplier: 'partner',
}

/** Dates people write ("23/04/1990" is ambiguous, so only ISO-ish ones). Pure. */
function birthday(v: string): string | undefined {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v.trim()) ?? /^--(\d{2})-?(\d{2})$/.exec(v.trim())
  if (!m) return undefined
  return m.length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`
}

/** Contacts from CSV text with a header row. Rows without a name or email are left out. Pure. */
export function contactsFromCsv(csv: string): {
  contacts: ContactInput[]
  skipped: number
} {
  const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()))
  if (rows.length < 2) return { contacts: [], skipped: 0 }
  const [head, ...body] = rows
  const fields = head.map(columnField)
  const contacts: ContactInput[] = []
  let skipped = 0
  for (const row of body) {
    const c: ContactInput & {
      emails: string[]
      phones: string[]
      tags: string[]
      fields: Record<string, string>
    } = { emails: [], phones: [], tags: [], fields: {} }
    const parts: Record<'first' | 'middle' | 'last', string> = {
      first: '',
      middle: '',
      last: '',
    }
    head.forEach((h, i) => {
      const v = (row[i] ?? '').trim()
      if (!v) return
      const f = fields[i]
      switch (f) {
        case 'skip':
          return
        case 'name':
          c.name = v
          return
        case 'first':
        case 'middle':
        case 'last':
          parts[f] = v
          return
        case 'email':
          c.emails.push(
            ...split(v)
              .map((x) => x.replace(/^mailto:/i, ''))
              .filter((x) => EMAIL.test(x)),
          )
          return
        case 'phone':
          c.phones.push(...split(v).filter((x) => (x.match(/\d/g)?.length ?? 0) >= 3))
          return
        case 'tags':
          c.tags.push(
            ...split(v)
              .map((x) => x.replace(/^\*\s*/, ''))
              .filter((x) => x && x.toLowerCase() !== 'mycontacts'),
          )
          return
        case 'status': {
          const s = STATUS_WORDS[v.toLowerCase()]
          if (s) c.status = s
          else c.fields[h.trim()] = v
          return
        }
        case 'birthday':
          c.birthday = birthday(v)
          return
        case 'title':
          // Outlook's "Title" is Mr. or Dr.; "Job Title" is the job.
          if (/^(mr|mrs|ms|miss|mx|dr|prof|sir|madam)\.?$/i.test(v)) return
          if (norm(h) === 'job title' || !c.title) c.title = v
          return
        case 'company':
        case 'website':
          c[f] ||= v
          return
        case 'address':
        case 'about':
          c[f] = c[f] ? `${c[f]}\n${v}` : v
          return
        default:
          if (Object.keys(c.fields).length < 30) c.fields[h.trim().slice(0, 40)] = v.slice(0, 500)
      }
    })
    c.name ||= [parts.first, parts.middle, parts.last].filter(Boolean).join(' ') || c.emails[0]
    if (!c.name) {
      skipped++
      continue
    }
    contacts.push(c)
  }
  return { contacts, skipped }
}

/** Unfold and unescape vCard text into "NAME;PARAMS:value" lines. */
function vcardLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '') // folded lines
    .replace(/=\n/g, '') // quoted-printable soft breaks
    .split('\n')
}

const unescape = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
const qp = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/%/g, '%25').replace(/=([0-9A-F]{2})/gi, '%$1'))
  } catch {
    return v
  }
}

/** Contacts from vCard text (.vcf, as phones and Google Contacts export them). Pure. */
export function contactsFromVcard(text: string): ContactInput[] {
  const out: ContactInput[] = []
  let c: (ContactInput & { emails: string[]; phones: string[]; tags: string[] }) | null = null
  let n = ''
  for (const line of vcardLines(text)) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const [rawKey, ...params] = line.slice(0, colon).split(';')
    const key = rawKey.replace(/^item\d+\./i, '').toUpperCase()
    let value = line.slice(colon + 1)
    if (params.some((p) => /quoted-printable/i.test(p))) value = qp(value)
    if (key === 'BEGIN' && /vcard/i.test(value)) {
      c = { emails: [], phones: [], tags: [] }
      n = ''
      continue
    }
    if (!c) continue
    switch (key) {
      case 'END':
        if (/vcard/i.test(value)) {
          c.name ||= n || c.emails[0]
          if (c.name) out.push(c)
          c = null
        }
        break
      case 'FN':
        c.name = unescape(value).trim()
        break
      case 'N': {
        const [last = '', first = '', middle = ''] = value.split(';').map((x) => unescape(x).trim())
        n = [first, middle, last].filter(Boolean).join(' ')
        break
      }
      case 'EMAIL':
        if (EMAIL.test(value.trim())) c.emails.push(value.trim())
        break
      case 'TEL':
        if ((value.match(/\d/g)?.length ?? 0) >= 3) c.phones.push(value.replace(/^tel:/i, '').trim())
        break
      case 'ORG':
        c.company = unescape(value.split(';')[0]).trim() || undefined
        break
      case 'TITLE':
        c.title = unescape(value).trim() || undefined
        break
      case 'NOTE':
        c.about = unescape(value).trim() || undefined
        break
      case 'URL':
        c.website ||= unescape(value).trim() || undefined
        break
      case 'BDAY':
        c.birthday = birthday(value)
        break
      case 'ADR':
        c.address ||=
          value
            .split(';')
            .map((x) => unescape(x).trim())
            .filter(Boolean)
            .join(', ') || undefined
        break
      case 'CATEGORIES':
        c.tags.push(
          ...value
            .split(',')
            .map((x) => unescape(x).trim())
            .filter(Boolean),
        )
        break
    }
  }
  return out
}

/** Contacts from a file's text: vCard or CSV. Pure. */
export function contactsFromFile(name: string, text: string): { contacts: ContactInput[]; skipped: number } {
  if (/\.vcf$/i.test(name) || /^\s*BEGIN:VCARD/i.test(text)) return { contacts: contactsFromVcard(text), skipped: 0 }
  return contactsFromCsv(text)
}

/**
 * Add contacts to the CRM, merging with ones already there (same email, or
 * same name and company): their missing details are filled in and lists
 * extended; nothing they already have is overwritten. One batch, so it can be
 * undone in one go.
 */
export function importContacts(store: CrmStore, batch: string, list: ContactInput[]): { added: number; updated: number; skipped: number } {
  let added = 0
  let updated = 0
  let skipped = 0
  // Who's there already, by email and by name + company.
  const byEmail = new Map<string, Contact>()
  const byName = new Map<string, Contact>()
  const nameKey = (name?: string, company?: string) => `${(name ?? '').trim().toLowerCase()}|${(company ?? '').trim().toLowerCase()}`
  const remember = (c: Contact) => {
    for (const e of c.emails) byEmail.set(e.toLowerCase(), c)
    byName.set(nameKey(c.name, c.company), c)
  }
  store.all().contacts.forEach(remember)
  return store.bulk(() => {
    for (const raw of list.slice(0, 20_000)) {
      // Lenient: drop what doesn't look right instead of failing the import.
      const emails = (raw.emails ?? []).filter((e) => EMAIL.test(e))
      const phones = (raw.phones ?? []).filter((p) => /^\+?[\d\s().\-/]{3,}$/.test(p))
      const i: ContactInput = { ...raw, emails, phones }
      const existing = emails.map((e) => byEmail.get(e.toLowerCase())).find(Boolean) ?? byName.get(nameKey(raw.name, raw.company))
      try {
        if (!existing) {
          remember(store.addContact(batch, i))
          added++
          continue
        }
        const fill = (k: keyof Contact & keyof ContactInput) => (existing[k] ? undefined : (i[k] as any))
        const before = JSON.stringify(existing)
        const after = store.updateContact(batch, existing.id, {
          addEmails: emails,
          addPhones: phones,
          addTags: i.tags,
          company: fill('company'),
          title: fill('title'),
          status: fill('status'),
          address: fill('address'),
          website: fill('website'),
          birthday: fill('birthday'),
          about: fill('about'),
          fields: Object.fromEntries(Object.entries(i.fields ?? {}).filter(([k]) => !existing.fields[k])),
        })
        if (JSON.stringify(after) !== before) {
          remember(after)
          updated++
        }
      } catch {
        skipped++
      }
    }
    return { added, updated, skipped }
  })
}

// ---------------------------------------------------------------- export ----

const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '')

/** Every contact as CSV (custom fields get their own columns). Pure. */
export function contactsCsv(d: Readonly<CrmData>): string {
  const extra = [...new Set(d.contacts.flatMap((c) => Object.keys(c.fields)))].sort()
  const head = ['Name', 'Company', 'Title', 'Status', 'Email', 'Phone', 'Tags', 'Address', 'Website', 'Birthday', 'Notes', ...extra, 'Added']
  const rows = d.contacts.map((c) => [
    c.name,
    c.company ?? '',
    c.title ?? '',
    c.status ?? '',
    c.emails.join('; '),
    c.phones.join('; '),
    c.tags.join('; '),
    c.address ?? '',
    c.website ?? '',
    c.birthday ?? '',
    c.about ?? '',
    ...extra.map((k) => c.fields[k] ?? ''),
    day(c.createdAt),
  ])
  return toCsv([head, ...rows])
}

export function dealsCsv(d: Readonly<CrmData>): string {
  const names = new Map(d.contacts.map((c) => [c.id, c.name]))
  const head = ['Deal', 'Contact', 'Company', 'Stage', 'Value', 'Currency', 'Expected close', 'Notes', 'Added', 'Closed']
  const rows = d.deals.map((x) => [
    x.title,
    x.contactId ? (names.get(x.contactId) ?? '') : '',
    x.company ?? '',
    STAGE_LABEL[x.stage],
    x.value != null ? String(x.value) : '',
    x.currency ?? d.currency,
    x.expectedClose ?? '',
    x.notes ?? '',
    day(x.createdAt),
    day(x.closedAt),
  ])
  return toCsv([head, ...rows])
}

export function tasksCsv(d: Readonly<CrmData>): string {
  const names = new Map(d.contacts.map((c) => [c.id, c.name]))
  const deals = new Map(d.deals.map((x) => [x.id, x.title]))
  const head = ['Follow-up', 'Contact', 'Deal', 'Due', 'Done', 'Done on']
  const rows = d.tasks.map((t) => [
    t.title,
    t.contactId ? (names.get(t.contactId) ?? '') : '',
    t.dealId ? (deals.get(t.dealId) ?? '') : '',
    t.due ?? '',
    t.done ? 'yes' : 'no',
    day(t.doneAt),
  ])
  return toCsv([head, ...rows])
}
