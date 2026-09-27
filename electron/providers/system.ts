import { execFile } from 'node:child_process'
import type { SystemState, SysCmd } from '@shared/types'

// ---- pure parsers (tested) ----
export function parseVolume(out: string): number | null {
  const m = /(\d+)%/.exec(out)
  return m ? Number(m[1]) : null
}
export function parseMuted(out: string): boolean {
  return /Mute:\s*yes/i.test(out)
}
/** `nmcli radio wifi` → true/false, null if unrecognised. */
export function parseWifi(out: string): boolean | null {
  const s = out.trim().toLowerCase()
  if (s === 'enabled') return true
  if (s === 'disabled') return false
  return null
}
/** `bluetoothctl show` → Powered state, null if no controller. */
export function parseBluetooth(out: string): boolean | null {
  const m = /Powered:\s*(yes|no)/i.exec(out)
  return m ? m[1].toLowerCase() === 'yes' : null
}
/** gsd-power `Brightness` via gdbus, e.g. `(<35>,)`; -1 means no backlight. */
export function parseBrightness(out: string): number | null {
  const m = /<(-?\d+)>/.exec(out)
  if (!m) return null
  const v = Number(m[1])
  return v >= 0 ? v : null
}
/** `brightnessctl -m` → `device,class,current,percent%,max`. */
export function parseBrightnessctl(out: string): number | null {
  const m = /,(\d+)%,/.exec(out)
  return m ? Number(m[1]) : null
}

export function clampPct(v: number, min = 0): number {
  return Math.max(min, Math.min(100, Math.round(Number(v) || 0)))
}

/** Runs a command; resolves stdout, or null if it failed / isn't installed. */
function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
      resolve(err ? null : stdout.toString())
    })
  })
}

const SINK = '@DEFAULT_SINK@'
const GSD = [
  'call',
  '--session',
  '--dest',
  'org.gnome.SettingsDaemon.Power',
  '--object-path',
  '/org/gnome/SettingsDaemon/Power',
  '--method',
]
const SCREEN = 'org.gnome.SettingsDaemon.Power.Screen'

/**
 * Reads and controls volume, brightness, Wi-Fi and Bluetooth via standard CLI
 * tools (pactl, gdbus or brightnessctl, nmcli, bluetoothctl). Anything that is
 * missing reports null so the UI can hide it.
 */
export class SystemControls {
  private brightnessVia: 'gsd' | 'brightnessctl' | null = null

  async read(): Promise<SystemState> {
    const [vol, mute, wifi, bt, bright] = await Promise.all([
      run('pactl', ['get-sink-volume', SINK]),
      run('pactl', ['get-sink-mute', SINK]),
      run('nmcli', ['radio', 'wifi']),
      run('bluetoothctl', ['show']),
      this.readBrightness(),
    ])
    return {
      volume: parseVolume(vol ?? '') ?? 0,
      muted: parseMuted(mute ?? ''),
      wifi: wifi === null ? null : parseWifi(wifi),
      bluetooth: bt === null ? null : parseBluetooth(bt),
      brightness: bright,
    }
  }

  private async readBrightness(): Promise<number | null> {
    if (this.brightnessVia !== 'brightnessctl') {
      const out = await run('gdbus', [
        ...GSD,
        'org.freedesktop.DBus.Properties.Get',
        SCREEN,
        'Brightness',
      ])
      const v = out === null ? null : parseBrightness(out)
      if (v !== null) {
        this.brightnessVia = 'gsd'
        return v
      }
    }
    const out = await run('brightnessctl', ['-m'])
    const v = out === null ? null : parseBrightnessctl(out)
    this.brightnessVia = v === null ? null : 'brightnessctl'
    return v
  }

  async apply(cmd: SysCmd): Promise<void> {
    switch (cmd.type) {
      case 'volume':
        await run('pactl', ['set-sink-volume', SINK, `${clampPct(cmd.value)}%`])
        break
      case 'mute':
        await run('pactl', ['set-sink-mute', SINK, 'toggle'])
        break
      case 'wifi':
        await run('nmcli', ['radio', 'wifi', cmd.value ? 'on' : 'off'])
        break
      case 'bluetooth':
        await run('bluetoothctl', ['power', cmd.value ? 'on' : 'off'])
        break
      case 'brightness': {
        const v = clampPct(cmd.value, 1)
        if (this.brightnessVia === 'brightnessctl') {
          await run('brightnessctl', ['-q', 'set', `${v}%`])
        } else {
          await run('gdbus', [
            ...GSD,
            'org.freedesktop.DBus.Properties.Set',
            SCREEN,
            'Brightness',
            `<int32 ${v}>`,
          ])
        }
        break
      }
    }
  }
}

/**
 * Serialises commands so at most one runs at a time; while one is running only
 * the latest command of each type is kept (dragging a slider sends many).
 */
export class CommandQueue {
  private queued = new Map<string, SysCmd>()
  private running = false

  constructor(
    private exec: (c: SysCmd) => Promise<void>,
    private onIdle: () => void,
  ) {}

  push(cmd: SysCmd): void {
    // Toggles like mute must not be collapsed into each other.
    const key = cmd.type === 'mute' ? `mute-${Math.random()}` : cmd.type
    this.queued.set(key, cmd)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queued.size > 0) {
        const [key, cmd] = this.queued.entries().next().value!
        this.queued.delete(key)
        await this.exec(cmd).catch(() => {})
      }
    } finally {
      this.running = false
    }
    this.onIdle()
  }
}
