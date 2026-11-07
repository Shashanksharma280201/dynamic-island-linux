import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, createWriteStream } from 'node:fs'
import { basename, join } from 'node:path'
import { ANIMATIONS, animationItem, creditLine, isAnimation, parseWallItem, type WallItem, type WallKeys, type WallpaperConfig, type WallpaperView } from '@shared/wallpaper'
import { slugify } from '@shared/brain'
import { schema, str, type AgentTool } from '../agent/tools'
import { searchWalls, USER_AGENT, type Endpoints, type SearchResult } from './search'
import type { DesktopBackground } from './desktop'

/** What plays live wallpapers (LiveWallpaper; a stand-in in tests). */
export type Live = {
  show: (item: WallItem, mediaUrl: string) => Promise<void>
  stop: () => void
  still: () => Promise<Buffer | null>
  state: () => 'playing' | 'resting' | 'off'
}

export type WallDeps = {
  config: () => WallpaperConfig
  setConfig: (patch: Partial<WallpaperConfig>) => void
  /** Your keys for Pexels, Unsplash and Pixabay, decrypted ('' when not set). */
  keys: () => WallKeys
  /** Where wallpapers are saved (~/Pictures/Dynamic Island Wallpapers). */
  dir: string
  /** The list of past wallpapers (in the island's own folder). */
  historyFile: string
  /** The main screen, in pixels. */
  screen: () => { width: number; height: number }
  desktop: DesktopBackground
  live: Live
  endpoints?: Endpoints
  fetch?: typeof fetch
  onChange: () => void
  now?: () => number
  /** How long a live wallpaper plays before its still is taken (ms). */
  stillAfterMs?: number
}

const MAX_BYTES = 400 * 1024 * 1024
const HISTORY = 40

/** A file name for an item: its title and a short hash of its id. Pure. */
export function fileNameFor(item: WallItem, ext: string): string {
  const h = createHash('sha1').update(item.id).digest('hex').slice(0, 8)
  return `${slugify(item.title, 40)}-${h}.${ext}`
}

/** The extension for a download, from its type, else its address. Pure. */
export function extFor(contentType: string, url: string): string | null {
  const t = contentType.split(';')[0].trim().toLowerCase()
  const known: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv' }
  if (known[t]) return known[t]
  const m = /\.(jpe?g|png|webp|gif|mp4|webm|ogv)(?:[?#]|$)/i.exec(url)
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : null
}

/** A big Wikimedia photo is fetched at 4K through its thumbnail address, not as the original. Pure. */
export function downloadUrl(item: WallItem): string {
  if (item.source === 'wikimedia' && item.kind === 'image' && item.width > 3840 && /\/\d+px-[^/]+$/.test(item.thumb)) return item.thumb.replace(/\/\d+px-([^/]+)$/, '/3840px-$1')
  return item.url
}

/**
 * The desktop background: photos and videos found on the web and the island's
 * own animations, with a history and a way back. Photos become the desktop's
 * own background; videos and animations play live behind everything, with a
 * still of them set underneath so nothing jumps when they stop.
 */
export class Wallpapers {
  private found = new Map<string, WallItem>()
  private last: { query: string; kind: 'image' | 'video'; items: WallItem[] } | null = null
  private history: WallItem[] = []
  private busy: string | null = null
  private error: string | null = null

  constructor(private readonly d: WallDeps) {
    try {
      const raw = JSON.parse(readFileSync(d.historyFile, 'utf8'))
      this.history = (Array.isArray(raw) ? raw : []).map(parseWallItem).filter((x): x is WallItem => !!x).slice(0, HISTORY)
    } catch {
      // none yet
    }
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  private get fetch(): typeof fetch {
    return this.d.fetch ?? fetch
  }

  private say(busy: string | null, error: string | null = null): void {
    this.busy = busy
    this.error = error
    this.d.onChange()
  }

  view(): WallpaperView {
    const keys = this.d.config().keys
    return {
      current: this.d.config().current,
      history: this.history,
      pauseCovered: this.d.config().pauseCovered,
      pauseBattery: this.d.config().pauseBattery,
      keys: { pexels: !!keys.pexels, unsplash: !!keys.unsplash, pixabay: !!keys.pixabay },
      supported: this.d.desktop.supported(),
      live: this.d.live.state(),
      busy: this.busy,
      error: this.error,
    }
  }

  /** The saved file behind island-media://wall/<name>, or null. */
  mediaFile(name: string): string | null {
    if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) return null
    const f = join(this.d.dir, name)
    return existsSync(f) ? f : null
  }

  async search(query: string, kind: 'image' | 'video' = 'image'): Promise<SearchResult> {
    const q = query.trim().slice(0, 200)
    if (!q) return { items: [], errors: ['Say what to look for.'] }
    const r = await searchWalls({ query: q, kind, keys: this.d.keys(), screen: this.d.screen(), endpoints: this.d.endpoints, fetch: this.d.fetch })
    for (const i of r.items) this.found.set(i.id, i)
    this.last = { query: q.toLowerCase(), kind, items: r.items }
    return r
  }

  /** Find and set: the `pick`th best match for the words (1 = best). */
  async setFromQuery(query: string, kind: 'image' | 'video' = 'image', pick = 1): Promise<{ item: WallItem } | { error: string }> {
    const same = this.last && this.last.query === query.trim().toLowerCase() && this.last.kind === kind
    const r = same ? { items: this.last!.items, errors: [] } : await this.search(query, kind)
    const n = Math.max(1, Math.floor(pick))
    // Try the next ones if a download fails.
    for (const item of r.items.slice(n - 1, n + 2)) {
      const done = await this.set(item)
      if ('item' in done) return done
    }
    if (!r.items.length) return { error: `Nothing came up for “${query}”${r.errors.length ? ` (${r.errors.join('; ')})` : ''}. Try other words.` }
    return { error: this.error ?? 'Couldn’t set any of them.' }
  }

  /** Set an item (or a found item's id) as the background. */
  async set(target: WallItem | string): Promise<{ item: WallItem } | { error: string }> {
    const item = typeof target === 'string' ? (this.found.get(target) ?? this.history.find((h) => h.id === target) ?? null) : target
    if (!item) return { error: 'That one isn’t in the last search any more. Search again.' }
    if (!this.d.desktop.supported()) return { error: 'Changing the background isn’t supported on this desktop yet.' }
    try {
      await this.keepOriginal()
      if (item.kind === 'animation') return await this.setLive({ ...item })
      this.say(`Downloading ${item.kind === 'video' ? 'the video' : 'the photo'}…`)
      const file = item.file && existsSync(item.file) ? item.file : await this.download(item)
      const saved: WallItem = { ...item, file }
      if (item.kind === 'video') return await this.setLive(saved)
      this.d.live.stop()
      const problem = await this.d.desktop.set(file)
      if (problem) throw new Error(problem)
      if (item.pingUrl && this.d.keys().unsplash) void this.fetch(`${item.pingUrl}${item.pingUrl.includes('?') ? '&' : '?'}client_id=${encodeURIComponent(this.d.keys().unsplash)}`).catch(() => {})
      return this.done(saved)
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      this.say(null, why)
      return { error: why }
    }
  }

  /** One of the island's animations. */
  async animation(id: string): Promise<{ item: WallItem } | { error: string }> {
    if (!isAnimation(id)) return { error: `There is no animation called “${id}”. There are: ${ANIMATIONS.map((a) => a.id).join(', ')}.` }
    return this.set(animationItem(id))
  }

  /** Put the one before back (or the desktop's own, if there was none). */
  async undo(): Promise<{ item: WallItem | null } | { error: string }> {
    const prev = this.history[1]
    if (prev) {
      const r = await this.set(prev)
      return 'error' in r ? r : { item: r.item }
    }
    return this.restore()
  }

  /** The desktop's own background, as before the island changed it. */
  async restore(): Promise<{ item: null } | { error: string }> {
    this.d.live.stop()
    const original = this.d.config().original
    if (!original) return { error: 'The island hasn’t changed the background, so there’s nothing to put back.' }
    const problem = await this.d.desktop.restore(original)
    if (problem) return { error: problem }
    this.d.setConfig({ current: null })
    this.say(null)
    return { item: null }
  }

  /** At start: play the live wallpaper that was on. */
  async resume(): Promise<void> {
    const c = this.d.config().current
    if (!c || c.kind === 'image') return
    if (c.kind === 'video' && (!c.file || !existsSync(c.file))) return
    await this.d.live.show(c, this.mediaUrl(c)).catch((e) => console.error('[wallpaper] resume:', e instanceof Error ? e.message : e))
  }

  private mediaUrl(item: WallItem): string {
    return item.file ? `island-media://wall/${encodeURIComponent(basename(item.file))}` : ''
  }

  private async setLive(item: WallItem): Promise<{ item: WallItem }> {
    this.say(item.kind === 'animation' ? 'Starting the animation…' : 'Starting the video…')
    await this.d.live.show(item, this.mediaUrl(item))
    // A still of it underneath: the desktop looks the same if the island stops.
    await new Promise((r) => setTimeout(r, this.d.stillAfterMs ?? 2500))
    const png = await this.d.live.still()
    if (png) {
      mkdirSync(this.d.dir, { recursive: true })
      const still = join(this.d.dir, fileNameFor(item, 'still.png'))
      writeFileSync(still, png)
      const problem = await this.d.desktop.set(still)
      if (problem) console.error('[wallpaper] still:', problem)
    }
    return this.done(item)
  }

  private done(item: WallItem): { item: WallItem } {
    const set = { ...item, setAt: this.now() }
    this.history = [set, ...this.history.filter((h) => h.id !== item.id)].slice(0, HISTORY)
    try {
      mkdirSync(join(this.d.historyFile, '..'), { recursive: true })
      writeFileSync(this.d.historyFile, JSON.stringify(this.history, null, 1))
    } catch {
      // best effort
    }
    this.d.setConfig({ current: set })
    this.say(null)
    return { item: set }
  }

  private async keepOriginal(): Promise<void> {
    if (this.d.config().original) return
    const saved = await this.d.desktop.save().catch(() => '')
    if (saved) this.d.setConfig({ original: saved })
  }

  /** Download a photo or video into the wallpapers folder (streamed, size-capped). */
  private async download(item: WallItem): Promise<string> {
    const url = downloadUrl(item)
    const r = await this.fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(180_000) })
    if (!r.ok || !r.body) throw new Error(`The ${item.kind === 'video' ? 'video' : 'photo'} couldn’t be downloaded (${r.status}).`)
    const type = r.headers.get('content-type') ?? ''
    if (!/^(image|video)\//.test(type) && !/^application\/octet-stream/.test(type)) throw new Error('That address didn’t give a photo or a video.')
    const ext = extFor(type, url)
    if (!ext) throw new Error('That file type can’t be a background.')
    const size = Number(r.headers.get('content-length') ?? 0)
    if (size > MAX_BYTES) throw new Error('That file is too big (over 400 MB).')
    mkdirSync(this.d.dir, { recursive: true })
    const file = join(this.d.dir, fileNameFor(item, ext))
    if (existsSync(file) && statSync(file).size > 0) return file
    const tmp = `${file}.part`
    const out = createWriteStream(tmp)
    let got = 0
    try {
      const reader = r.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        got += value.byteLength
        if (got > MAX_BYTES) throw new Error('That file is too big (over 400 MB).')
        if (!out.write(value)) await new Promise<void>((res) => out.once('drain', () => res()))
        if (item.kind === 'video' && size) this.say(`Downloading the video… ${Math.round((got / size) * 100)}%`)
      }
      await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())))
    } catch (e) {
      out.destroy()
      rmSync(tmp, { force: true })
      throw e
    }
    if (!got) {
      rmSync(tmp, { force: true })
      throw new Error('The download was empty.')
    }
    renameSync(tmp, file)
    return file
  }

  // ----------------------------------------------------------------- tools ----

  /** The assistant's wallpaper tools: change it by asking, in words or by voice. */
  tools(): AgentTool[] {
    const describe = (w: WallItem) => `${w.title}${w.kind === 'video' ? ' (video)' : w.kind === 'animation' ? ' (animation)' : ''}, ${creditLine(w)}`
    const kindOf = (v: unknown): 'image' | 'video' => (v === 'video' ? 'video' : 'image')
    return [
      {
        name: 'wallpaper_set',
        description:
          'Change the desktop background. Give what the user wants as a few search words (query, e.g. "misty mountains at sunrise") and it finds a photo on the web, or a video with kind "video" (moving backgrounds, such as "ocean waves aerial"), and sets the best match. For "another one", call it again with the same query and pick 2, 3 and so on. With an id from wallpaper_search it sets that one.',
        input_schema: schema({
          query: { type: 'string', description: 'What to look for, in a few words' },
          kind: { type: 'string', description: '"image" (default) or "video"' },
          pick: { type: 'number', description: 'Which match: 1 is the best (default), 2 the next…' },
          id: { type: 'string', description: 'An id from wallpaper_search' },
        }),
        label: (i) => (str(i.query) ? `Finding “${str(i.query).slice(0, 50)}” for your background` : 'Changing your background'),
        run: async (i) => {
          const r = str(i.id) ? await this.set(str(i.id)) : str(i.query) ? await this.setFromQuery(str(i.query), kindOf(i.kind), typeof i.pick === 'number' ? i.pick : 1) : { error: 'Give a query (what to look for) or an id.' }
          return 'error' in r ? r.error : `Set as the background: ${describe(r.item)}. (Say “another one” for the next match, or “put the old one back”.)`
        },
      },
      {
        name: 'wallpaper_search',
        description: 'Look for backgrounds on the web without setting one, to offer the user a choice. Returns numbered matches with ids for wallpaper_set.',
        input_schema: schema({ query: { type: 'string', description: 'What to look for' }, kind: { type: 'string', description: '"image" (default) or "video"' } }, ['query']),
        label: (i) => `Looking for “${str(i.query).slice(0, 50)}” backgrounds`,
        run: async (i) => {
          const r = await this.search(str(i.query), kindOf(i.kind))
          if (!r.items.length) return `Nothing came up${r.errors.length ? ` (${r.errors.join('; ')})` : ''}.`
          return r.items
            .slice(0, 8)
            .map((w, n) => `${n + 1}. ${describe(w)}${w.width ? `, ${w.width}×${w.height}` : ''}${w.duration ? `, ${Math.round(w.duration)} s` : ''} [id: ${w.id}]`)
            .join('\n')
        },
      },
      {
        name: 'wallpaper_animation',
        description: `Set one of the island's own animated backgrounds: ${ANIMATIONS.map((a) => `${a.id} (${a.note.toLowerCase()})`).join(', ')}.`,
        input_schema: schema({ name: { type: 'string', description: ANIMATIONS.map((a) => a.id).join(', ') } }, ['name']),
        label: (i) => `Starting the ${str(i.name)} animation`,
        run: async (i) => {
          const r = await this.animation(str(i.name).toLowerCase())
          return 'error' in r ? r.error : `Set as the background: ${describe(r.item)}.`
        },
      },
      {
        name: 'wallpaper_undo',
        description: 'Put the previous background back (or the desktop’s own, if the island only changed it once).',
        input_schema: schema({}),
        label: () => 'Putting the old background back',
        run: async () => {
          const r = await this.undo()
          return 'error' in r ? r.error : r.item ? `Back to: ${describe(r.item)}.` : 'Back to the desktop’s own background.'
        },
      },
      {
        name: 'wallpaper_now',
        description: 'What the desktop background is now, and who made it.',
        input_schema: schema({}),
        label: () => 'Checking your background',
        run: async () => {
          const c = this.d.config().current
          return c ? `${describe(c)}${c.page ? `. Its page: ${c.page}` : ''}` : 'The desktop’s own background (the island hasn’t changed it).'
        },
      },
    ]
  }
}
