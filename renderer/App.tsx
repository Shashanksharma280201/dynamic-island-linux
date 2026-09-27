import { useEffect, useState } from 'react'
import type { Activity } from '@shared/types'
import { Island } from './island/Island'

export function App() {
  const [list, setList] = useState<Activity[]>([])
  useEffect(() => window.island.onState(setList), [])
  // The island's Chromium isn't told when X focus moves to another app (we
  // take focus behind its back), so main watches and tells us; fields that
  // took the keyboard listen for 'blur' and let go.
  useEffect(() => window.island.onFocusLost(() => window.dispatchEvent(new Event('blur'))), [])
  // Frosted glass: a snapshot of what's behind the island, blurred in CSS.
  useEffect(
    () =>
      window.island.onBackdrop((img) => {
        const root = document.documentElement
        if (img) root.style.setProperty('--backdrop', `url("${img}")`)
        else root.style.removeProperty('--backdrop')
        root.dataset.frost = img ? 'yes' : 'no'
      }),
    [],
  )
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
