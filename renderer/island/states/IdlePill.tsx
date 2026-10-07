import { useEffect, useState } from 'react'
import { restingMood } from '@shared/character'
import { Character, useCharacter } from '../character/Character'

/** Resting state: the character on the screen edge, with a grab bar. */
export function IdlePill() {
  const { name } = useCharacter()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="capsule idle" title={`${name} · click for Control Center, drag to move`}>
      <Character mood={restingMood(now)} size={38} track />
      <span className="grip" />
    </div>
  )
}
