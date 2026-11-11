import { useEffect, useState } from 'react'
import { clockText, clockTitle, msToNextMinute } from '@shared/clock'

/** The time, turning over on the minute (one wake-up a minute). */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      t = setTimeout(tick, msToNextMinute(Date.now()) + 50)
    }
    t = setTimeout(tick, msToNextMinute(Date.now()) + 50)
    return () => clearTimeout(t)
  }, [])
  return now
}

/** The time on the notch's leading side. */
export function NotchClock() {
  const now = useMinute()
  return (
    <span className="notch-clock" title={clockTitle(now)}>
      {clockText(now)}
    </span>
  )
}
