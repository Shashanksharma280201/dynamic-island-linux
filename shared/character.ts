import type { RunPhase } from './claude'

/**
 * The island's character: the face of the agent. Every character supports
 * the same moods, so any character works with every feature.
 */
export type CharacterMood =
  | 'idle' // blinks, looks around
  | 'listening' // eyes wide, leaning in
  | 'thinking' // looks up, thought dots
  | 'searching' // magnifier
  | 'writing' // pencil
  | 'working' // gear
  | 'done' // happy eyes, sparkles
  | 'attention' // needs you: wobble and "!"
  | 'error' // upset
  | 'sleeping' // eyes closed, z z
  | 'dancing' // music is playing

export const MOODS: CharacterMood[] = [
  'idle',
  'listening',
  'thinking',
  'searching',
  'writing',
  'working',
  'done',
  'attention',
  'error',
  'sleeping',
  'dancing',
]

export type CharacterId = 'orbit' | 'bolt' | 'mochi'

export type CharacterInfo = {
  id: CharacterId
  /** Default name (the user can rename it). */
  name: string
  kind: string
  /** How it behaves; also shapes how the agent talks. */
  personality: string
}

export const CHARACTERS: CharacterInfo[] = [
  { id: 'orbit', name: 'Orbit', kind: 'The orb, with a face', personality: 'Calm and focused. Keeps the swirling thinking and listening effects.' },
  { id: 'bolt', name: 'Bolt', kind: 'Little robot', personality: 'Eager and precise. Its antenna light shows what it is doing.' },
  { id: 'mochi', name: 'Mochi', kind: 'Soft blob', personality: 'Gentle and cheerful. Squishes when it is happy, melts when it is sleepy.' },
]

export const DEFAULT_CHARACTER: CharacterId = 'orbit'

/** The character as configured: which one, and what you call it. */
export type CharacterConfig = { id: CharacterId; name: string }

/** Validate a stored character setting. Pure. */
export function parseCharacter(raw: any): CharacterConfig {
  const info = CHARACTERS.find((c) => c.id === raw?.id) ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER)!
  const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 24) : ''
  return { id: info.id, name: name || info.name }
}

export function characterInfo(id: CharacterId): CharacterInfo {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

const SEARCH_TOOLS = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'LS']
const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

/** The mood for what the agent is doing. Pure. */
export function moodFor(phase: RunPhase | 'idle' | 'listening' | 'transcribing', tool?: string): CharacterMood {
  switch (phase) {
    case 'listening':
      return 'listening'
    case 'transcribing':
    case 'starting':
    case 'thinking':
      return 'thinking'
    case 'writing':
      return 'writing'
    case 'tool':
      if (tool && (SEARCH_TOOLS.includes(tool) || /(^|_)(search|read|list|find|get)(_|$)/.test(tool))) return 'searching'
      if (tool && (WRITE_TOOLS.includes(tool) || /(^|_)(create|write|update|save|add)(_|$)/.test(tool))) return 'writing'
      return 'working'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

/** Resting mood: asleep late at night (23:00 to 06:00), else idle. Pure. */
export function restingMood(now: Date): CharacterMood {
  const h = now.getHours()
  return h >= 23 || h < 6 ? 'sleeping' : 'idle'
}
