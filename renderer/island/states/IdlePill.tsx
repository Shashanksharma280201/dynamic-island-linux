import { useEffect, useState } from 'react'
import { restingMood } from '@shared/character'
import type { RestingView } from '@shared/os'
import { Character, useCharacter } from '../character/Character'
import { MoonIcon } from '../icons'

/** What the resting island knows: notes to file and what's next, every minute while it rests (and as it comes to rest). */
export function useResting(atRest: boolean): RestingView | null {
  const [v, setV] = useState<RestingView | null>(null)
  useEffect(() => {
    if (!atRest || !window.island.os) return
    const load = () =>
      window.island
        .os<RestingView>('status.view')
        .then(setV)
        .catch(() => {})
    void load()
    const t = setInterval(load, 60_000)
    // The evening filing (an agent's job) empties the inbox.
    const off = window.island.onOs?.((topic) => topic === 'agents' && void load())
    return () => {
      clearInterval(t)
      off?.()
    }
  }, [atRest])
  return v
}

/**
 * Resting state: the character on the screen edge, with a grab bar. In Do
 * Not Disturb a moon sits on it, with how many notifications are waiting;
 * otherwise a small count of notes waiting to be filed.
 */
export function IdlePill({ dnd = false, waiting = 0, toFile = 0 }: { dnd?: boolean; waiting?: number; toFile?: number }) {
  const { name } = useCharacter()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div
      className="capsule idle"
      title={dnd ? `${name} · Do Not Disturb${waiting ? ` · ${waiting} waiting in Notifications` : ''}` : `${name}${toFile ? ` · ${toFile} to file` : ''} · click for Control Center, drag to move`}
    >
      <Character mood={dnd ? 'sleeping' : restingMood(now)} size={38} track={!dnd} />
      {dnd && (
        <span className="dnd-badge" aria-label="Do Not Disturb">
          <MoonIcon size={9} />
          {waiting > 0 && <span className="dnd-count">{waiting > 99 ? '99+' : waiting}</span>}
        </span>
      )}
      {!dnd && toFile > 0 && (
        <span className="file-badge" aria-label={`${toFile} ${toFile === 1 ? 'note' : 'notes'} to file`}>
          {toFile > 99 ? '99+' : toFile}
        </span>
      )}
      <span className="grip" />
    </div>
  )
}
