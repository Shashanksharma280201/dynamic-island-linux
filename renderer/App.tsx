import { useEffect, useState } from 'react'
import type { Activity } from '@shared/types'
import { Island } from './island/Island'

export function App() {
  const [list, setList] = useState<Activity[]>([])
  useEffect(() => window.island.onState(setList), [])
  useEffect(
    () =>
      window.island.onAppearance(({ appearance, blur }) => {
        document.documentElement.dataset.appearance = appearance
        document.documentElement.dataset.blur = blur ? 'yes' : 'no'
      }),
    [],
  )
  return <Island activities={list} />
}
