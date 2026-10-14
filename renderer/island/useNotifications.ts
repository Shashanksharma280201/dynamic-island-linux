import { useEffect, useState } from 'react'
import type { CenterView } from '@shared/notifCenter'

const EMPTY: CenterView = { entries: [], unseen: 0, dnd: false }

/** The notification center's list and Do Not Disturb, kept current. */
export function useNotifications(): CenterView {
  const [view, setView] = useState<CenterView>(EMPTY)
  useEffect(() => {
    let live = true
    window.island.notifications
      ?.view()
      .then((v) => live && setView(v))
      .catch(() => {})
    const off = window.island.notifications?.onChanged(setView)
    return () => {
      live = false
      off?.()
    }
  }, [])
  return view
}
