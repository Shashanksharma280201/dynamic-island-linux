/**
 * Phone Drop: files flicked from your phone (the Island Drop Android app) to
 * this computer, landing with a glow at the screen's edge.
 *
 * The phone talks plain HTTP to the island over your Wi-Fi or Tailscale,
 * with the token from the pairing QR (protocol version 1):
 *
 *   GET  /drop/hello                    who's here: { protocol, app, name }
 *   POST /drop/approach  DropApproach   a file is heading for the edge: glow
 *   POST /drop/cancel    { id }         it went back: fade
 *   PUT  /drop/file?id&index&name&size  the file's bytes: save it, land it
 *
 * Everything the phone sends is untrusted: checked, cut to size, or refused.
 * Pure.
 */

export const DROP_PROTOCOL = 1
export const DROP_DEFAULT_PORT = 8790
/** The biggest file the island takes. */
export const DROP_MAX_BYTES = 8 * 1024 ** 3
/** A thumbnail the phone sends with its approach (a small JPEG, as a data URL). */
export const DROP_MAX_THUMB = 300_000
/** At most this many files in one drop. */
export const DROP_MAX_FILES = 20
/** An approach that isn't followed by its file this soon fades away. */
export const APPROACH_MS = 10_000

/** The edge of this screen a file comes in at (the side your phone is on). */
export type DropSide = 'left' | 'right' | 'top' | 'bottom'
export const DROP_SIDES: DropSide[] = ['left', 'right', 'top', 'bottom']

export type DropFileInfo = { name: string; size: number }

/** A file on its way: the phone is dragging it toward its edge. */
export type DropApproach = {
  id: string
  side: DropSide
  /** Where along the edge, 0 (top or left) to 1. */
  at: number
  files: DropFileInfo[]
  /** data:image/jpeg;base64,… or none. */
  thumb?: string
  /** "Pixel 8": shown on the card. */
  device: string
}

/** Settings → Phone Drop, as saved. */
export type DropConfig = {
  on: boolean
  /** 'downloads', 'desktop', or a folder's absolute path. */
  folder: string
  port: number
  /** The pairing token, encrypted (see secrets.ts); '' until first turned on. */
  secret: string
}

/** Settings → Phone Drop, as the page shows it. */
export type DropStatus = {
  on: boolean
  /** 'downloads', 'desktop' or a folder. */
  folder: string
  /** "Downloads", "Desktop" or the folder's name. */
  folderLabel: string
  port: number
  listening: boolean
  /** Why it isn't listening, if it should be. */
  problem: string | null
  /** The pairing link (for the QR), while it's on. */
  link?: string
  /** This computer's name, as the phone shows it. */
  name: string
  /** Phones connected now (Island Drop open, or keeping in touch in the background). */
  phones: string[]
}

export const DROP_DEFAULTS: DropConfig = { on: false, folder: 'downloads', port: DROP_DEFAULT_PORT, secret: '' }

export function parseDropConfig(raw: any): DropConfig {
  const c = { ...DROP_DEFAULTS }
  if (!raw || typeof raw !== 'object') return c
  if (typeof raw.on === 'boolean') c.on = raw.on
  if (typeof raw.folder === 'string' && (raw.folder === 'downloads' || raw.folder === 'desktop' || isFolderPath(raw.folder))) c.folder = raw.folder
  if (Number.isInteger(raw.port) && raw.port >= 1024 && raw.port <= 65535) c.port = raw.port
  if (typeof raw.secret === 'string') c.secret = raw.secret
  return c
}

function isFolderPath(p: string): boolean {
  return p.length < 1000 && !p.includes('\0') && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p))
}

/** A drop's id: letters, digits, - and _. */
export function isDropId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v)
}

/** The phone's approach, checked; null if it isn't one. */
export function parseApproach(raw: any): DropApproach | null {
  if (!raw || typeof raw !== 'object' || !isDropId(raw.id)) return null
  if (!DROP_SIDES.includes(raw.side)) return null
  if (!Array.isArray(raw.files) || !raw.files.length || raw.files.length > DROP_MAX_FILES) return null
  const files: DropFileInfo[] = []
  for (const f of raw.files) {
    if (!f || typeof f.name !== 'string' || !validSize(f.size)) return null
    files.push({ name: cleanFileName(f.name), size: f.size })
  }
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? Math.min(1, Math.max(0, raw.at)) : 0.5
  const thumb = typeof raw.thumb === 'string' && raw.thumb.length <= DROP_MAX_THUMB && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.thumb) ? raw.thumb : undefined
  return { id: raw.id, side: raw.side, at, files, thumb, device: cleanDevice(raw.device) }
}

export function validSize(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= DROP_MAX_BYTES
}

/** "Pixel 8", or "Your phone" if it said nothing usable. */
export function cleanDevice(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) : ''
  return s || 'Your phone'
}

/**
 * A name that's safe to save as: no folders, no control characters, not
 * hidden, not too long (the extension is kept). "../../.bashrc" -> "bashrc".
 */
export function cleanFileName(name: string): string {
  let n = String(name).split(/[\\/]/).pop() ?? ''
  n = n.replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '').trim()
  n = n.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (!n) return 'file'
  if (n.length > 150) {
    const { base, ext } = splitName(n)
    n = ext && ext.length <= 12 ? `${base.slice(0, 150 - ext.length - 1).trim()}.${ext}` : n.slice(0, 150)
  }
  return n
}

/** "Report.final.pdf" -> { base: "Report.final", ext: "pdf" } (ext lowercased). */
export function splitName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return { base: name, ext: '' }
  return { base: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() }
}

export type DropKind = 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'text' | 'file'

const KIND_EXTS: Record<Exclude<DropKind, 'file'>, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp'],
  video: ['mp4', 'mov', 'mkv', 'webm', '3gp', 'avi'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac'],
  pdf: ['pdf'],
  doc: ['doc', 'docx', 'odt', 'rtf', 'pages'],
  sheet: ['xls', 'xlsx', 'ods', 'csv', 'numbers'],
  slides: ['ppt', 'pptx', 'odp', 'key'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'apk'],
  text: ['txt', 'md', 'json', 'log', 'html', 'xml', 'yaml', 'yml'],
}

export function dropKind(name: string): DropKind {
  const { ext } = splitName(name)
  for (const [k, exts] of Object.entries(KIND_EXTS)) if (exts.includes(ext)) return k as DropKind
  return 'file'
}

/** Each kind's colour on its tile and card. */
export const KIND_COLOR: Record<DropKind, string> = {
  image: '#bf5af2',
  video: '#ff375f',
  audio: '#ff9f0a',
  pdf: '#ff453a',
  doc: '#0a84ff',
  sheet: '#30d158',
  slides: '#ff9f0a',
  archive: '#a2845e',
  text: '#8e8e93',
  file: '#8e8e93',
}

/** 2_300_000 -> "2.2 MB". */
export function sizeText(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** "3 photos", "2 files", or the one file's name. */
export function dropTitle(files: DropFileInfo[]): string {
  if (files.length === 1) return files[0].name
  const kinds = new Set(files.map((f) => dropKind(f.name)))
  if (kinds.size === 1 && kinds.has('image')) return `${files.length} photos`
  if (kinds.size === 1 && kinds.has('video')) return `${files.length} videos`
  return `${files.length} files`
}

type Iface = { address: string; family: string | number; internal: boolean }

/**
 * Addresses the phone can try, best first: your Wi-Fi or Ethernet, then
 * Tailscale (100.64.0.0/10), then any other (some networks hand out public
 * addresses). Container and VM bridges are left out.
 */
export function dropAddresses(ifaces: Record<string, Iface[] | undefined>, port: number): string[] {
  const lan: string[] = []
  const tail: string[] = []
  const other: string[] = []
  for (const [name, list] of Object.entries(ifaces)) {
    if (/^(docker|br-|veth|virbr|vmnet|vboxnet|lxc|cni|flannel|podman)/.test(name)) continue
    for (const a of list ?? []) {
      if (a.internal || !(a.family === 'IPv4' || a.family === 4)) continue
      const [p, q] = a.address.split('.').map(Number)
      if (p === 169 && q === 254) continue
      const url = `http://${a.address}:${port}`
      if (p === 100 && q >= 64 && q <= 127) tail.push(url)
      else if (p === 10 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168)) lan.push(url)
      else other.push(url)
    }
  }
  return [...lan, ...tail, ...other]
}

/** The link in the pairing QR: islanddrop://pair?v=1&name=…&token=…&url=…&url=… */
export function dropPairingLink(name: string, token: string, urls: string[]): string {
  const q = [`v=${DROP_PROTOCOL}`, `name=${encodeURIComponent(name)}`, `token=${encodeURIComponent(token)}`, ...urls.map((u) => `url=${encodeURIComponent(u)}`)]
  return `islanddrop://pair?${q.join('&')}`
}

/** `name` if it's free, else "name (2).ext", "name (3).ext"… Never overwrites. */
export function freeName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name
  const { base, ext } = splitName(name)
  for (let i = 2; ; i++) {
    const n = ext ? `${base} (${i}).${ext}` : `${base} (${i})`
    if (!taken(n)) return n
  }
}

/** What the overlay draws, step by step (page coordinates, CSS pixels). */
export type DropCmd =
  | { t: 'approach'; id: string; side: DropSide; at: number; thumb?: string; name: string; ext: string; color: string }
  | { t: 'arrive'; id: string }
  | { t: 'progress'; id: string; p: number }
  | { t: 'land'; id: string; to: { x: number; y: number } }
  | { t: 'stow'; id: string; to: { x: number; y: number } }
  | { t: 'cancel'; id: string }
  | { t: 'fail'; id: string }
  | DropSendCmd

/** How long the file hovers in the glow before a slow transfer goes on in the island instead. */
export const HOVER_MS = 3500

/** The overlay sending a file to the phone: it's pulled from `from` into the light at the edge. */
export type DropSendCmd = { t: 'send'; id: string; side: DropSide; at: number; from: { x: number; y: number }; thumb?: string; name: string; ext: string; color: string }
