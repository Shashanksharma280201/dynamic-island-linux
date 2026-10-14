/**
 * Services you can follow on the island (GitHub, Vercel, Stripe, Resend,
 * Notion, Cal.com, n8n): what each shows, read from its API's answers, and
 * what's new since the last look. Pure.
 */

export const SERVICE_IDS = ['github', 'vercel', 'stripe', 'resend', 'notion', 'calcom', 'n8n'] as const
export type ServiceId = (typeof SERVICE_IDS)[number]

export type ServiceInfo = {
  id: ServiceId
  name: string
  color: string
  /** What to paste in Settings. */
  fields: { key: 'token' | 'url'; label: string; placeholder: string; secret: boolean }[]
  /** Where to make one. */
  help: string
  /** The service's own page for "Open". */
  home: string
}

export const SERVICES: ServiceInfo[] = [
  {
    id: 'github',
    name: 'GitHub',
    color: '#f4505e',
    fields: [{ key: 'token', label: 'Token', placeholder: 'ghp_… or github_pat_…', secret: true }],
    help: 'A token that can read pull requests, commit statuses and Actions: github.com → Settings → Developer settings → Tokens.',
    home: 'https://github.com/pulls',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    color: '#7c5cff',
    fields: [{ key: 'token', label: 'Token', placeholder: 'Vercel access token', secret: true }],
    help: 'vercel.com → Account Settings → Tokens.',
    home: 'https://vercel.com/dashboard',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    color: '#0570de',
    fields: [{ key: 'token', label: 'Secret key', placeholder: 'sk_live_… or rk_live_… (restricted, read only)', secret: true }],
    help: 'dashboard.stripe.com → Developers → API keys. A restricted key with read access to Balance and Charges is enough.',
    home: 'https://dashboard.stripe.com/payments',
  },
  {
    id: 'resend',
    name: 'Resend',
    color: '#22c55e',
    fields: [{ key: 'token', label: 'API key', placeholder: 're_…', secret: true }],
    help: 'resend.com → API Keys.',
    home: 'https://resend.com/emails',
  },
  {
    id: 'notion',
    name: 'Notion',
    color: '#8c8c8c',
    fields: [{ key: 'token', label: 'Integration token', placeholder: 'ntn_… or secret_…', secret: true }],
    help: 'notion.so/my-integrations → New integration, then share the pages you want with it.',
    home: 'https://www.notion.so',
  },
  {
    id: 'calcom',
    name: 'Cal.com',
    color: '#c9956a',
    fields: [{ key: 'token', label: 'API key', placeholder: 'cal_live_…', secret: true }],
    help: 'app.cal.com → Settings → Developer → API keys.',
    home: 'https://app.cal.com/bookings/upcoming',
  },
  {
    id: 'n8n',
    name: 'n8n',
    color: '#f29b38',
    fields: [
      { key: 'url', label: 'Instance', placeholder: 'https://n8n.example.com', secret: false },
      { key: 'token', label: 'API key', placeholder: 'n8n API key', secret: true },
    ],
    help: 'Your n8n → Settings → n8n API → Create an API key.',
    home: '',
  },
]

export const serviceInfo = (id: ServiceId): ServiceInfo => SERVICES.find((s) => s.id === id)!

/** How often each is asked (ms): busy things often, calendars rarely. */
export const POLL_MS: Record<ServiceId, number> = {
  github: 5 * 60_000,
  vercel: 30_000,
  stripe: 30_000,
  resend: 60_000,
  notion: 5 * 60_000,
  calcom: 5 * 60_000,
  n8n: 15_000,
}

export type Ci = 'passing' | 'failing' | 'running' | 'none'

export type Row = {
  id: string
  title: string
  /** Second line, small. */
  sub?: string
  /** When (ms). */
  at?: number
  /** A coloured dot: good, bad, busy. */
  tone?: 'good' | 'bad' | 'busy' | 'none'
  /** On the right: "+$42.00", "Draft". */
  side?: string
  url?: string
}

/** What a service's card shows. */
export type ServiceSnapshot = {
  /** A headline number and what it is: "$1,240.50 available", "12 to review". */
  big?: { value: string; label: string }
  sections: { title: string; rows: Row[]; empty: string }[]
}

export type ServiceState = {
  id: ServiceId
  /** Turned on and has what it needs. */
  ready: boolean
  /** Last answer, if any. */
  snapshot?: ServiceSnapshot
  /** Why the last look failed. */
  error?: string
  checkedAt?: number
}

/** Something new worth a card on the island. */
export type ServiceEvent = { service: ServiceId; key: string; title: string; body: string; urgency: 'low' | 'normal' | 'critical'; url?: string }

// ------------------------------------------------------------------ helpers

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const ms = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
  const t = Date.parse(str(v))
  return Number.isFinite(t) ? t : undefined
}

/** "$1,240.50", "€9.99", "¥500" (amount in the smallest unit). Pure. */
export function money(amount: number, currency: string): string {
  const cur = currency.toUpperCase()
  const zero = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'].includes(cur)
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(zero ? amount : amount / 100)
  } catch {
    return `${(zero ? amount : amount / 100).toFixed(zero ? 0 : 2)} ${cur}`
  }
}

/** The worst of several CI states. Pure. */
export function worstCi(list: Ci[]): Ci {
  if (list.includes('failing')) return 'failing'
  if (list.includes('running')) return 'running'
  if (list.includes('passing')) return 'passing'
  return 'none'
}

/** A commit's CI from its check runs (GitHub Actions and other apps). Pure. */
export function ciFromChecks(json: any): Ci {
  const runs = arr(json?.check_runs)
  if (!runs.length) return 'none'
  if (runs.some((r) => ['failure', 'timed_out', 'action_required', 'startup_failure'].includes(r?.conclusion))) return 'failing'
  if (runs.some((r) => r?.status !== 'completed')) return 'running'
  return 'passing'
}

const ciTone = (c: Ci): Row['tone'] => (c === 'failing' ? 'bad' : c === 'running' ? 'busy' : c === 'passing' ? 'good' : 'none')

// ------------------------------------------------------------------ GitHub

export type GithubPr = { id: string; repo: string; number: number; title: string; url: string; draft: boolean; ci: Ci; at?: number }

/** Pull requests from a search answer (no CI yet). Pure. */
export function githubPrs(json: any): GithubPr[] {
  return arr(json?.items).map((i) => {
    const repo = str(i?.repository_url).split('/repos/')[1] ?? ''
    return { id: `${repo}#${num(i?.number)}`, repo, number: num(i?.number), title: str(i?.title), url: str(i?.html_url), draft: i?.draft === true, ci: 'none' as Ci, at: ms(i?.updated_at) }
  })
}

export function githubSnapshot(mine: GithubPr[], review: GithubPr[], reviewTotal: number): ServiceSnapshot {
  const row = (p: GithubPr): Row => ({ id: p.id, title: p.title, sub: `${p.repo}#${p.number}`, at: p.at, tone: ciTone(p.ci), side: p.draft ? 'Draft' : p.ci === 'none' ? undefined : p.ci, url: p.url })
  return {
    big: { value: String(reviewTotal), label: reviewTotal === 1 ? 'pull request to review' : 'pull requests to review' },
    sections: [
      { title: 'To review', rows: review.slice(0, 5).map(row), empty: 'Nothing waiting for your review' },
      { title: 'My pull requests', rows: mine.slice(0, 5).map(row), empty: 'No open pull requests' },
    ],
  }
}

/** CI that started failing (or passed again) on my PRs, and new review requests. Pure. */
export function githubEvents(before: { mine: GithubPr[]; review: GithubPr[] } | null, now: { mine: GithubPr[]; review: GithubPr[] }): ServiceEvent[] {
  if (!before) return []
  const out: ServiceEvent[] = []
  for (const p of now.mine) {
    const was = before.mine.find((x) => x.id === p.id)
    if (!was || was.ci === p.ci) continue
    if (p.ci === 'failing') out.push({ service: 'github', key: `ci-${p.id}-fail`, title: `CI failed: ${p.title}`, body: `${p.repo}#${p.number}`, urgency: 'critical', url: p.url })
    else if (p.ci === 'passing' && (was.ci === 'running' || was.ci === 'failing')) out.push({ service: 'github', key: `ci-${p.id}-pass`, title: `CI passed: ${p.title}`, body: `${p.repo}#${p.number}`, urgency: 'low', url: p.url })
  }
  for (const p of now.review) if (!before.review.some((x) => x.id === p.id)) out.push({ service: 'github', key: `review-${p.id}`, title: `Review requested: ${p.title}`, body: `${p.repo}#${p.number}`, urgency: 'normal', url: p.url })
  return out
}

// ------------------------------------------------------------------ Vercel

export type Deploy = { id: string; name: string; state: string; url: string; at?: number; message?: string; branch?: string }

export function vercelDeploys(json: any): Deploy[] {
  return arr(json?.deployments).map((d) => ({
    id: str(d?.uid),
    name: str(d?.name),
    state: str(d?.state ?? d?.readyState).toUpperCase(),
    url: d?.url ? `https://${str(d.url)}` : '',
    at: ms(d?.created ?? d?.createdAt),
    message: str(d?.meta?.githubCommitMessage) || undefined,
    branch: str(d?.meta?.githubCommitRef) || undefined,
  }))
}

const deployTone = (s: string): Row['tone'] => (s === 'READY' ? 'good' : s === 'ERROR' || s === 'CANCELED' ? 'bad' : s === 'BUILDING' || s === 'QUEUED' || s === 'INITIALIZING' ? 'busy' : 'none')
const deployWord = (s: string) => ({ READY: 'Ready', ERROR: 'Failed', CANCELED: 'Canceled', BUILDING: 'Building', QUEUED: 'Queued', INITIALIZING: 'Starting' })[s] ?? s.toLowerCase()

export function vercelSnapshot(d: Deploy[]): ServiceSnapshot {
  return {
    sections: [
      {
        title: 'Deployments',
        rows: d.slice(0, 5).map((x) => ({ id: x.id, title: x.name, sub: [x.branch, x.message].filter(Boolean).join(' · ') || undefined, at: x.at, tone: deployTone(x.state), side: deployWord(x.state), url: x.url })),
        empty: 'No deployments yet',
      },
    ],
  }
}

/** A deploy that finished since last time: failed (loud) or ready (quiet). Pure. */
export function vercelEvents(before: Deploy[] | null, now: Deploy[]): ServiceEvent[] {
  if (!before) return []
  const out: ServiceEvent[] = []
  for (const d of now) {
    const was = before.find((x) => x.id === d.id)
    if (was?.state === d.state) continue
    if (d.state === 'ERROR') out.push({ service: 'vercel', key: `deploy-${d.id}-error`, title: `Deploy failed: ${d.name}`, body: d.message ?? d.branch ?? '', urgency: 'critical', url: d.url })
    else if (d.state === 'READY' && (!was || was.state !== 'READY')) out.push({ service: 'vercel', key: `deploy-${d.id}-ready`, title: `Deployed: ${d.name}`, body: d.message ?? d.branch ?? '', urgency: 'low', url: d.url })
  }
  return out
}

// ------------------------------------------------------------------ Stripe

export type Charge = { id: string; amount: number; currency: string; description: string; at?: number; ok: boolean }

export function stripeCharges(json: any): Charge[] {
  return arr(json?.data).map((c) => ({
    id: str(c?.id),
    amount: num(c?.amount),
    currency: str(c?.currency) || 'usd',
    description: str(c?.description) || str(c?.billing_details?.name) || str(c?.receipt_email) || 'Payment',
    at: ms(c?.created),
    ok: c?.paid === true && c?.status === 'succeeded',
  }))
}

export function stripeSnapshot(balance: any, charges: Charge[]): ServiceSnapshot {
  const avail = arr(balance?.available)
  const main = avail.find((a) => num(a?.amount) !== 0) ?? avail[0]
  return {
    big: main ? { value: money(num(main.amount), str(main.currency)), label: 'available' } : undefined,
    sections: [
      {
        title: 'Payments',
        rows: charges.slice(0, 5).map((c) => ({ id: c.id, title: c.description, at: c.at, tone: c.ok ? 'good' : 'bad', side: `${c.ok ? '+' : ''}${money(c.amount, c.currency)}`, url: `https://dashboard.stripe.com/payments/${c.id}` })),
        empty: 'No payments yet',
      },
    ],
  }
}

export function stripeEvents(before: Charge[] | null, now: Charge[]): ServiceEvent[] {
  if (!before) return []
  return now
    .filter((c) => c.ok && !before.some((b) => b.id === c.id))
    .map((c) => ({ service: 'stripe' as const, key: `charge-${c.id}`, title: `+${money(c.amount, c.currency)}`, body: c.description, urgency: 'normal' as const, url: `https://dashboard.stripe.com/payments/${c.id}` }))
}

// ------------------------------------------------------------------ Resend

export function resendSnapshot(json: any): ServiceSnapshot {
  const data = arr(json?.data)
  return {
    big: { value: String(data.length), label: data.length === 1 ? 'recent email' : 'recent emails' },
    sections: [
      {
        title: 'Emails',
        rows: data.slice(0, 5).map((e) => {
          const ev = str(e?.last_event)
          return {
            id: str(e?.id),
            title: str(e?.subject) || '(no subject)',
            sub: arr(e?.to).join(', '),
            at: ms(e?.created_at),
            tone: ev === 'delivered' || ev === 'opened' || ev === 'clicked' ? 'good' : ev === 'bounced' || ev === 'complained' || ev === 'failed' ? 'bad' : 'busy',
            side: ev || undefined,
            url: `https://resend.com/emails/${str(e?.id)}`,
          } satisfies Row
        }),
        empty: 'No emails sent yet',
      },
    ],
  }
}

// ------------------------------------------------------------------ Notion

/** A Notion page's title: the property whose type is "title". Pure. */
export function notionTitle(page: any): string {
  for (const p of Object.values(page?.properties ?? {}) as any[]) if (p?.type === 'title') return arr(p.title).map((t) => str(t?.plain_text)).join('') || 'Untitled'
  return 'Untitled'
}

export function notionSnapshot(json: any): ServiceSnapshot {
  return {
    sections: [
      {
        title: 'Recently edited',
        rows: arr(json?.results)
          .slice(0, 5)
          .map((p) => ({ id: str(p?.id), title: `${p?.icon?.type === 'emoji' ? `${str(p.icon.emoji)} ` : ''}${notionTitle(p)}`, at: ms(p?.last_edited_time), url: str(p?.url) || undefined })),
        empty: 'No pages shared with the integration yet',
      },
    ],
  }
}

// ------------------------------------------------------------------ Cal.com

export function calSnapshot(json: any, now: number): ServiceSnapshot {
  const rows = arr(json?.data)
    .map((b) => ({ b, at: ms(b?.start ?? b?.startTime) ?? 0 }))
    .filter((x) => x.at >= now - 30 * 60_000)
    .sort((a, b) => a.at - b.at)
    .slice(0, 5)
    .map(({ b, at }) => ({
      id: String(b?.uid ?? b?.id ?? at),
      title: str(b?.title) || 'Booking',
      sub: arr(b?.attendees).map((a) => str(a?.name) || str(a?.email)).filter(Boolean).join(', ') || undefined,
      at,
      url: str(b?.meetingUrl) || str(b?.location).match(/^https?:\/\//)?.input || undefined,
    }))
  return { sections: [{ title: 'Upcoming', rows, empty: 'No calls scheduled' }] }
}

// ------------------------------------------------------------------ n8n

export type Execution = { id: string; workflowId: string; status: string; at?: number }

export function n8nExecutions(json: any): Execution[] {
  return arr(json?.data).map((e) => ({ id: String(e?.id ?? ''), workflowId: String(e?.workflowId ?? ''), status: str(e?.status) || (e?.finished ? 'success' : 'running'), at: ms(e?.stoppedAt ?? e?.startedAt) }))
}

export function n8nSnapshot(execs: Execution[], names: Record<string, string>, base: string): ServiceSnapshot {
  return {
    sections: [
      {
        title: 'Executions',
        rows: execs.slice(0, 5).map((e) => ({
          id: e.id,
          title: names[e.workflowId] ?? `Workflow ${e.workflowId}`,
          at: e.at,
          tone: e.status === 'success' ? 'good' : e.status === 'error' || e.status === 'crashed' || e.status === 'failed' ? 'bad' : 'busy',
          side: e.status,
          url: base ? `${base.replace(/\/$/, '')}/workflow/${e.workflowId}/executions/${e.id}` : undefined,
        })),
        empty: 'No executions yet',
      },
    ],
  }
}

export function n8nEvents(before: Execution[] | null, now: Execution[], names: Record<string, string>, base: string): ServiceEvent[] {
  if (!before) return []
  return now
    .filter((e) => (e.status === 'error' || e.status === 'crashed') && !before.some((b) => b.id === e.id && b.status === e.status))
    .map((e) => ({
      service: 'n8n' as const,
      key: `exec-${e.id}`,
      title: `Workflow failed: ${names[e.workflowId] ?? e.workflowId}`,
      body: 'Open it in n8n to see why.',
      urgency: 'critical' as const,
      url: base ? `${base.replace(/\/$/, '')}/workflow/${e.workflowId}/executions/${e.id}` : undefined,
    }))
}

/** Only links to the service's own sites (and your n8n) open from the island. Pure. */
export function safeServiceUrl(url: string, n8nBase = ''): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && n8nBase.startsWith('http:'))) return false
    const host = u.hostname
    const ok = ['github.com', 'vercel.com', 'vercel.app', 'stripe.com', 'resend.com', 'notion.so', 'notion.site', 'cal.com', 'zoom.us', 'meet.google.com', 'teams.microsoft.com']
    if (ok.some((h) => host === h || host.endsWith(`.${h}`))) return true
    return !!n8nBase && new URL(n8nBase).host === u.host
  } catch {
    return false
  }
}
