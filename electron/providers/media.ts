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

const PREFIX = 'org.mpris.MediaPlayer2.'
const PATH = '/org/mpris/MediaPlayer2'
const PLAYER = 'org.mpris.MediaPlayer2.Player'

export class MediaProvider {
  private bus = dbus.sessionBus()
  private cb: ((s: MediaState | null) => void) | null = null
  private player: any = null
  private name: string | null = null

  onChange(cb: (s: MediaState | null) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    const proxy = await this.bus.getProxyObject(
      'org.freedesktop.DBus',
      '/org/freedesktop/DBus',
    )
    const dbusIface = proxy.getInterface('org.freedesktop.DBus')
    const names: string[] = await dbusIface.ListNames()
    const candidates = names.filter(
      (n) => n.startsWith(PREFIX) && !n.includes('playerctld'),
    )
    for (const name of candidates) {
      if (await this.tryBind(name)) {
        this.name = name
        return
      }
    }
    // No usable player found.
    this.cb?.(null)
  }

  private async tryBind(name: string): Promise<boolean> {
    try {
      const obj = await this.bus.getProxyObject(name, PATH)
      this.player = obj.getInterface(PLAYER)
      const props = obj.getInterface('org.freedesktop.DBus.Properties')
      const emit = async () => {
        const meta = (await props.Get(PLAYER, 'Metadata')).value
        const status = (await props.Get(PLAYER, 'PlaybackStatus')).value
        const canControl = (await props.Get(PLAYER, 'CanControl')).value
        this.cb?.(parseMprisMetadata(meta, status, canControl))
      }
      props.on('PropertiesChanged', emit)
      await emit()
      return true
    } catch {
      this.player = null
      return false
    }
  }

  async command(cmd: MediaCmd): Promise<void> {
    if (!this.player) return
    if (cmd === 'playpause') await this.player.PlayPause()
    if (cmd === 'next') await this.player.Next()
    if (cmd === 'previous') await this.player.Previous()
  }

  async stop(): Promise<void> {
    this.bus.disconnect()
  }
}
