import { execFile } from 'node:child_process'
import type { SystemState } from '@shared/types'

// ---- pure parsers (tested) ----
export function parseVolume(out: string): number | null {
  const m = /(\d+)%/.exec(out)
  return m ? Number(m[1]) : null
}
export function parseMuted(out: string): boolean {
  return /Mute:\s*yes/i.test(out)
}
export function parseWifi(out: string): boolean {
  return /enabled/i.test(out)
}
export function parseBluetooth(out: string): boolean {
  return /Powered:\s*yes/i.test(out)
}
export function parseBrightness(out: string): number | null {
  const m = /<(\d+)>/.exec(out)
  return m ? Number(m[1]) : null
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000 }, (err, stdout) => {
      resolve(err ? '' : stdout.toString())
    })
  })
}

const SINK = '@DEFAULT_SINK@'
const BRIGHT = [
  '--session',
  '--dest',
  'org.gnome.SettingsDaemon.Power',
  '--object-path',
  '/org/gnome/SettingsDaemon/Power',
]

/** Reads and controls volume, brightness, Wi-Fi and Bluetooth via CLI tools. */
export class SystemControls {
  async read(): Promise<SystemState> {
    const [vol, mute, wifi, bt, bright] = await Promise.all([
      run('pactl', ['get-sink-volume', SINK]),
      run('pactl', ['get-sink-mute', SINK]),
      run('nmcli', ['radio', 'wifi']),
      run('bluetoothctl', ['show']),
      run('gdbus', [
        'call',
        ...BRIGHT,
        '--method',
        'org.freedesktop.DBus.Properties.Get',
        'org.gnome.SettingsDaemon.Power.Screen',
        'Brightness',
      ]),
    ])
    return {
      volume: parseVolume(vol) ?? 0,
      muted: parseMuted(mute),
      wifi: parseWifi(wifi),
      bluetooth: parseBluetooth(bt),
      brightness: parseBrightness(bright),
    }
  }

  async setVolume(pct: number): Promise<void> {
    const v = Math.max(0, Math.min(100, Math.round(pct)))
    await run('pactl', ['set-sink-volume', SINK, `${v}%`])
  }
  async toggleMute(): Promise<void> {
    await run('pactl', ['set-sink-mute', SINK, 'toggle'])
  }
  async setWifi(on: boolean): Promise<void> {
    await run('nmcli', ['radio', 'wifi', on ? 'on' : 'off'])
  }
  async setBluetooth(on: boolean): Promise<void> {
    await run('bluetoothctl', ['power', on ? 'on' : 'off'])
  }
  async setBrightness(pct: number): Promise<void> {
    const v = Math.max(1, Math.min(100, Math.round(pct)))
    await run('gdbus', [
      'call',
      ...BRIGHT,
      '--method',
      'org.freedesktop.DBus.Properties.Set',
      'org.gnome.SettingsDaemon.Power.Screen',
      'Brightness',
      `<int32 ${v}>`,
    ])
  }
}
