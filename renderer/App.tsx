import { useEffect, useState } from 'react'
import type { Activity } from '@shared/types'
import { Island } from './island/Island'

function presented(list: Activity[]): Activity | null {
  if (list.length === 0) return null
  return [...list].sort((a, b) => b.priority - a.priority)[0]
}

export function App() {
  const [list, setList] = useState<Activity[]>([])
  useEffect(() => {
    ;(window as any).island.onState((a: Activity[]) => setList(a))
  }, [])
  return <Island activity={presented(list)} />
}
