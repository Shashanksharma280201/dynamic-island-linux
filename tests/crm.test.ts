import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CrmStore } from '../electron/crm/store'
import { columnField, contactsCsv, contactsFromCsv, contactsFromVcard, dealsCsv, importContacts, tasksCsv } from '../electron/crm/io'
import { dueLabel, dueTime, money } from '../shared/crm'
import { parseCsv } from '../electron/docs/sheet'

/** A store in a fresh folder, with a clock the test controls. */
function setup(start = new Date(2026, 9, 2, 10, 0).getTime()) {
  const dir = mkdtempSync(join(tmpdir(), 'crm-test-'))
  const clock = { now: start }
  const notices: (string | undefined)[] = []
  const make = () => new CrmStore({ dir, now: () => clock.now, onChange: (c) => void notices.push(c?.summary.join('; ')) })
  const store = make()
  return { dir, clock, notices, store, make, you: () => store.begin('you'), agent: () => store.begin('agent') }
}

test('contacts: adding, checking and changing them', () => {
  const { store, you } = setup()
  const rahul = store.addContact(you(), { name: '  Rahul   Sharma ', company: 'Acme', emails: ['rahul@acme.com', 'RAHUL@acme.com'], phones: ['+91 98765 43210'], tags: ['VIP', 'vip', '#expo'] })
  expect(rahul).toMatchObject({ id: 'c1', name: 'Rahul Sharma', emails: ['rahul@acme.com'], tags: ['VIP', 'expo'] })
  expect(() => store.addContact(you(), { name: ' ' })).toThrow('A contact needs a name.')
  expect(() => store.addContact(you(), { name: 'X', emails: ['nope'] })).toThrow('“nope” isn’t an email address.')
  expect(() => store.addContact(you(), { name: 'X', phones: ['call me'] })).toThrow('isn’t a phone number')
  expect(() => store.addContact(you(), { name: 'X', status: 'friend' })).toThrow('Status must be one of: lead, customer, partner, other.')

  const b = you()
  const r2 = store.updateContact(b, 'c1', { title: 'CTO', addTags: ['Investor'], removeTags: ['vip'], fields: { LinkedIn: 'in/rahul', Empty: '' }, status: 'customer' })
  expect(r2).toMatchObject({ title: 'CTO', tags: ['expo', 'Investor'], fields: { LinkedIn: 'in/rahul' }, status: 'customer' })
  expect(store.updateContact(b, 'c1', { fields: { LinkedIn: '' } }).fields).toEqual({})
  // Nothing changed: nothing recorded.
  const same = store.updateContact(you(), 'c1', { title: 'CTO' })
  expect(same).toBe(store.contact('c1'))
  expect(() => store.updateContact(you(), 'c1', { birthday: '23/04/1990' })).toThrow('A birthday must look like 1990-04-23')
})

test('finding people: by id, email, name or part of it, and searching', () => {
  const { store, you, clock } = setup()
  const b = you()
  store.addContact(b, { name: 'Rahul Sharma', company: 'Acme', emails: ['rahul@acme.com'], phones: ['+91 98765-43210'], tags: ['expo'], status: 'lead' })
  store.addContact(b, { name: 'Rahul Verma', company: 'Globex', status: 'customer' })
  store.addContact(b, { name: 'Priya Nair', company: 'Acme', fields: { City: 'Pune' } })
  expect(store.findContact('c2').name).toBe('Rahul Verma')
  expect(store.findContact('RAHUL@acme.com').name).toBe('Rahul Sharma')
  expect(store.findContact('priya').id).toBe('c3')
  expect(() => store.findContact('rahul')).toThrow('“rahul” could be Rahul Sharma (Acme) [c1], Rahul Verma (Globex) [c2]. Use the id.')
  expect(() => store.findContact('c9')).toThrow('There’s no contact c9.')
  expect(() => store.findContact('Zed')).toThrow('No contact called “Zed”.')

  expect(store.search('acme').map((c) => c.name)).toEqual(['Priya Nair', 'Rahul Sharma'])
  expect(store.search('rahul acme').map((c) => c.id)).toEqual(['c1'])
  expect(store.search('98765 43210').map((c) => c.id)).toEqual(['c1']) // phone digits, however written
  expect(store.search('pune').map((c) => c.id)).toEqual(['c3']) // custom fields
  expect(store.search('', { status: 'customer' }).map((c) => c.id)).toEqual(['c2'])
  expect(store.search('', { tag: '#Expo' }).map((c) => c.id)).toEqual(['c1'])
  // Without words: the ones you dealt with most recently first.
  clock.now += 60_000
  store.log(you(), { contact: 'c2', kind: 'call', text: 'Talked about renewal' })
  expect(store.search()[0]).toMatchObject({ id: 'c2', lastTouch: clock.now })
})

test('timeline, follow-ups and deals', () => {
  const { store, you, clock } = setup()
  const b = you()
  store.addContact(b, { name: 'Rahul Sharma', company: 'Acme' })
  store.log(b, { contact: 'c1', kind: 'meeting', text: 'Demo went well', at: clock.now - 86_400_000 })
  expect(() => store.log(b, { contact: 'c1', kind: 'tweet', text: 'x' })).toThrow('Kind must be one of: note, call, meeting, email, message.')
  expect(() => store.log(b, { contact: 'c1', text: '  ' })).toThrow('Say what happened.')

  store.addTask(b, { title: 'Send proposal', contact: 'c1', due: '2026-10-01' }) // yesterday
  store.addTask(b, { title: 'Call back', contact: 'c1', due: '2026-10-02T16:00' }) // today
  store.addTask(b, { title: 'Quarterly check-in', due: '2026-12-01' })
  store.addTask(b, { title: 'Someday' })
  expect(() => store.addTask(b, { title: 'x', due: 'next week' })).toThrow('The due date must be a date like 2026-10-31 (or 2026-10-31T15:30).')
  expect(() => store.addTask(b, { title: 'x', due: '2026-02-30' })).toThrow('The due date')
  expect(store.tasks('overdue').map((t) => t.title)).toEqual(['Send proposal'])
  expect(store.tasks('today').map((t) => t.title)).toEqual(['Send proposal', 'Call back'])
  expect(store.tasks('upcoming').map((t) => t.title)).toEqual(['Quarterly check-in'])
  expect(store.tasks('open').map((t) => t.title)).toEqual(['Send proposal', 'Call back', 'Quarterly check-in', 'Someday'])
  expect(store.tasks('open')[0].contactName).toBe('Rahul Sharma')
  store.updateTask(you(), 't1', { done: true })
  expect(store.tasks('done').map((t) => [t.title, t.doneAt])).toEqual([['Send proposal', clock.now]])
  expect(store.tasks('overdue')).toEqual([])

  const deal = store.addDeal(b, { title: 'Website redesign', contact: 'c1', value: 12500, expectedClose: '2026-11-30' })
  expect(deal).toMatchObject({ id: 'deal1', stage: 'new', company: 'Acme', value: 12500 })
  expect(() => store.addDeal(b, { title: 'x', stage: 'maybe' })).toThrow('Stage must be one of: new, qualified, proposal, negotiation, won, lost.')
  expect(() => store.addDeal(b, { title: 'x', value: -5 })).toThrow('The value must be a positive number.')
  expect(() => store.addDeal(b, { title: 'x', currency: 'dollars' })).toThrow('Currency must be a 3-letter code')
  clock.now += 1000
  const won = store.updateDeal(you(), 'deal1', { stage: 'won' })
  expect(won).toMatchObject({ stage: 'won', closedAt: clock.now })
  expect(store.findDeal('website').id).toBe('deal1')

  const page = store.contactPage('c1')
  expect(page.activities.map((a) => a.text)).toEqual(['Demo went well'])
  expect(page.tasks.map((t) => t.title)).toEqual(['Call back', 'Send proposal']) // open first
  expect(page.deals.map((d) => d.title)).toEqual(['Website redesign'])
  expect(store.overview().counts).toEqual({ contacts: 1, openDeals: 0, openTasks: 3, dueTasks: 0 })
})

test('the agent’s changes are undone in one go; later edits of yours are kept', () => {
  const { store, you, agent, notices } = setup()
  store.addContact(you(), { name: 'Rahul Sharma', company: 'Acme' })
  const a = agent()
  store.updateContact(a, 'c1', { status: 'lead' })
  store.addTask(a, { title: 'Send proposal', contact: 'c1' })
  store.addDeal(a, { title: 'Website', contact: 'c1' })
  store.addContact(a, { name: 'Priya Nair' })
  expect(store.lastAgentChanges()?.summary).toEqual(['Updated Rahul Sharma (status)', 'Added follow-up “Send proposal”', 'Added deal “Website”', 'Added Priya Nair'])
  expect(notices.at(-1)).toBe('Updated Rahul Sharma (status); Added follow-up “Send proposal”; Added deal “Website”; Added Priya Nair')
  // You rename Priya afterwards: that stays.
  store.updateContact(you(), 'c2', { name: 'Priya N.' })
  const r = store.undo()
  expect(r).toMatchObject({ undone: 3, kept: 1 })
  expect(store.contact('c1')?.status).toBeUndefined()
  expect(store.all().tasks).toEqual([])
  expect(store.all().deals).toEqual([])
  expect(store.contact('c2')?.name).toBe('Priya N.')
  expect(store.lastAgentChanges()).toBeUndefined()
  expect(() => store.undo()).toThrow('There’s nothing to undo.')
})

test('deleting a contact takes their timeline and follow-ups, keeps their deals, and can be undone', () => {
  const { store, you } = setup()
  const b = you()
  store.addContact(b, { name: 'Rahul Sharma', company: 'Acme' })
  store.log(b, { contact: 'c1', text: 'Met at expo' })
  store.addTask(b, { title: 'Call', contact: 'c1' })
  store.addDeal(b, { title: 'Website', contact: 'c1' })
  const del = you()
  store.deleteContact(del, 'c1')
  expect(store.all().contacts).toEqual([])
  expect(store.all().activities).toEqual([])
  expect(store.all().tasks).toEqual([])
  expect(store.all().deals[0]).toMatchObject({ title: 'Website', company: 'Acme' })
  expect(store.all().deals[0].contactId).toBeUndefined()
  expect(store.undo(del)).toMatchObject({ undone: 4, kept: 0 })
  expect(store.contactPage('c1')).toMatchObject({ activities: [{ text: 'Met at expo' }], tasks: [{ title: 'Call' }], deals: [{ title: 'Website', contactId: 'c1' }] })
})

test('saved on disk, with a week of daily backups, and a damaged file falls back to one', () => {
  const s = setup()
  s.store.addContact(s.you(), { name: 'Day One' })
  s.store.flush()
  for (let day = 1; day <= 9; day++) {
    s.clock.now += 86_400_000
    s.store.addContact(s.you(), { name: `Day ${day + 1}` })
    s.store.flush()
  }
  const backups = readdirSync(join(s.dir, 'backups')).sort()
  expect(backups).toHaveLength(7)
  expect(backups.at(-1)).toBe(`crm-${new Date(s.clock.now).toISOString().slice(0, 10)}.json`)
  const again = s.make()
  expect(again.all().contacts).toHaveLength(10)
  expect(again.addContact(again.begin('you'), { name: 'Next' }).id).toBe('c11') // ids carry on

  writeFileSync(join(s.dir, 'crm.json'), '{ broken')
  const recovered = s.make()
  expect(recovered.all().contacts.length).toBe(9) // the newest backup: before today's save
  expect(readdirSync(s.dir).some((f) => f.startsWith('crm.json.damaged-'))).toBe(true)
})

test('reminders for follow-ups that are due, once each', () => {
  const { store, you, clock } = setup()
  store.addContact(you(), { name: 'Rahul' })
  store.addTask(you(), { title: 'Call Rahul', contact: 'c1', due: '2026-10-02T10:30' })
  store.addTask(you(), { title: 'Tomorrow', due: '2026-10-03' })
  expect(store.dueForReminder()).toEqual([])
  clock.now += 31 * 60_000
  expect(store.dueForReminder().map((t) => [t.title, t.contactName])).toEqual([['Call Rahul', 'Rahul']])
  expect(store.dueForReminder()).toEqual([])
  // A new due date means a new reminder.
  store.updateTask(you(), 't1', { due: '2026-10-02T10:20' })
  expect(store.dueForReminder().map((t) => t.title)).toEqual(['Call Rahul'])
  clock.now = new Date(2026, 9, 3, 9, 0).getTime() // date only: 9:00 that day
  expect(store.dueForReminder().map((t) => t.title)).toEqual(['Tomorrow'])
})

test('importing contacts from Google, Outlook and vCard files, merging with who is there', () => {
  expect(columnField('E-mail 1 - Value')).toBe('email')
  expect(columnField('E-mail 1 - Label')).toBe('skip')
  expect(columnField('Organization Title')).toBe('title')
  expect(columnField('Organization 1 - Name')).toBe('company')
  expect(columnField('Shoe size')).toBeNull()

  const google = [
    'First Name,Middle Name,Last Name,File As,Organization Name,Organization Title,Birthday,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Shoe size',
    'Rahul,,Sharma,Rahul Sharma,Acme,CTO,1990-04-23,Met at expo,* myContacts ::: Investors,* Work,rahul@acme.com ::: r.sharma@gmail.com,Mobile,+91 98765 43210,42',
    ',,,,,,,,,,,,,',
    ',,,,Globex,,,,,,info@globex.com,,,',
  ].join('\n')
  const g = contactsFromCsv(google)
  expect(g.skipped).toBe(0)
  expect(g.contacts[0]).toMatchObject({
    name: 'Rahul Sharma',
    company: 'Acme',
    title: 'CTO',
    birthday: '1990-04-23',
    about: 'Met at expo',
    tags: ['Investors'],
    emails: ['rahul@acme.com', 'r.sharma@gmail.com'],
    phones: ['+91 98765 43210'],
    fields: { 'Shoe size': '42' },
  })
  expect(g.contacts[1]).toMatchObject({ name: 'info@globex.com', company: 'Globex' }) // no name: the email

  const outlook = contactsFromCsv('First Name,Last Name,Title,Job Title,Company,E-mail Address,Mobile Phone,Categories\nPriya,Nair,Ms.,Designer,Studio P,priya@studio.in,98200 11111,Friends;Design\n')
  expect(outlook.contacts[0]).toMatchObject({ name: 'Priya Nair', title: 'Designer', company: 'Studio P', tags: ['Friends', 'Design'], phones: ['98200 11111'] })

  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Mehta;Arjun;;;',
    'FN:Arjun Mehta',
    'ORG:Initech;Sales',
    'TITLE:Head of',
    '  Sales',
    'EMAIL;TYPE=INTERNET:arjun@initech.com',
    'TEL;TYPE=CELL:+1 555 0100',
    'NOTE:Likes cricket\\, chai',
    'CATEGORIES:client,vip',
    'BDAY:--04-23',
    'END:VCARD',
    'BEGIN:VCARD',
    'N:Rao;Kiran;;;',
    'END:VCARD',
  ].join('\r\n')
  expect(contactsFromVcard(vcf)).toEqual([
    { name: 'Arjun Mehta', company: 'Initech', title: 'Head of Sales', emails: ['arjun@initech.com'], phones: ['+1 555 0100'], about: 'Likes cricket, chai', tags: ['client', 'vip'], birthday: '04-23' },
    { name: 'Kiran Rao', emails: [], phones: [], tags: [] },
  ])

  // Into the CRM: Rahul is there already (by email): filled in, not duplicated.
  const { store, you, notices } = setup()
  store.addContact(you(), { name: 'Rahul S.', emails: ['rahul@acme.com'], title: 'Founder' })
  const before = notices.length
  const batch = you()
  expect(importContacts(store, batch, [...g.contacts, ...g.contacts])).toEqual({ added: 1, updated: 1, skipped: 0 })
  expect(notices.length).toBe(before + 1) // one notice for the whole import
  expect(store.contact('c1')).toMatchObject({ name: 'Rahul S.', title: 'Founder', company: 'Acme', emails: ['rahul@acme.com', 'r.sharma@gmail.com'], phones: ['+91 98765 43210'], tags: ['Investors'] })
  expect(store.all().contacts).toHaveLength(2)
  store.undo(batch)
  expect(store.all().contacts.map((c) => c.name)).toEqual(['Rahul S.'])
})

test('exporting as CSV', () => {
  const { store, you } = setup()
  const b = you()
  store.addContact(b, { name: 'Rahul Sharma', company: 'Acme, Inc.', emails: ['rahul@acme.com', 'r@x.com'], tags: ['vip'], fields: { City: 'Pune' } })
  store.addDeal(b, { title: 'Website', contact: 'c1', value: 12500, stage: 'proposal' })
  store.addTask(b, { title: 'Send proposal', contact: 'c1', deal: 'deal1', due: '2026-10-05' })
  const contacts = parseCsv(contactsCsv(store.all()))
  expect(contacts[0]).toEqual(['Name', 'Company', 'Title', 'Status', 'Email', 'Phone', 'Tags', 'Address', 'Website', 'Birthday', 'Notes', 'City', 'Added'])
  expect(contacts[1]).toEqual(['Rahul Sharma', 'Acme, Inc.', '', '', 'rahul@acme.com; r@x.com', '', 'vip', '', '', '', '', 'Pune', '2026-10-02'])
  expect(parseCsv(dealsCsv(store.all()))[1]).toEqual(['Website', 'Rahul Sharma', 'Acme, Inc.', 'Proposal', '12500', 'USD', '', '', '2026-10-02', ''])
  expect(parseCsv(tasksCsv(store.all()))[1]).toEqual(['Send proposal', 'Rahul Sharma', 'Website', '2026-10-05', 'no', ''])
  // And back in: the export reads as an import.
  expect(contactsFromCsv(contactsCsv(store.all())).contacts[0]).toMatchObject({ name: 'Rahul Sharma', company: 'Acme, Inc.', emails: ['rahul@acme.com', 'r@x.com'], fields: { City: 'Pune', Added: '2026-10-02' } })
})

test('due dates and money for people', () => {
  const now = new Date(2026, 9, 2, 10, 0) // Fri 2 Oct
  expect(dueTime('2026-10-02')).toBe(new Date(2026, 9, 2, 9, 0).getTime())
  expect(dueTime('2026-02-30')).toBeNull()
  expect(dueLabel('2026-10-02T15:30', now)).toBe('Today, 15:30')
  expect(dueLabel('2026-10-03', now)).toBe('Tomorrow')
  expect(dueLabel('2026-10-01', now)).toMatch(/^Overdue · /)
  expect(dueLabel('2026-10-06', now)).toMatch(/^Tue$/)
  expect(money(12500, 'USD')).toMatch(/12,500/)
  expect(money(undefined, 'USD')).toBe('')
  expect(existsSync('/nonexistent')).toBe(false)
})
