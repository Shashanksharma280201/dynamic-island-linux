/**
 * The phone's side of Phone Drop (protocol version 1, see the island's
 * shared/drop.ts): the pairing link from the island's QR, and the shapes the
 * island answers with. Pure, so the island's tests can check it too.
 */

export type Side = 'left' | 'right' | 'top' | 'bottom'

/** A computer this phone may send to: its name, token, and the addresses to try. */
export type Pairing = { name: string; token: string; urls: string[] }

/** islanddrop://pair?v=1&name=…&token=…&url=…&url=… -> a Pairing, or null. */
export function parsePairingLink(link: string): Pairing | null {
  const m = /^islanddrop:\/\/pair\?(.*)$/.exec(link.trim())
  if (!m) return null
  let name = ''
  let token = ''
  const urls: string[] = []
  for (const part of m[1].split('&')) {
    const [k, v = ''] = part.split('=')
    let value: string
    try {
      value = decodeURIComponent(v)
    } catch {
      return null
    }
    if (k === 'name') name = value
    else if (k === 'token') token = value
    else if (k === 'url') urls.push(value)
  }
  return cleanPairing(name, token, urls)
}

/** Addresses that look right (http(s)://host:port, at most 8) and a token, or null. */
export function cleanPairing(name: string, token: string, urls: string[]): Pairing | null {
  const t = token.trim()
  if (t.length < 16 || /\s/.test(t)) return null
  const good = urls.map((u) => u.trim().replace(/\/+$/, '')).filter((u) => /^https?:\/\/[^\s/@]+(:\d+)?$/.test(u))
  if (!good.length) return null
  return { name: name.trim().slice(0, 60) || 'Your computer', token: t, urls: [...new Set(good)].slice(0, 8) }
}

/** The island's hello: { ok, protocol, app, name }. */
export function isIslandHello(j: any): j is { ok: true; protocol: number; name: string } {
  return !!j && j.ok === true && j.app === 'dynamic-island' && typeof j.protocol === 'number' && typeof j.name === 'string'
}

/** A drop's id: letters and digits, unique enough. */
export function newDropId(): string {
  const r = () => Math.random().toString(36).slice(2, 8)
  return `p${Date.now().toString(36)}${r()}`
}

/** 2_300_000 -> "2.2 MB". */
export function sizeText(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
