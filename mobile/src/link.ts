import { Platform } from 'react-native'
import { File } from 'expo-file-system'
import { isIslandHello, type Pairing, type Side } from './protocol'

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
    return await Promise.any(tries)
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
  private listeners = new Set<(s: LinkState) => void>()
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
}
