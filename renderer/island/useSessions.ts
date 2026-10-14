import { useEffect, useState } from 'react'
import type { AgentSession } from '@shared/sessions'

/** The agent sessions running in your terminals, kept current. */
export function useSessions(): AgentSession[] {
  const [list, setList] = useState<AgentSession[]>([])
  useEffect(() => {
    let live = true
    window.island.sessions
      ?.list()
      .then((v) => live && setList(v))
      .catch(() => {})
    const off = window.island.sessions?.onChanged(setList)
    return () => {
      live = false
      off?.()
    }
  }, [])
  return list
}

/** Ticks every second while `on`, for live elapsed times. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [on])
  return now
}
