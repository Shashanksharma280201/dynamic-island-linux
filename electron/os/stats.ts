import { readFileSync, readdirSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { cpuPercent, cpuTotals, memPercent, parseBattery, parseMemAvailable, type Battery, type CpuTotals, type SystemStats } from '@shared/dashboard'

const GB = 1024 ** 3
const gb = (bytes: number) => Math.round((bytes / GB) * 10) / 10

/**
 * How busy this computer is, read only when the Dashboard asks: the processor
 * since the last time it asked, memory in use and (on Linux) the battery.
 */
export class SystemMeter {
  private last: CpuTotals = cpuTotals(cpus())
  private lastAt = Date.now()
  private cpu = 0

  constructor(private d: { platform?: NodeJS.Platform; powerDir?: string; meminfo?: string; fake?: string } = {}) {}

  read(): SystemStats {
    // Tests: fixed numbers, so pictures of the panel don't change from run to run.
    if (this.d.fake) {
      try {
        return JSON.parse(this.d.fake) as SystemStats
      } catch {
        // not JSON: read the real ones
      }
    }
    const now = Date.now()
    // Two readings a moment apart say nothing: keep the last number.
    if (now - this.lastAt >= 500) {
      const t = cpuTotals(cpus())
      this.cpu = cpuPercent(this.last, t)
      this.last = t
      this.lastAt = now
    }
    const total = totalmem()
    const available = this.available() ?? freemem()
    const platform = this.d.platform ?? process.platform
    return {
      cpu: this.cpu,
      mem: memPercent(total, available),
      memUsedGb: gb(Math.max(0, total - available)),
      memTotalGb: gb(total),
      ...(platform === 'linux' ? { battery: this.battery() } : {}),
    }
  }

  /** Linux counts memory it can give back at once (caches) as used; MemAvailable doesn't. */
  private available(): number | null {
    if ((this.d.platform ?? process.platform) !== 'linux') return null
    try {
      return parseMemAvailable(readFileSync(this.d.meminfo ?? '/proc/meminfo', 'utf8'))
    } catch {
      return null
    }
  }

  /** The computer's own battery (not a mouse's or a headset's); null when it has none. */
  private battery(): Battery | null {
    const dir = this.d.powerDir ?? '/sys/class/power_supply'
    const read = (name: string, file: string) => {
      try {
        return readFileSync(join(dir, name, file), 'utf8')
      } catch {
        return ''
      }
    }
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      return null
    }
    for (const n of names.sort()) {
      if (read(n, 'type').trim() !== 'Battery' || read(n, 'scope').trim() === 'Device') continue
      const b = parseBattery(read(n, 'capacity'), read(n, 'status'))
      if (b) return b
    }
    return null
  }
}
