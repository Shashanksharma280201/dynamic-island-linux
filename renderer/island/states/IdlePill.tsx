import { useEffect, useState } from 'react'
import { restingMood } from '@shared/character'
import { Character, useCharacter } from '../character/Character'
import { MoonIcon } from '../icons'

/**
 * Resting state: the character on the screen edge, with a grab bar. In Do
 * Not Disturb a moon sits on it, with how many notifications are waiting.
 */
export function IdlePill({ dnd = false, waiting = 0 }: { dnd?: boolean; waiting?: number }) {
  const { name } = useCharacter()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div
      className="capsule idle"
      title={dnd ? `${name} · Do Not Disturb${waiting ? ` · ${waiting} waiting in Notifications` : ''}` : `${name} · click for Control Center, drag to move`}
    >
      <Character mood={dnd ? 'sleeping' : restingMood(now)} size={38} track={!dnd} />
      {dnd && (
        <span className="dnd-badge" aria-label="Do Not Disturb">
          <MoonIcon size={9} />
          {waiting > 0 && <span className="dnd-count">{waiting > 99 ? '99+' : waiting}</span>}
        </span>
      )}
      <span className="grip" />
    </div>
  )
}
