import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import { CHARACTERS, MOODS, type CharacterMood } from '@shared/character'
import { Character } from '../island/character/Character'
import { useAction } from './Settings'

const MOOD_LABEL: Record<CharacterMood, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  searching: 'Searching',
  writing: 'Writing',
  working: 'Working',
  done: 'Done',
  attention: 'Needs you',
  error: 'Something went wrong',
  sleeping: 'Sleeping',
  dancing: 'Music on',
}

/** Settings → Character: pick who lives on the island and name it. */
export function CharacterSection({ s }: { s: SettingsState }) {
  const { run, error } = useAction()
  const [name, setName] = useState(s.character.name)
  useEffect(() => setName(s.character.name), [s.character.name])
  // The previews act out every mood in turn.
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % MOODS.length), 2200)
    return () => clearInterval(t)
  }, [])
  const mood = MOODS[i]
  const saveName = () => {
    if (name.trim() !== s.character.name) void run(() => window.settings.setCharacter({ name }))
  }
  return (
    <section id="character">
      <h2>Character</h2>
      <div className="character-grid" role="radiogroup" aria-label="Character">
        {CHARACTERS.map((c) => {
          const on = c.id === s.character.id
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={on}
              className={`character-tile${on ? ' on' : ''}`}
              onClick={() => !on && run(() => window.settings.setCharacter({ id: c.id }))}
            >
              <Character id={c.id} mood={mood} size={84} label={`${c.name}, ${MOOD_LABEL[mood]}`} />
              <b>{c.name}</b>
              <span className="hint">{c.kind}</span>
            </button>
          )
        })}
      </div>
      <div className="character-mood hint">
        Showing: <b>{MOOD_LABEL[mood]}</b>
      </div>
      <div className="toggle-row">
        <div>
          <div>Name</div>
          <div className="hint">{CHARACTERS.find((c) => c.id === s.character.id)?.personality}</div>
        </div>
        <input
          className="character-name"
          value={name}
          maxLength={24}
          aria-label="Character name"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      {error && <div className="error">{error}</div>}
    </section>
  )
}
