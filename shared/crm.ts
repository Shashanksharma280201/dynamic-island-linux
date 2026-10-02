/**
 * The CRM: people, deals, follow-ups and the history of what happened, kept
 * on this computer. Usable on its own (the CRM tab) and by the agent.
 */

/** Where someone stands with you. */
export type ContactStatus = 'lead' | 'customer' | 'partner' | 'other'
export const CONTACT_STATUSES: ContactStatus[] = ['lead', 'customer', 'partner', 'other']
export const STATUS_LABEL: Record<ContactStatus, string> = { lead: 'Lead', customer: 'Customer', partner: 'Partner', other: 'Other' }

export type Contact = {
  id: string
  name: string
  company?: string
  /** Job title. */
  title?: string
  emails: string[]
  phones: string[]
  tags: string[]
  status?: ContactStatus
  address?: string
  website?: string
  /** "1990-04-23", or "04-23" without the year. */
  birthday?: string
  /** Notes about them (not the timeline). */
  about?: string
  /** Anything else, like "LinkedIn" or "Account no.". */
  fields: Record<string, string>
  createdAt: number
  updatedAt: number
}

/** The pipeline a deal moves through. */
export type DealStage = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export const DEAL_STAGES: DealStage[] = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']
export const STAGE_LABEL: Record<DealStage, string> = {
  new: 'New',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}
export const OPEN_STAGES: DealStage[] = ['new', 'qualified', 'proposal', 'negotiation']

export type Deal = {
  id: string
  title: string
  contactId?: string
  company?: string
  value?: number
  /** ISO 4217, like "USD" or "INR" (the CRM's own when missing). */
  currency?: string
  stage: DealStage
  /** "2026-11-30". */
  expectedClose?: string
  notes?: string
  createdAt: number
  updatedAt: number
  /** When it was won or lost. */
  closedAt?: number
}

/** A follow-up to do. */
export type Task = {
  id: string
  title: string
  contactId?: string
  dealId?: string
  /** "2026-10-03", or "2026-10-03T15:30" for a time (local). */
  due?: string
  done: boolean
  doneAt?: number
  createdAt: number
}

export type ActivityKind = 'note' | 'call' | 'meeting' | 'email' | 'message'
export const ACTIVITY_KINDS: ActivityKind[] = ['note', 'call', 'meeting', 'email', 'message']
export const KIND_LABEL: Record<ActivityKind, string> = { note: 'Note', call: 'Call', meeting: 'Meeting', email: 'Email', message: 'Message' }

/** Something that happened: a call, a meeting, a note… */
export type Activity = {
  id: string
  kind: ActivityKind
  text: string
  contactId?: string
  dealId?: string
  /** When it happened. */
  at: number
  createdAt: number
}

/** Who made a change: you (in the CRM tab) or the agent. */
export type ChangeBy = 'you' | 'agent'

/** The agent's latest changes, which can be undone in one go. */
export type CrmChanges = { id: string; by: ChangeBy; at: number; summary: string[]; undone?: boolean }

/** A contact in a list. */
export type ContactSummary = Pick<Contact, 'id' | 'name' | 'company' | 'title' | 'status' | 'tags'> & {
  email?: string
  phone?: string
  /** The last thing logged with them. */
  lastTouch?: number
  openTasks: number
  openDeals: number
}

/** Everything about one contact. */
export type ContactPage = {
  contact: Contact
  activities: Activity[]
  tasks: Task[]
  deals: Deal[]
}

/** A deal in a list, with its contact's name. */
export type DealSummary = Deal & { contactName?: string }

/** A follow-up in a list, with who and what it's about. */
export type TaskSummary = Task & { contactName?: string; dealTitle?: string }

/** What the CRM tab shows first. */
export type CrmOverview = {
  currency: string
  counts: { contacts: number; openDeals: number; openTasks: number; dueTasks: number }
  /** The agent's last changes, if they can still be undone. */
  lastAgentChanges?: CrmChanges
}

/** A due date for people: "Today", "Tomorrow", "Overdue · 3 Oct", "Fri 10 Oct, 15:30". Pure (local time). */
export function dueLabel(due: string | undefined, now: Date): string {
  if (!due) return ''
  const when = dueTime(due)
  if (!when) return due
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(new Date(when)) - day(now)) / 86_400_000)
  const d = new Date(when)
  const time = due.includes('T') ? `, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  if (days < 0) return `Overdue · ${date}${time}`
  if (days === 0) return `Today${time}`
  if (days === 1) return `Tomorrow${time}`
  if (days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })}${time}`
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}${time}`
}

/**
 * When a due date falls (local time): its time, or 9:00 that morning for a
 * date alone. Null if it isn't a date. Pure.
 */
export function dueTime(due: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(due.trim())
  if (!m) return null
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '09', m[5] ?? '00'].map(Number)
  const t = new Date(y, mo - 1, d, h, mi)
  return t.getMonth() === mo - 1 && t.getDate() === d ? t.getTime() : null
}

/** "$12,500" in the CRM's currency. Pure. */
export function money(value: number | undefined, currency: string): string {
  if (value == null) return ''
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}
