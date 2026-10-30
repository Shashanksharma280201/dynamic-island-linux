import { Platform } from 'react-native'
import EventSource from 'react-native-sse'
import { Directory, File, Paths } from 'expo-file-system'
import type { PhoneIncoming, PhoneView } from './islandTypes'
import type { PhoneCall, PhoneTopic } from '../../shared/phone'
import { isIslandHello, type Pairing, type Side } from './protocol'

/** The island's live view on this phone. */
export type Live = { phase: 'off' | 'connecting' | 'live' | 'offline'; view?: PhoneView; seenAt?: number; error?: string }

export type Phase = 'finding' | 'ready' | 'offline'
export type LinkState = { phase: Phase; error?: string; url?: string }
export type SendResult = { ok: boolean; message: string; name?: string }
export type Outgoing = { uri: string; name: string; size: number }

/** "Pixel 9": what the island's card says it came from. */
export const DEVICE = (() => {
  const c: any = Platform.constants ?? {}
  const model = typeof c.Model === 'string' ? c.Model : ''
  const brand = typeof c.Brand === 'string' ? c.Brand : ''
  if (!model) return 'Android phone'
  return model.toLowerCase().startsWith(brand.toLowerCase()) || !brand ? model : `${brand[0].toUpperCase()}${brand.slice(1)} ${model}`
})()

/** Plain words for what went wrong. */
export function linkError(status: number | undefined, message?: string): string {
  if (status === 401 || status === 403) return 'The computer didn’t accept this phone. Scan its QR again (Settings → Phone Drop).'
  if (status === 507) return 'Not enough space on the computer for that.'
  if (status) return `The computer answered ${status}.`
  if (message && /abort|timeout|network|failed/i.test(message)) return 'Can’t reach your computer. Is it awake, on the same Wi-Fi (or Tailscale), with Phone Drop on?'
  return message || 'Can’t reach your computer.'
}

async function call(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 4000)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** The first promise to succeed (like Promise.any, which not every JS engine has). */
function firstOf<T>(tries: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let left = tries.length
    if (!left) reject(new Error('nothing to try'))
    for (const t of tries)
      t.then(resolve, (e) => {
        if (--left === 0) reject(e)
      })
  })
}

/** The first of the pairing's addresses that answers as an island, or null and why. */
export async function findComputer(p: Pairing): Promise<{ url: string; name: string } | { error: string }> {
  let last = ''
  const tries = p.urls.map(async (url) => {
    try {
      const r = await call(`${url}/drop/hello`, { headers: { Authorization: `Bearer ${p.token}` }, timeoutMs: 3500 })
      if (!r.ok) {
        last = linkError(r.status)
        throw new Error(last)
      }
      const j = await r.json()
      if (!isIslandHello(j)) throw new Error((last = 'That address isn’t a Dynamic Island.'))
      return { url, name: j.name }
    } catch (e: any) {
      last ||= linkError(undefined, String(e?.message ?? e))
      throw e
    }
  })
  try {
    return await firstOf(tries)
  } catch {
    return { error: last || 'Can’t reach your computer.' }
  }
}

/**
 * The connection to your computer's island: which of its addresses answers,
 * the nudges while a file heads for the edge, and the files themselves.
 */
export class DropLink {
  state: LinkState = { phase: 'finding' }
  live: Live = { phase: 'off' }
  private listeners = new Set<(s: LinkState) => void>()
  private liveListeners = new Set<(l: Live) => void>()
  private incomingListeners = new Set<(f: PhoneIncoming) => void>()
  private pushListeners = new Map<PhoneTopic, Set<(data: unknown) => void>>()
  private es: EventSource<'view' | 'incoming' | 'push'> | null = null
  private poll: ReturnType<typeof setInterval> | null = null
  private finding: Promise<string | null> | null = null

  constructor(readonly pairing: Pairing) {}

  private set(s: LinkState) {
    this.state = s
    for (const l of this.listeners) l(s)
  }

  subscribe(l: (s: LinkState) => void): () => void {
    this.listeners.add(l)
    l(this.state)
    return () => this.listeners.delete(l)
  }

  private get auth() {
    return { Authorization: `Bearer ${this.pairing.token}` }
  }

  /** Look for the computer (again). */
  find(): Promise<string | null> {
    this.finding ??= (async () => {
      if (this.state.phase !== 'ready') this.set({ phase: 'finding' })
      const r = await findComputer(this.pairing)
      this.finding = null
      if ('error' in r) {
        this.set({ phase: 'offline', error: r.error })
        return null
      }
      this.set({ phase: 'ready', url: r.url })
      return r.url
    })()
    return this.finding
  }

  private async url(): Promise<string | null> {
    return this.state.url ?? (await this.find())
  }

  /** A file is heading for the edge: the computer's edge lights up. Fire and forget. */
  async approach(id: string, side: Side, at: number, files: { name: string; size: number }[], thumb?: string): Promise<void> {
    const url = await this.url()
    if (!url) return
    await call(`${url}/drop/approach`, {
      method: 'POST',
      headers: { ...this.auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, side, at, files, thumb, device: DEVICE }),
      timeoutMs: 2500,
    }).catch(() => {})
  }

  /** It went back. */
  async cancel(id: string): Promise<void> {
    const url = this.state.url
    if (!url) return
    await call(`${url}/drop/cancel`, { method: 'POST', headers: { ...this.auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), timeoutMs: 2500 }).catch(() => {})
  }

  /** Send the file's bytes; progress from 0 to 1. */
  async send(id: string, index: number, f: Outgoing, onProgress: (p: number) => void, signal?: AbortSignal): Promise<SendResult> {
    let url = await this.url()
    if (!url) return { ok: false, message: this.state.error ?? 'Can’t reach your computer.' }
    const target = () => `${url}/drop/file?id=${id}&index=${index}&name=${encodeURIComponent(f.name)}&size=${f.size}`
    const attempt = async (): Promise<SendResult> => {
      const task = new File(f.uri).createUploadTask(target(), {
        httpMethod: 'PUT',
        headers: { ...this.auth, 'Content-Type': 'application/octet-stream' },
        onProgress: ({ bytesSent, totalBytes }) => onProgress(totalBytes ? bytesSent / totalBytes : 0),
        signal,
      })
      const r = await task.uploadAsync()
      let j: any = {}
      try {
        j = JSON.parse(r.body)
      } catch {
        // not JSON
      }
      if (r.status >= 200 && r.status < 300 && j.ok) return { ok: true, message: '', name: j.name }
      return { ok: false, message: typeof j.message === 'string' ? j.message : linkError(r.status) }
    }
    try {
      return await attempt()
    } catch (e: any) {
      if (signal?.aborted) return { ok: false, message: 'Stopped' }
      // The computer may have moved to another address (Wi-Fi to Tailscale): look again once.
      this.set({ phase: 'finding' })
      url = await this.find()
      if (!url) return { ok: false, message: this.state.error ?? linkError(undefined, String(e?.message ?? e)) }
      try {
        return await attempt()
      } catch (e2: any) {
        return { ok: false, message: linkError(undefined, String(e2?.message ?? e2)) }
      }
    }
  }

  // ---- The island, live ----

  private setLive(patch: Partial<Live>) {
    this.live = { ...this.live, ...patch }
    for (const l of this.liveListeners) l(this.live)
  }

  subscribeLive(l: (live: Live) => void): () => void {
    this.liveListeners.add(l)
    l(this.live)
    return () => this.liveListeners.delete(l)
  }

  /** A file the computer is sending (it may arrive again after a reconnect: callers keep track of ids). */
  onIncoming(l: (f: PhoneIncoming) => void): () => void {
    this.incomingListeners.add(l)
    return () => this.incomingListeners.delete(l)
  }

  /** What the island says when something of `topic` changes (Claude's reply so far, new mail…). */
  onPush(topic: PhoneTopic, l: (data: unknown) => void): () => void {
    let set = this.pushListeners.get(topic)
    if (!set) this.pushListeners.set(topic, (set = new Set()))
    set.add(l)
    return () => set!.delete(l)
  }

  /** One of the island's own functions (notes, chats, Claude, trading…), as its window would call it. */
  async call<T = unknown>(fn: PhoneCall, ...args: unknown[]): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    const url = await this.url()
    if (!url) return { ok: false, message: this.state.error ?? 'Can’t reach your computer.' }
    try {
      const r = await call(`${url}/island/call`, {
        method: 'POST',
        headers: { ...this.auth, 'Content-Type': 'application/json', 'X-Island-Device': DEVICE },
        body: JSON.stringify({ fn, args }),
        timeoutMs: 20_000,
      })
      const j: any = await r.json().catch(() => ({}))
      if (r.ok && j.ok) return { ok: true, value: j.value as T }
      return { ok: false, message: typeof j.message === 'string' ? j.message : linkError(r.status) }
    } catch (e: any) {
      return { ok: false, message: linkError(undefined, String(e?.message ?? e)) }
    }
  }

  /** Listen to the island: its view on every change, files it sends. Reconnects by itself. */
  async startLive(): Promise<void> {
    this.stopLive()
    this.setLive({ phase: 'connecting', error: undefined })
    const url = await this.url()
    if (!url) return this.setLive({ phase: 'offline', error: this.state.error })
    const es = new EventSource<'view' | 'incoming' | 'push'>(`${url}/island/events`, {
      headers: { ...this.auth, 'X-Island-Device': DEVICE },
      pollingInterval: 3000, // reconnect this soon after the stream drops
      timeoutBeforeConnection: 0,
    })
    es.addEventListener('view', (e) => {
      try {
        const v = JSON.parse(e.data ?? '{}') as PhoneView
        if (v && v.protocol === 1) this.setLive({ phase: 'live', view: v, seenAt: Date.now(), error: undefined })
      } catch {
        // a bad line
      }
    })
    es.addEventListener('incoming', (e) => {
      try {
        const f = JSON.parse(e.data ?? '{}') as PhoneIncoming
        if (f && typeof f.id === 'string' && typeof f.name === 'string') for (const l of this.incomingListeners) l(f)
      } catch {
        // a bad line
      }
    })
    es.addEventListener('push', (e) => {
      try {
        const m = JSON.parse(e.data ?? '{}') as { topic: PhoneTopic; data: unknown }
        for (const l of this.pushListeners.get(m.topic) ?? []) l(m.data)
      } catch {
        // a bad line
      }
    })
    es.addEventListener('error', (e: any) => {
      this.setLive({ phase: 'offline', error: linkError(e?.xhrStatus || undefined, e?.message) })
      // The computer may have moved to another address: look again.
      if (!e?.xhrStatus) void this.find()
    })
    this.es = es
    // A slow poll as a safety net: idle connections can die quietly on mobile networks.
    this.poll = setInterval(() => void this.refresh(), 30_000)
  }

  stopLive(): void {
    this.es?.removeAllEventListeners()
    this.es?.close()
    this.es = null
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }

  async refresh(): Promise<void> {
    const url = this.state.url
    if (!url) return
    try {
      const r = await call(`${url}/island/view`, { headers: this.auth, timeoutMs: 5000 })
      if (r.ok) this.setLive({ phase: 'live', view: (await r.json()) as PhoneView, seenAt: Date.now(), error: undefined })
      else this.setLive({ phase: 'offline', error: linkError(r.status) })
    } catch (e: any) {
      this.setLive({ phase: 'offline', error: linkError(undefined, String(e?.message ?? e)) })
    }
  }

  private async post(path: string, body: object): Promise<{ ok: boolean; message: string }> {
    const url = await this.url()
    if (!url) return { ok: false, message: this.state.error ?? 'Can’t reach your computer.' }
    try {
      const r = await call(`${url}${path}`, { method: 'POST', headers: { ...this.auth, 'Content-Type': 'application/json', 'X-Island-Device': DEVICE }, body: JSON.stringify(body), timeoutMs: 6000 })
      const j: any = await r.json().catch(() => ({}))
      return { ok: r.ok && j.ok !== false, message: typeof j.message === 'string' ? j.message : r.ok ? '' : linkError(r.status) }
    } catch (e: any) {
      return { ok: false, message: linkError(undefined, String(e?.message ?? e)) }
    }
  }

  /** Your answer to an approval. Only ever called from your tap (in the app or on a notification's button). */
  decide(id: string, decision: 'allow' | 'deny' | 'ask', extra: { always?: boolean; answers?: Record<string, string>; message?: string } = {}) {
    return this.post('/island/decide', { id, decision, ...extra })
  }

  media(cmd: 'playpause' | 'next' | 'previous') {
    return this.post('/island/media', { cmd })
  }

  /** An image on the computer (the cover), with the token. */
  imageSource(path: string): { uri: string; headers: Record<string, string> } | null {
    const url = this.state.url
    if (!url) return null
    return { uri: path.startsWith('/') ? `${url}${path}` : path, headers: path.startsWith('/') ? this.auth : {} }
  }

  /** Take a file the computer sent: saved in the app's Received folder, then the computer hears it arrived. */
  async receive(f: PhoneIncoming, onProgress: (p: number) => void): Promise<{ ok: boolean; uri?: string; message?: string }> {
    const url = await this.url()
    if (!url) return { ok: false, message: this.state.error ?? 'Can’t reach your computer.' }
    const dir = new Directory(Paths.document, 'received')
    if (!dir.exists) dir.create({ intermediates: true })
    // Only a plain name, in Received: never a path from the other side.
    const name = f.name.replace(/[\\/\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 200) || 'file'
    let dest = new File(dir, name)
    const dot = name.lastIndexOf('.')
    for (let i = 2; dest.exists; i++) dest = new File(dir, dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`)
    try {
      const task = File.createDownloadTask(`${url}/drop/out/${f.id}`, dest, {
        headers: { ...this.auth, 'X-Island-Device': DEVICE },
        onProgress: ({ bytesWritten, totalBytes }) => onProgress(totalBytes > 0 ? bytesWritten / totalBytes : f.size ? bytesWritten / f.size : 0),
      })
      const got = await task.downloadAsync()
      if (!got || (f.size && got.size !== f.size)) throw new Error('It didn’t arrive whole')
      await this.post(`/drop/out/${f.id}/done`, { ok: true })
      return { ok: true, uri: got.uri }
    } catch (e: any) {
      try {
        if (dest.exists) dest.delete()
      } catch {
        // gone already
      }
      await this.post(`/drop/out/${f.id}/done`, { ok: false })
      return { ok: false, message: String(e?.message ?? e) }
    }
  }
}
