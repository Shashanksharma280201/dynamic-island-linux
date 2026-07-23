import dbus from 'dbus-next'
import type { MediaState, MediaCmd } from '@shared/types'

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
  return {
    title: (get('xesam:title') as string) || 'Unknown',
    artist: artist || '',
    artUrl: (get('mpris:artUrl') as string) || undefined,
    playing: status === 'Playing',
    canControl,
  }
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

const PREFIX = 'org.mpris.MediaPlayer2.'
const PATH = '/org/mpris/MediaPlayer2'
const PLAYER = 'org.mpris.MediaPlayer2.Player'
const PROPS = 'org.freedesktop.DBus.Properties'

type Proxy = { player: any; props: any }

export class MediaProvider {
  private bus = dbus.sessionBus()
  private cb: ((s: MediaState | null) => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private proxies = new Map<string, Proxy>()
  private active: string | null = null
  private lastKey = 'init'

  onChange(cb: (s: MediaState | null) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    await this.refresh().catch(() => {})
    // Poll so players that appear/disappear/change after startup are tracked.
    this.timer = setInterval(() => {
      this.refresh().catch(() => {})
    }, 1000)
  }

  private async listPlayers(): Promise<string[]> {
    const obj = await this.bus.getProxyObject(
      'org.freedesktop.DBus',
      '/org/freedesktop/DBus',
    )
    const iface = obj.getInterface('org.freedesktop.DBus')
    const names: string[] = await iface.ListNames()
    return names.filter((n) => n.startsWith(PREFIX))
  }

  private async getProxy(name: string): Promise<Proxy> {
    let p = this.proxies.get(name)
    if (!p) {
      const obj = await this.bus.getProxyObject(name, PATH)
      p = { player: obj.getInterface(PLAYER), props: obj.getInterface(PROPS) }
      this.proxies.set(name, p)
    }
    return p
  }

  private async statusOf(name: string): Promise<string> {
    const p = await this.getProxy(name)
    return (await p.props.Get(PLAYER, 'PlaybackStatus')).value
  }

  private async refresh(): Promise<void> {
    const names = await this.listPlayers()
    for (const cached of [...this.proxies.keys()]) {
      if (!names.includes(cached)) this.proxies.delete(cached)
    }
    if (names.length === 0) {
      this.active = null
      this.emit(null)
      return
    }
    const players: { name: string; status: string }[] = []
    for (const name of names) {
      try {
        players.push({ name, status: await this.statusOf(name) })
      } catch {
        // player vanished mid-query; ignore
      }
    }
    const active = pickActivePlayer(players)
    this.active = active
    if (!active) {
      this.emit(null)
      return
    }
    try {
      const p = await this.getProxy(active)
      const meta = (await p.props.Get(PLAYER, 'Metadata')).value
      const status = (await p.props.Get(PLAYER, 'PlaybackStatus')).value
      const canControl = (await p.props.Get(PLAYER, 'CanControl')).value
      this.emit(parseMprisMetadata(meta, status, canControl))
    } catch {
      this.emit(null)
    }
  }

  private emit(s: MediaState | null): void {
    const key = s ? `${s.title}|${s.artist}|${s.playing}|${s.artUrl}` : 'null'
    if (key === this.lastKey) return
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
      await this.refresh().catch(() => {}) // reflect the change immediately
    } catch {
      // player may not support the command; ignore
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.bus.disconnect()
  }
}
