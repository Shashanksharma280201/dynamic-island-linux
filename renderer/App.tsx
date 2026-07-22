import { useEffect, useState } from 'react'
import type { Activity } from '@shared/types'
import { Island } from './island/Island'

export function App() {
  const [list, setList] = useState<Activity[]>([])
  useEffect(() => {
    ;(window as any).island.onState((a: Activity[]) => setList(a))
  }, [])
  return <Island activities={list} />
}
