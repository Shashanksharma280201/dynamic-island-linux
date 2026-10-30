import {
  askRequest,
  cleanUrl,
  createSseParser,
  parseManifest,
  parseNotify,
  parseView,
  SILENCE_MS,
  type ConnectedConfig,
  type ConnectedManifest,
  type ConnectedNotify,
  type ConnectedState,
  type ConnectedView,
} from '@shared/connected'
import type { ToolRequest } from '@shared/types'

type Fetch = typeof fetch

/** A problem in plain words. Pure. */
export function connectedError(e: unknown): string {
  const msg = String((e as any)?.message ?? e)
  const status = (e as any)?.status
  if (status === 401 || status === 403) return 'It didn’t accept the token. Copy it again from the engine’s state/api_token file.'
  if (status === 404) return 'That address answered, but it isn’t a connected package (404).'
  if (typeof status === 'number') return `It answered ${status}.`
  if (/abort|timeout/i.test(msg)) return 'It didn’t answer in time.'
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(msg)) return 'Nothing is answering at that address. Is the engine running?'
  return msg.slice(0, 200)
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

/**
 * The connected package: reads its manifest, follows its event stream (a
 * fresh view on every change, heads-ups as notifications), reconnects when
 * the stream drops or goes quiet, and sends your answers back. The island's
 * activities (capsule and approval cards) are kept in step by `onView`.
 */
export class ConnectedHub {
  private st: ConnectedState = { configured: false, on: false, phase: 'off' }
  private abort: AbortController | null = null
  private running = false
  private wake: (() => void) | null = null
  private backoff = 2000
  private restarting = false

  constructor(
    private d: {
      config: () => ConnectedConfig
      /** The decrypted token ('' if none). */
      token: () => string
      onChange: () => void
      onView: (view: ConnectedView | null, manifest: ConnectedManifest | null) => void
      onNotify: (n: ConnectedNotify, manifest: ConnectedManifest) => void
      fetch?: Fetch
      now?: () => number
      /** Waits between reconnects (tests make it instant). */
      sleep?: (ms: number, wake: (fn: () => void) => void) => Promise<void>
    },
  ) {}

  private get fetch(): Fetch {
    return this.d.fetch ?? fetch
  }

  private ready(): boolean {
    const c = this.d.config()
    return c.on && !!c.url && !!this.d.token()
  }

  view(): ConnectedState {
    const c = this.d.config()
    return { ...this.st, configured: !!c.url && !!this.d.token(), on: c.on }
  }

  start(): void {
    if (this.running) return
    this.running = true
    void this.loop()
  }

  stop(): void {
    this.running = false
    this.abort?.abort()
    this.wake?.()
  }

  /** Settings changed: drop the connection and start over. */
  restart(): void {
    this.backoff = 2000
    this.restarting = true
    this.abort?.abort()
    this.wake?.()
  }

  private set(patch: Partial<ConnectedState>): void {
    this.st = { ...this.st, ...patch }
    this.d.onChange()
  }

  private sleep(ms: number): Promise<void> {
    if (this.d.sleep) return this.d.sleep(ms, (fn) => (this.wake = fn))
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms)
      this.wake = () => {
        clearTimeout(t)
        resolve()
      }
    })
  }

  private headers(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'dynamic-island' }
  }

  private async getJson(base: string, path: string, token: string, signal?: AbortSignal): Promise<any> {
    const r = await this.fetch(`${base}${path}`, { headers: this.headers(token), signal: signal ?? AbortSignal.timeout(8000) })
    if (!r.ok) throw new HttpError(r.status)
    return r.json()
  }

  private async loop(): Promise<void> {
    while (this.running) {
      if (!this.ready()) {
        if (this.st.phase !== 'off' || this.st.view) {
          this.set({ phase: 'off', error: undefined, view: undefined })
          this.d.onView(null, null)
        }
        await this.sleep(60_000)
        continue
      }
      try {
        this.restarting = false
        await this.follow()
        this.backoff = 2000
      } catch (e) {
        if (!this.running) break
        if (this.restarting) {
          // Settings changed: start over right away, no error to show.
          this.restarting = false
          continue
        }
        this.set({ phase: 'error', error: connectedError(e) })
        this.d.onView(null, null)
        if ((e as any)?.status === 401 || (e as any)?.status === 403) this.backoff = 5 * 60_000
      }
      if (!this.running) break
      await this.sleep(this.backoff)
      this.backoff = Math.min(this.backoff * 2, 30_000)
    }
  }

  /** One connection: the manifest, then the stream until it ends. */
  private async follow(): Promise<void> {
    const { url } = this.d.config()
    const token = this.d.token()
    const abort = (this.abort = new AbortController())
    this.set({ phase: 'connecting', error: undefined })
    const manifest = parseManifest(await this.getJson(url, '/island/manifest', token, AbortSignal.any([abort.signal, AbortSignal.timeout(8000)])))
    if (!manifest) throw new Error('That address doesn’t speak the island’s protocol (version 1).')
    this.set({ manifest })
    const r = await this.fetch(`${url}/island/events`, { headers: { ...this.headers(token), Accept: 'text/event-stream' }, signal: abort.signal })
    if (!r.ok) throw new HttpError(r.status)
    if (!r.body) throw new Error('The service sent no stream.')
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    const parse = createSseParser()
    let quiet: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(quiet)
      quiet = setTimeout(() => abort.abort(), SILENCE_MS)
    }
    arm()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        arm()
        for (const ev of parse(decoder.decode(value, { stream: true }))) {
          let data: any
          try {
            data = JSON.parse(ev.data)
          } catch {
            continue
          }
          if (ev.event === 'view') {
            const view = parseView(data?.data ?? data)
            if (!view) continue
            this.set({ phase: 'live', view, seenAt: (this.d.now ?? Date.now)(), error: undefined })
            this.d.onView(view, manifest)
          } else if (ev.event === 'notify') {
            const n = parseNotify(data?.data ?? data)
            if (n) this.d.onNotify(n, manifest)
          }
        }
      }
    } catch (e) {
      if (abort.signal.aborted && !this.restarting && this.running) throw new Error('The engine went quiet; reconnecting.')
      throw e
    } finally {
      clearTimeout(quiet)
      reader.releaseLock()
    }
    throw new Error('The engine closed the connection; reconnecting.')
  }

  private async post(path: string, body: object): Promise<{ ok: boolean; message: string }> {
    const { url } = this.d.config()
    const token = this.d.token()
    if (!url || !token) return { ok: false, message: 'No connected package is set up.' }
    try {
      const r = await this.fetch(`${url}${path}`, {
        method: 'POST',
        headers: { ...this.headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
      const j: any = await r.json().catch(() => ({}))
      if (!r.ok && !('ok' in j)) throw new HttpError(r.status)
      return { ok: j.ok === true, message: typeof j.message === 'string' ? j.message.slice(0, 200) : '' }
    } catch (e) {
      return { ok: false, message: connectedError(e) }
    }
  }

  /** Your answer to an approval card. Only ever called from your click or shortcut. */
  answer(askId: string, approve: boolean): Promise<{ ok: boolean; message: string }> {
    return this.post('/island/answer', { ask_id: askId, answer: approve ? 'approve' : 'reject', device: 'island' })
  }

  /** A button in the package's tab (after you confirmed it). */
  action(actionId: string): Promise<{ ok: boolean; message: string }> {
    return this.post('/island/action', { action_id: actionId, device: 'island' })
  }

  /** Try an address and token before saving them: null if they work, else why not. */
  async verify(rawUrl: string, token: string): Promise<string | null> {
    const url = cleanUrl(rawUrl)
    if (!url) return 'That doesn’t look like an address (http://127.0.0.1:8765).'
    try {
      return parseManifest(await this.getJson(url, '/island/manifest', token)) ? null : 'That address doesn’t speak the island’s protocol (version 1).'
    } catch (e) {
      return connectedError(e)
    }
  }
}

/**
 * Keep the island's activities in step with a view: the capsule while there's
 * something to show, one approval card per ask (its countdown fixed when it
 * first arrives), and no cards for asks that are gone. Pure apart from the
 * store calls it's handed.
 */
export function syncActivities(
  view: ConnectedView | null,
  manifest: ConnectedManifest | null,
  store: { upsert: (a: any) => void; remove: (id: string) => void; list: () => { id: string }[] },
  deadlines: Map<string, number>,
  now: number,
): void {
  const wanted = new Set<string>()
  if (view && manifest) {
    for (const ask of view.asks) {
      const req: ToolRequest = askRequest(ask, manifest, deadlines.get(ask.id) ?? now + ask.secondsLeft * 1000)
      deadlines.set(ask.id, req.connected!.deadline)
      wanted.add(req.id)
      store.upsert({ kind: 'approval', id: req.id, priority: 10, request: req })
    }
    if (view.status.show) store.upsert({ kind: 'connected', id: 'connected-status', priority: 1.5, status: { ...view.status, app: manifest.name, color: manifest.color } })
    else store.remove('connected-status')
  } else store.remove('connected-status')
  for (const a of store.list()) if (a.id.startsWith('connected-ask-') && !wanted.has(a.id)) store.remove(a.id)
  for (const id of [...deadlines.keys()]) if (!wanted.has(`connected-ask-${id}`)) deadlines.delete(id)
}
