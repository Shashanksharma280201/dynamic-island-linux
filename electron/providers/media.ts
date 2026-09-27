import dbus from 'dbus-next'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extname } from 'node:path'
import type { MediaState, MediaCmd } from '@shared/types'

/** Microseconds (number | bigint) → seconds, or undefined if not positive. */
export function usToSec(v: unknown): number | undefined {
  if (typeof v !== 'number' && typeof v !== 'bigint') return undefined
  const n = Number(v) / 1e6
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function parseMprisMetadata(
  meta: Record<string, { value: unknown }>,
  status: string,
  canControl: boolean,
): MediaState {
  const get = (k: string) => meta?.[k]?.value
  const artistRaw = get('xesam:artist')
  const artist = Array.isArray(artistRaw)
    ? artistRaw.join(', ')
    : ((artistRaw as string) ?? '')
  const s: MediaState = {
    title: (get('xesam:title') as string) || 'Unknown',
    artist: artist || '',
    artUrl: (get('mpris:artUrl') as string) || undefined,
    playing: status === 'Playing',
    canControl,
  }
  const length = usToSec(get('mpris:length'))
  if (length) s.length = length
  return s
}

/**
 * Pure: choose which MPRIS player to show/control. Prefer a Playing player,
 * then a Paused one, then any; ignore the playerctld proxy. Null if none.
 */
export function pickActivePlayer(
  players: { name: string; status: string }[],
): string | null {
  const usable = players.filter((p) => !p.name.includes('playerctld'))
  if (usable.length === 0) return null
  return (
    usable.find((p) => p.status === 'Playing')?.name ??
    usable.find((p) => p.status === 'Paused')?.name ??
    usable[0].name
  )
}

/** Identity of a media state for change detection (position excluded). Pure. */
export function mediaKey(s: MediaState | null): string {
  return s
    ? [s.title, s.artist, s.playing, s.artUrl, s.canControl, s.length].join('|')
    : 'null'
}

const PREFIX = 'org.mpris.MediaPlayer2.'
const PATH = '/org/mpris/MediaPlayer2'
const PLAYER = 'org.mpris.MediaPlayer2.Player'
const PROPS = 'org.freedesktop.DBus.Properties'
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}
const MAX_ART = 4 * 1024 * 1024

type Proxy = { player: any; props: any; off: () => void }

/**
 * Tracks MPRIS players over D-Bus. Change-driven: listens for players
 * appearing/disappearing (NameOwnerChanged) and for PropertiesChanged/Seeked on
 * each player, with a slow safety poll.
 */
export class MediaProvider {
  private bus = dbus.sessionBus()
  private cb: ((s: MediaState | null) => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private proxies = new Map<string, Proxy>()
  private active: string | null = null
  private lastKey = 'init'
  private artCache = new Map<string, string>()
  private forceNext = false

  constructor() {
    this.bus.on('error', (e) => console.error('media bus:', e?.message ?? e))
  }

  onChange(cb: (s: MediaState | null) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    const obj = await this.bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    const dbusIface = obj.getInterface('org.freedesktop.DBus')
    dbusIface.on('NameOwnerChanged', (name: string) => {
      if (name.startsWith(PREFIX)) this.schedule()
    })
    await this.refresh().catch(() => {})
    this.timer = setInterval(() => this.refresh().catch(() => {}), 5000)
  }

  /** Coalesce bursts of signals into one refresh. */
  private schedule(force = false): void {
    if (force) this.forceNext = true
    if (this.debounce) return
    this.debounce = setTimeout(() => {
      this.debounce = null
      this.refresh().catch(() => {})
    }, 100)
  }

  private async listPlayers(): Promise<string[]> {
    const obj = await this.bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    const names: string[] = await obj.getInterface('org.freedesktop.DBus').ListNames()
    return names.filter((n) => n.startsWith(PREFIX))
  }

  private async getProxy(name: string): Promise<Proxy> {
    let p = this.proxies.get(name)
    if (!p) {
      const obj = await this.bus.getProxyObject(name, PATH)
      const player = obj.getInterface(PLAYER)
      const props = obj.getInterface(PROPS)
      const onProps = () => this.schedule()
      const onSeek = () => this.schedule(true)
      props.on('PropertiesChanged', onProps)
      player.on('Seeked', onSeek)
      p = {
        player,
        props,
        off: () => {
          props.removeListener('PropertiesChanged', onProps)
          player.removeListener('Seeked', onSeek)
        },
      }
      this.proxies.set(name, p)
    }
    return p
  }

  private async prop(name: string, key: string, fallback?: unknown): Promise<any> {
    try {
      return (await (await this.getProxy(name)).props.Get(PLAYER, key)).value
    } catch (e) {
      if (fallback !== undefined) return fallback
      throw e
    }
  }

  /** Local file art can't be loaded by an http(s) renderer; inline it. */
  private async resolveArt(url: string | undefined): Promise<string | undefined> {
    if (!url || !url.startsWith('file://')) return url
    const hit = this.artCache.get(url)
    if (hit) return hit
    try {
      const path = fileURLToPath(url)
      const buf = await readFile(path)
      if (buf.length > MAX_ART) return undefined
      const data = `data:${MIME[extname(path).toLowerCase()] ?? 'image/png'};base64,${buf.toString('base64')}`
      if (this.artCache.size > 20) this.artCache.clear()
      this.artCache.set(url, data)
      return data
    } catch {
      return undefined
    }
  }

  private async refresh(): Promise<void> {
    const names = await this.listPlayers()
    for (const [cached, p] of [...this.proxies]) {
      if (!names.includes(cached)) {
        p.off()
        this.proxies.delete(cached)
      }
    }
    const players: { name: string; status: string }[] = []
    for (const name of names) {
      try {
        players.push({ name, status: await this.prop(name, 'PlaybackStatus') })
      } catch {
        // player vanished mid-query; ignore
      }
    }
    const active = pickActivePlayer(players)
    this.active = active
    if (!active) return this.emit(null)
    try {
      const meta = await this.prop(active, 'Metadata')
      const status = await this.prop(active, 'PlaybackStatus')
      const canControl = await this.prop(active, 'CanControl', true)
      const s = parseMprisMetadata(meta, status, canControl)
      s.artUrl = await this.resolveArt(s.artUrl)
      const pos = usToSec(await this.prop(active, 'Position', 0))
      if (pos !== undefined || s.length) {
        s.position = pos ?? 0
        s.positionAt = Date.now()
      }
      this.emit(s)
    } catch {
      this.emit(null)
    }
  }

  private emit(s: MediaState | null): void {
    const key = mediaKey(s)
    if (key === this.lastKey && !this.forceNext) return
    this.forceNext = false
    this.lastKey = key
    this.cb?.(s)
  }

  async command(cmd: MediaCmd): Promise<void> {
    if (!this.active) return
    try {
      const p = await this.getProxy(this.active)
      if (cmd === 'playpause') await p.player.PlayPause()
      if (cmd === 'next') await p.player.Next()
      if (cmd === 'previous') await p.player.Previous()
      this.schedule(true)
    } catch {
      // player may not support the command; ignore
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    if (this.debounce) clearTimeout(this.debounce)
    this.timer = null
    for (const p of this.proxies.values()) p.off()
    this.proxies.clear()
    this.bus.disconnect()
  }
}
