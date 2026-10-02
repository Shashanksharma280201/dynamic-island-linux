import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ContactForm, CrmChanges, CrmDealPage, CrmImported, DealForm, TaskForm } from '@shared/crm'
import type { DocEntry } from '@shared/docs'
import { CRM } from './crmChannels'
import type { CrmStore, TaskFilter } from './crm/store'
import { contactsCsv, contactsFromFile, dealsCsv, importContacts, tasksCsv } from './crm/io'
import { toCsv, xlsxRows } from './docs/sheet'

export { CRM }

const id = (v: unknown, prefix: 'c' | 'deal' | 't' | 'a'): string => {
  if (typeof v !== 'string' || !new RegExp(`^${prefix}\\d{1,9}$`).test(v)) throw new Error('Invalid record')
  return v
}
const optId = (v: unknown, prefix: 'c' | 'deal' | 't' | 'a') => (v == null || v === '' ? undefined : id(v, prefix))
const strs = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : undefined)
const s = (v: unknown, max = 20_000): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined)

/** Wires the CRM tab to the store. Each click is its own batch of changes. */
export function wireCrm(
  win: BrowserWindow,
  store: CrmStore,
  d: { saveFile: (bytes: Uint8Array, name: string, ext: string) => Promise<DocEntry> },
): { changed: (c?: CrmChanges) => void } {
  const changed = (c?: CrmChanges) => {
    if (!win.isDestroyed()) win.webContents.send(CRM.CHANGED, c ?? null)
  }
  const you = () => store.begin('you')
  ipcMain.handle(CRM.OVERVIEW, () => store.overview())
  ipcMain.handle(CRM.CONTACTS, (_e, query, status) => store.search(s(query, 200) ?? '', { status: s(status, 20) || undefined }))
  ipcMain.handle(CRM.CONTACT, (_e, cid) => store.contactPage(id(cid, 'c')))
  ipcMain.handle(CRM.SAVE_CONTACT, (_e, cid, f: ContactForm) => {
    if (!f || typeof f !== 'object') throw new Error('Invalid contact')
    const input = {
      name: s(f.name, 200),
      company: s(f.company, 200) ?? '',
      title: s(f.title, 200) ?? '',
      emails: strs(f.emails) ?? [],
      phones: strs(f.phones) ?? [],
      tags: strs(f.tags) ?? [],
      status: s(f.status, 20) ?? '',
      address: s(f.address, 400) ?? '',
      website: s(f.website, 300) ?? '',
      birthday: s(f.birthday, 10) ?? '',
      about: s(f.about) ?? '',
    }
    return cid ? store.updateContact(you(), id(cid, 'c'), input) : store.addContact(you(), input)
  })
  ipcMain.handle(CRM.LOG, (_e, a) => {
    if (!a || typeof a !== 'object') throw new Error('Invalid entry')
    return store.log(you(), { kind: s(a.kind, 20), text: s(a.text) ?? '', contact: optId(a.contactId, 'c'), deal: optId(a.dealId, 'deal') })
  })
  ipcMain.handle(CRM.TASKS, (_e, filter) => {
    const f = (s(filter, 20) || 'open') as TaskFilter
    if (!['open', 'overdue', 'today', 'upcoming', 'done', 'all'].includes(f)) throw new Error('Invalid filter')
    return store.tasks(f)
  })
  ipcMain.handle(CRM.SAVE_TASK, (_e, tid, f: TaskForm) => {
    if (!f || typeof f !== 'object') throw new Error('Invalid follow-up')
    if (tid) return store.updateTask(you(), id(tid, 't'), { title: s(f.title, 300), due: f.due === null ? null : s(f.due, 16), done: typeof f.done === 'boolean' ? f.done : undefined })
    return store.addTask(you(), { title: s(f.title, 300) ?? '', due: s(f.due, 16) || undefined, contact: optId(f.contactId, 'c'), deal: optId(f.dealId, 'deal') })
  })
  ipcMain.handle(CRM.DEALS, () => store.deals())
  ipcMain.handle(CRM.DEAL, (_e, did): CrmDealPage => {
    const deal = store.deals().find((x) => x.id === id(did, 'deal'))
    if (!deal) throw new Error('That deal was deleted.')
    const h = store.dealHistory(deal.id)
    return { deal, activities: h.activities, tasks: store.tasks('all').filter((t) => t.dealId === deal.id) }
  })
  ipcMain.handle(CRM.SAVE_DEAL, (_e, did, f: DealForm) => {
    if (!f || typeof f !== 'object') throw new Error('Invalid deal')
    const input = {
      title: s(f.title, 300),
      contact: f.contactId === null ? null : optId(f.contactId, 'c'),
      value: f.value === null ? null : typeof f.value === 'number' ? f.value : undefined,
      currency: s(f.currency, 3),
      stage: s(f.stage, 20),
      expectedClose: f.expectedClose === null ? null : s(f.expectedClose, 10),
      notes: s(f.notes),
    }
    return did ? store.updateDeal(you(), id(did, 'deal'), input) : store.addDeal(you(), input)
  })
  ipcMain.handle(CRM.DELETE, (_e, what, rid) => {
    const b = you()
    if (what === 'contact') store.deleteContact(b, id(rid, 'c'))
    else if (what === 'deal') store.deleteDeal(b, id(rid, 'deal'))
    else if (what === 'task') store.deleteTask(b, id(rid, 't'))
    else if (what === 'activity') store.deleteActivity(b, id(rid, 'a'))
    else throw new Error('Invalid record')
    return b
  })
  ipcMain.handle(CRM.UNDO, (_e, batch) => store.undo(s(batch, 60) || undefined))
  ipcMain.handle(CRM.IMPORT, async (): Promise<CrmImported | null> => {
    // Tests choose the file without the system dialog.
    const preset = process.env.DI_CRM_PICK
    const path =
      preset ??
      (
        await dialog.showOpenDialog({
          title: 'Import contacts',
          buttonLabel: 'Import',
          properties: ['openFile'],
          filters: [{ name: 'Contacts (CSV, Excel, vCard)', extensions: ['csv', 'xlsx', 'vcf'] }],
        })
      ).filePaths[0]
    if (!path) return null
    const bytes = await readFile(path)
    if (bytes.length > 50 * 1024 * 1024) throw new Error('That file is too big to import.')
    const text = /\.xlsx$/i.test(path) ? toCsv(await xlsxRows(new Uint8Array(bytes))) : bytes.toString('utf8')
    const parsed = contactsFromFile(path, text)
    if (!parsed.contacts.length) throw new Error(`No contacts found in ${basename(path)}. A CSV needs a header row with a name or email column.`)
    const batch = you()
    const r = importContacts(store, batch, parsed.contacts)
    return { ...r, skipped: r.skipped + parsed.skipped, batch, file: basename(path) }
  })
  ipcMain.handle(CRM.EXPORT, (_e, what) => {
    const csv = what === 'deals' ? dealsCsv(store.all()) : what === 'tasks' ? tasksCsv(store.all()) : contactsCsv(store.all())
    const day = new Date().toISOString().slice(0, 10)
    return d.saveFile(Buffer.from(csv), `CRM ${what === 'deals' || what === 'tasks' ? what : 'contacts'} ${day}`, 'csv')
  })
  ipcMain.handle(CRM.SET_CURRENCY, (_e, code) => store.setCurrency(s(code, 3) ?? ''))
  return { changed }
}
