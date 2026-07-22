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
    this.name = names.find((n) => n.startsWith(PREFIX)) ?? null
    if (!this.name) {
      this.cb?.(null)
      return
    }
    await this.bind(this.name)
  }

  private async bind(name: string): Promise<void> {
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
