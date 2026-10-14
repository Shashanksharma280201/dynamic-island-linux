import {
  calSnapshot,
  ciFromChecks,
  githubEvents,
  githubPrs,
  githubSnapshot,
  n8nEvents,
  n8nExecutions,
  n8nSnapshot,
  notionSnapshot,
  POLL_MS,
  resendSnapshot,
  serviceInfo,
  SERVICE_IDS,
  stripeCharges,
  stripeEvents,
  stripeSnapshot,
  vercelDeploys,
  vercelEvents,
  vercelSnapshot,
  type GithubPr,
  type ServiceEvent,
  type ServiceId,
  type ServiceSnapshot,
  type ServiceState,
} from '@shared/services'

export type ServiceConfig = { on: boolean; url: string; secret: string }
export type ServicesConfig = Record<ServiceId, ServiceConfig>

/** Saved service settings, checked (tokens stay encrypted here). Pure. */
export function parseServices(raw: any): ServicesConfig {
  const out = {} as ServicesConfig
  for (const id of SERVICE_IDS) {
    const r = raw?.[id]
    out[id] = { on: r?.on === true, url: typeof r?.url === 'string' ? r.url.slice(0, 300) : '', secret: typeof r?.secret === 'string' ? r.secret : '' }
  }
  return out
}

const API: Record<ServiceId, string> = {
  github: 'https://api.github.com',
  vercel: 'https://api.vercel.com',
  stripe: 'https://api.stripe.com',
  resend: 'https://api.resend.com',
  notion: 'https://api.notion.com',
  calcom: 'https://api.cal.com',
  n8n: '',
}

/** Where a service's API is (tests point them all at one fake server). */
function apiBase(id: ServiceId, url: string): string {
  const fake = process.env.DI_SERVICES_BASE
  if (fake) return `${fake.replace(/\/$/, '')}/${id}`
  return id === 'n8n' ? url.replace(/\/$/, '') : API[id]
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** A problem in plain words. Pure. */
export function serviceError(e: unknown, name: string): string {
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403) return `${name} didn’t accept the key (${e.status}). Check it in Settings.`
    if (e.status === 404) return `${name} answered “not found” (404). Check the address.`
    if (e.status === 429) return `${name} asked to slow down; trying again later.`
    return `${name} answered ${e.status}.`
  }
  const msg = String((e as any)?.message ?? e)
  if (/abort|timeout/i.test(msg)) return `${name} didn’t answer in time.`
  return `Couldn’t reach ${name} (${msg}).`
}

type Memory = { github?: { mine: GithubPr[]; review: GithubPr[] }; vercel?: ReturnType<typeof vercelDeploys>; stripe?: ReturnType<typeof stripeCharges>; n8n?: ReturnType<typeof n8nExecutions>; n8nNames?: Record<string, string> }

/**
 * The services you follow: each is asked on its own schedule while it's on
 * and has its key, its card kept fresh, and anything new worth knowing
 * (a failed deploy, CI breaking, a review request, a payment, a failed
 * workflow) raised as an event. The first look after starting is quiet.
 */
export class ServiceHub {
  private states = new Map<ServiceId, ServiceState>()
  private timers = new Map<ServiceId, ReturnType<typeof setTimeout>>()
  private memory: Memory = {}
  private running = false

  constructor(
    private d: {
      config: () => ServicesConfig
      /** The decrypted key of a service ('' if none). */
      token: (id: ServiceId) => string
      onChange: () => void
      onEvent: (e: ServiceEvent) => void
      fetch?: typeof fetch
      now?: () => number
    },
  ) {}

  private ready(id: ServiceId): boolean {
    const c = this.d.config()[id]
    return c.on && !!this.d.token(id) && (id !== 'n8n' || !!c.url || !!process.env.DI_SERVICES_BASE)
  }

  view(): ServiceState[] {
    return SERVICE_IDS.filter((id) => this.d.config()[id].on).map((id) => ({ ...(this.states.get(id) ?? { id, ready: false }), id, ready: this.ready(id) }))
  }

  start(): void {
    this.running = true
    SERVICE_IDS.forEach((id, i) => this.schedule(id, 1500 + i * 700))
  }

  stop(): void {
    this.running = false
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  /** Settings changed for a service: forget what it knew and look again soon. */
  restart(id: ServiceId): void {
    this.states.delete(id)
    if (id === 'github') delete this.memory.github
    if (id === 'vercel') delete this.memory.vercel
    if (id === 'stripe') delete this.memory.stripe
    if (id === 'n8n') delete this.memory.n8n
    this.d.onChange()
    if (this.running) this.schedule(id, 300)
  }

  refresh(id: ServiceId): Promise<void> {
    return this.poll(id)
  }

  private schedule(id: ServiceId, ms: number): void {
    clearTimeout(this.timers.get(id))
    this.timers.set(
      id,
      setTimeout(() => void this.poll(id), ms),
    )
  }

  private async poll(id: ServiceId): Promise<void> {
    if (!this.ready(id)) {
      if (this.running) this.schedule(id, 60_000)
      return
    }
    const now = (this.d.now ?? Date.now)()
    let next = POLL_MS[id]
    try {
      const { snapshot, events, busy } = await this.look(id, this.d.config()[id], this.d.token(id))
      this.states.set(id, { id, ready: true, snapshot, checkedAt: now })
      for (const e of events) this.d.onEvent(e)
      // Look more often while something's running (a CI, a build).
      if (busy) next = Math.min(next, 60_000)
    } catch (e) {
      const prev = this.states.get(id)
      this.states.set(id, { id, ready: true, snapshot: prev?.snapshot, error: serviceError(e, serviceInfo(id).name), checkedAt: now })
      if (e instanceof HttpError && (e.status === 401 || e.status === 403)) next = Math.max(next, 10 * 60_000)
    }
    this.d.onChange()
    if (this.running) this.schedule(id, next)
  }

  /** Try a key before saving it: null if it works, else why not. */
  async verify(id: ServiceId, cfg: ServiceConfig, token: string): Promise<string | null> {
    try {
      await this.look(id, cfg, token, true)
      return null
    } catch (e) {
      return serviceError(e, serviceInfo(id).name)
    }
  }

  private async look(id: ServiceId, cfg: ServiceConfig, token: string, dry = false): Promise<{ snapshot: ServiceSnapshot; events: ServiceEvent[]; busy?: boolean }> {
    const base = apiBase(id, cfg.url)
    const f = this.d.fetch ?? fetch
    const get = async (path: string, headers: Record<string, string>, init: RequestInit = {}): Promise<any> => {
      const r = await f(`${base}${path}`, { ...init, headers: { 'User-Agent': 'dynamic-island', ...headers, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(10_000) })
      if (!r.ok) throw new HttpError(r.status, `HTTP ${r.status}`)
      return r.json()
    }
    const bearer = { Authorization: `Bearer ${token}` }
    const now = (this.d.now ?? Date.now)()
    switch (id) {
      case 'github': {
        const h = { ...bearer, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
        const q = (s: string) => `/search/issues?q=${encodeURIComponent(s)}&per_page=10&sort=updated`
        const [mineJson, reviewJson] = await Promise.all([get(q('is:pr is:open author:@me archived:false'), h), get(q('is:pr is:open review-requested:@me archived:false'), h)])
        const mine = githubPrs(mineJson)
        const review = githubPrs(reviewJson)
        if (!dry)
          await Promise.all(
            mine.slice(0, 5).map(async (p) => {
              try {
                const pr = await get(`/repos/${p.repo}/pulls/${p.number}`, h)
                const sha = pr?.head?.sha
                if (sha) p.ci = ciFromChecks(await get(`/repos/${p.repo}/commits/${sha}/check-runs?per_page=50`, h))
              } catch {
                // no CI to show for this one
              }
            }),
          )
        const events = dry ? [] : githubEvents(this.memory.github ?? null, { mine, review })
        if (!dry) this.memory.github = { mine, review }
        return { snapshot: githubSnapshot(mine, review, Number(reviewJson?.total_count) || review.length), events, busy: mine.some((p) => p.ci === 'running') }
      }
      case 'vercel': {
        const deploys = vercelDeploys(await get('/v6/deployments?limit=6', bearer))
        const events = dry ? [] : vercelEvents(this.memory.vercel ?? null, deploys)
        if (!dry) this.memory.vercel = deploys
        return { snapshot: vercelSnapshot(deploys), events, busy: deploys.some((d) => d.state === 'BUILDING' || d.state === 'QUEUED') }
      }
      case 'stripe': {
        const [balance, chargesJson] = await Promise.all([get('/v1/balance', bearer), get('/v1/charges?limit=6', bearer)])
        const charges = stripeCharges(chargesJson)
        const events = dry ? [] : stripeEvents(this.memory.stripe ?? null, charges)
        if (!dry) this.memory.stripe = charges
        return { snapshot: stripeSnapshot(balance, charges), events }
      }
      case 'resend':
        return { snapshot: resendSnapshot(await get('/emails?limit=6', bearer)), events: [] }
      case 'notion': {
        const body = JSON.stringify({ page_size: 6, sort: { direction: 'descending', timestamp: 'last_edited_time' }, filter: { property: 'object', value: 'page' } })
        const json = await get('/v1/search', { ...bearer, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, { method: 'POST', body })
        return { snapshot: notionSnapshot(json), events: [] }
      }
      case 'calcom':
        return { snapshot: calSnapshot(await get('/v2/bookings?status=upcoming&take=10', { ...bearer, 'cal-api-version': '2024-08-13' }), now), events: [] }
      case 'n8n': {
        const h = { 'X-N8N-API-KEY': token, Accept: 'application/json' }
        const execs = n8nExecutions(await get('/api/v1/executions?limit=6&includeData=false', h))
        const names = (this.memory.n8nNames ??= {})
        await Promise.all(
          [...new Set(execs.map((e) => e.workflowId))]
            .filter((w) => w && !names[w])
            .map(async (w) => {
              try {
                names[w] = String((await get(`/api/v1/workflows/${encodeURIComponent(w)}`, h))?.name ?? '') || `Workflow ${w}`
              } catch {
                // keep the id
              }
            }),
        )
        const site = process.env.DI_SERVICES_BASE ? '' : cfg.url
        const events = dry ? [] : n8nEvents(this.memory.n8n ?? null, execs, names, site)
        if (!dry) this.memory.n8n = execs
        return { snapshot: n8nSnapshot(execs, names, site), events, busy: execs.some((e) => e.status === 'running' || e.status === 'waiting') }
      }
    }
  }
}
