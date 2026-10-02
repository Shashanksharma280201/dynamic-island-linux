import { execFile } from 'node:child_process'
import type { LoopStatus, MediaCmd, MediaState, SysCmd, SystemState } from '@shared/types'
import type { MediaSource, Platform, SystemSource } from './index'
import { electronCursor } from './electronCursor'

/** Run a command; its output, or null if it failed or isn't installed. */
function run(cmd: string, args: string[], timeout = 4000): Promise<string | null> {
  return new Promise((resolve) => execFile(cmd, args, { timeout }, (e, out) => resolve(e ? null : String(out))))
}
const osa = (script: string) => run('osascript', ['-e', script])

// ------------------------------------------------------------- now playing ----

type Player = 'Spotify' | 'Music'

/**
 * What Spotify and Music are playing, one tab-separated line each, without
 * starting either app ("is running" is checked first).
 */
const NOW_PLAYING = `
set out to ""
if application "Spotify" is running then
  tell application "Spotify"
    set s to player state as string
    if s is not "stopped" then
      set t to current track
      set out to out & "Spotify" & tab & s & tab & (name of t) & tab & (artist of t) & tab & ((duration of t) / 1000) & tab & player position & tab & (artwork url of t) & tab & (shuffling as string) & tab & (repeating as string) & linefeed
    end if
  end tell
end if
if application "Music" is running then
  tell application "Music"
    set s to player state as string
    if s is not "stopped" then
      set t to current track
      set out to out & "Music" & tab & s & tab & (name of t) & tab & (artist of t) & tab & (duration of t) & tab & player position & tab & "" & tab & (shuffle enabled as string) & tab & (song repeat as string) & linefeed
    end if
  end tell
end if
return out`

/** The player to show from the script's lines: a playing one first. Pure. */
export function parseNowPlaying(out: string, now = Date.now()): (MediaState & { player: Player }) | null {
  const players = out
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((f) => f.length >= 9 && (f[0] === 'Spotify' || f[0] === 'Music'))
    .map((f) => {
      const [player, state, title, artist, length, position, art, shuffle, repeat] = f
      const num = (v: string) => {
        const n = Number(v.replace(',', '.'))
        return Number.isFinite(n) ? n : undefined
      }
      const loop: LoopStatus | undefined =
        player === 'Spotify' ? (repeat === 'true' ? 'Playlist' : 'None') : repeat === 'one' ? 'Track' : repeat === 'all' ? 'Playlist' : 'None'
      return {
        player: player as Player,
        title,
        artist,
        artUrl: art || undefined,
        playing: state === 'playing',
        canControl: true,
        length: num(length),
        position: num(position),
        positionAt: now,
        canSeek: true,
        shuffle: shuffle === 'true',
        loop,
      }
    })
  return players.find((p) => p.playing) ?? players[0] ?? null
}

/** The AppleScript for a media button. Pure. */
export function mediaScript(player: Player, c: MediaCmd, s?: MediaState): string | null {
  const tell = (what: string) => `tell application "${player}" to ${what}`
  if (c === 'playpause') return tell('playpause')
  if (c === 'next') return tell('next track')
  if (c === 'previous') return tell('previous track')
  if (c === 'shuffle') return player === 'Spotify' ? tell('set shuffling to not shuffling') : tell('set shuffle enabled to not shuffle enabled')
  if (c === 'loop') {
    if (player === 'Spotify') return tell('set repeating to not repeating')
    const next = s?.loop === 'None' ? 'all' : s?.loop === 'Playlist' ? 'one' : 'off'
    return tell(`set song repeat to ${next}`)
  }
  if (typeof c === 'object' && c.type === 'seek') return tell(`set player position to ${Math.max(0, Math.round(c.position))}`)
  return null
}

class MacMedia implements MediaSource {
  private cb: ((s: MediaState | null) => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private last: (MediaState & { player: Player }) | null = null
  private key = 'init'

  onChange(cb: (s: MediaState | null) => void): void {
    this.cb = cb
  }

  async start(): Promise<void> {
    await this.poll()
    this.timer = setInterval(() => void this.poll(), 1500)
  }

  private async poll(): Promise<void> {
    const out = await osa(NOW_PLAYING)
    if (out === null) return // not allowed yet (Automation permission) or busy
    const s = parseNowPlaying(out)
    const key = s ? `${s.player}|${s.title}|${s.artist}|${s.playing}|${s.shuffle}|${s.loop}` : 'none'
    const jumped = s && this.last && s.title === this.last.title && Math.abs((s.position ?? 0) - (this.last.position ?? 0)) > 3
    this.last = s
    if (key === this.key && !jumped) return
    this.key = key
    this.cb?.(s)
  }

  async command(c: MediaCmd): Promise<void> {
    if (!this.last) return
    const script = mediaScript(this.last.player, c, this.last)
    if (script) await osa(script)
    setTimeout(() => void this.poll(), 250)
  }

  async openUri(uri: string): Promise<boolean> {
    if ((await osa('application "Spotify" is running'))?.trim() !== 'true') return false
    return (await osa(`tell application "Spotify" to play track "${uri.replace(/[^\w:./-]/g, '')}"`)) !== null
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

// ---------------------------------------------------------- system controls ----

/** "50,false" from get volume settings. Pure. */
export function parseVolumeSettings(out: string): { volume: number; muted: boolean } | null {
  const m = /^\s*(\d+|missing value)\s*,\s*(true|false|missing value)/.exec(out)
  if (!m || m[1] === 'missing value') return null
  return { volume: Number(m[1]), muted: m[2] === 'true' }
}

/** The Wi-Fi device ("en0") from networksetup -listallhardwareports. Pure. */
export function wifiDevice(out: string): string | null {
  return /Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\S+)/.exec(out)?.[1] ?? null
}

/** "Wi-Fi Power (en0): On". Pure. */
export function parseAirportPower(out: string): boolean | null {
  const m = /:\s*(On|Off)\s*$/im.exec(out)
  return m ? m[1].toLowerCase() === 'on' : null
}

/** `brightness -l`: "display 0: brightness 0.750000". Pure. */
export function parseBrightnessList(out: string): number | null {
  const m = /brightness\s+([\d.]+)/.exec(out)
  return m ? Math.round(Number(m[1]) * 100) : null
}

class MacSystem implements SystemSource {
  private wifi: string | null | undefined

  private async wifiDev(): Promise<string | null> {
    if (this.wifi === undefined) this.wifi = wifiDevice((await run('networksetup', ['-listallhardwareports'])) ?? '')
    return this.wifi
  }

  async read(): Promise<SystemState> {
    const dev = await this.wifiDev()
    const [vol, wifi, bt, bright] = await Promise.all([
      osa('set v to get volume settings\nreturn (output volume of v as string) & "," & (output muted of v as string)'),
      dev ? run('networksetup', ['-getairportpower', dev]) : Promise.resolve(null),
      run('blueutil', ['-p']), // optional: brew install blueutil
      run('brightness', ['-l']), // optional: brew install brightness
    ])
    const v = parseVolumeSettings(vol ?? '')
    return {
      volume: v?.volume ?? 0,
      muted: v?.muted ?? false,
      wifi: wifi === null ? null : parseAirportPower(wifi),
      bluetooth: bt === null ? null : bt.trim() === '1',
      brightness: bright === null ? null : parseBrightnessList(bright),
    }
  }

  async apply(c: SysCmd): Promise<void> {
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
    switch (c.type) {
      case 'volume':
        await osa(`set volume output volume ${clamp(c.value)}`)
        break
      case 'mute':
        await osa('set volume output muted not (output muted of (get volume settings))')
        break
      case 'wifi': {
        const dev = await this.wifiDev()
        if (dev) await run('networksetup', ['-setairportpower', dev, c.value ? 'on' : 'off'])
        break
      }
      case 'bluetooth':
        await run('blueutil', ['-p', c.value ? '1' : '0'])
        break
      case 'brightness':
        await run('brightness', [String(clamp(c.value) / 100)])
        break
    }
  }
}

/**
 * macOS: Spotify and Music through AppleScript (macOS asks once to allow
 * it), volume and Wi-Fi with the system's own tools, and Bluetooth or
 * brightness when blueutil or brightness are installed. Other apps'
 * notifications can't be read on macOS.
 */
export function darwin(): Platform {
  return {
    id: 'darwin',
    media: () => new MacMedia(),
    system: () => new MacSystem(),
    notifications: false,
    readCursor: electronCursor,
    cursorPhysical: false,
  }
}
