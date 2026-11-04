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
export function isIslandHello(j: any): j is { ok: true; protocol: number; name: string; urls?: unknown } {
  return !!j && j.ok === true && j.app === 'dynamic-island' && typeof j.protocol === 'number' && typeof j.name === 'string'
}

/** The addresses a computer says it has now (from its hello), plain http ones only, at most 8. Pure. */
export function helloUrls(j: any): string[] {
  if (!Array.isArray(j?.urls)) return []
  return j.urls.filter((u: unknown): u is string => typeof u === 'string' && /^http:\/\/[\w.\-:[\]]+$/.test(u) && u.length < 80).slice(0, 8)
}

/** The pairing's addresses with new ones first, nothing twice, at most 8. Pure. */
export function mergeUrls(first: string[], known: string[]): string[] {
  return [...new Set([...first, ...known])].slice(0, 8)
}

/** How the phone reaches the computer at this address: the same Wi-Fi, Tailscale, or further. Pure. */
export type Route = 'wifi' | 'tailscale' | 'internet'
export function routeOf(url: string): Route {
  const host = url.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (/\.ts\.net$/i.test(host)) return 'tailscale'
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!m) return /\.local$/i.test(host) ? 'wifi' : 'internet'
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 100 && b >= 64 && b <= 127) return 'tailscale'
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return 'wifi'
  return 'internet'
}

/** "Wi-Fi", "Tailscale", "Internet". */
export const routeName = (r: Route) => (r === 'wifi' ? 'Wi-Fi' : r === 'tailscale' ? 'Tailscale' : 'Internet')

/** Every other address on this phone's /24 Wi-Fi network (where the computer may have moved to), nearest first. Pure. */
export function neighbours(ip: string): string[] {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
  if (!m || routeOf(`http://${ip}`) !== 'wifi') return []
  const me = Number(m[4])
  const out: string[] = []
  for (let d = 1; d < 255; d++)
    for (const n of [me - d, me + d]) if (n >= 1 && n <= 254) out.push(`${m[1]}.${m[2]}.${m[3]}.${n}`)
  return out
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
