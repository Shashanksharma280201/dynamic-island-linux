import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { parseCharacter, type CharacterConfig, type CharacterMood } from '@shared/character'
import { Character, CharacterContext } from '../island/character/Character'

type State = { mood: CharacterMood; character: CharacterConfig }

// Listening from the very start (before React mounts), so the first state isn't missed.
let latest: State | null = null
const subscribers = new Set<(s: State) => void>()
window.island.companion.onState((s) => {
  latest = { mood: s.mood, character: parseCharacter(s.character) }
  for (const f of subscribers) f(latest)
})

/** The desktop companion: drag it anywhere; a click (without dragging) opens the island. */
function Companion() {
  const [state, setState] = useState<State | null>(latest)
  useEffect(() => {
    subscribers.add(setState)
    if (latest) setState(latest)
    // And ask, in case it was sent before anyone was listening.
    window.island.companion.ready()
    return () => void subscribers.delete(setState)
  }, [])
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null)
  if (!state) return null
  return (
    <div
      className="companion"
      data-mood={state.mood}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.screenX, y: e.screenY, moved: 0 }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.screenX - d.x
        const dy = e.screenY - d.y
        if (!dx && !dy) return
        d.moved += Math.abs(dx) + Math.abs(dy)
        d.x = e.screenX
        d.y = e.screenY
        window.island.companion.move(dx, dy)
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (!d) return
        if (d.moved < 4) window.island.companion.click()
        else window.island.companion.drop()
      }}
    >
      <CharacterContext.Provider value={state.character}>
        <Character mood={state.mood} size={92} track label={`${state.character.name}: click to open the island, drag to move`} />
      </CharacterContext.Provider>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Companion />)
