import { powerMonitor } from 'electron'

/** Away or locked means the island's decorations can rest. Pure. */
export const calmFrom = (state: string): boolean => state === 'idle' || state === 'locked'

/**
 * Watches for you being away (no keyboard or mouse for `awayS` seconds) or
 * the screen being locked, and says when that changes. While away it looks
 * every second, so things move again as soon as you're back; `poke()` (the
 * pointer moved) looks at once.
 */
export function watchCalm(onChange: (calm: boolean) => void, awayS = Number(process.env.DI_AWAY_S) || 60): { poke: () => void; stop: () => void } {
  let calm = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const check = (): void => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    let next = false
    try {
      next = calmFrom(powerMonitor.getSystemIdleState(awayS))
    } catch {
      next = false
    }
    if (next !== calm) {
      calm = next
      onChange(calm)
    }
    timer = setTimeout(check, calm ? 1000 : 5000)
    timer.unref?.()
  }
  const away = (): void => {
    if (!calm) {
      calm = true
      onChange(true)
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(check, 1000)
    timer.unref?.()
  }
  powerMonitor.on('lock-screen', away)
  powerMonitor.on('suspend', away)
  powerMonitor.on('unlock-screen', check)
  powerMonitor.on('resume', check)
  check()
  return {
    poke: () => calm && check(),
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      powerMonitor.off('lock-screen', away)
      powerMonitor.off('suspend', away)
      powerMonitor.off('unlock-screen', check)
      powerMonitor.off('resume', check)
    },
  }
}
