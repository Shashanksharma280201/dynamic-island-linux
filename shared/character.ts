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

export type CharacterId = 'orbit' | 'bolt' | 'puff'

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
  { id: 'puff', name: 'Puff', kind: 'Soft dumpling', personality: 'Gentle and cheerful. Squishes when it is happy, melts when it is sleepy.' },
]

export const DEFAULT_CHARACTER: CharacterId = 'orbit'

/** What the character wears ('auto' follows the season). */
export const OUTFITS = ['none', 'auto', 'beanie', 'cap', 'crown', 'headphones', 'glasses', 'sunglasses', 'bowtie', 'party', 'flower', 'santa', 'witch', 'tophat', 'scarf'] as const
export type Outfit = (typeof OUTFITS)[number]
/** Something to wear (not 'auto'). */
export type Wear = Exclude<Outfit, 'auto'>

export const OUTFIT_LABEL: Record<Outfit, string> = {
  none: 'Nothing',
  auto: 'Seasonal',
  beanie: 'Beanie',
  cap: 'Cap',
  crown: 'Crown',
  headphones: 'Headphones',
  glasses: 'Glasses',
  sunglasses: 'Sunglasses',
  bowtie: 'Bow tie',
  party: 'Party hat',
  flower: 'Flower',
  santa: 'Santa hat',
  witch: 'Witch hat',
  tophat: 'Top hat',
  scarf: 'Scarf',
}

/** Body colours to pick from (null: the character's own). */
export const BODY_COLORS: { id: string; label: string; color: string | null }[] = [
  { id: 'own', label: 'Its own', color: null },
  { id: 'coral', label: 'Coral', color: '#ff6b6b' },
  { id: 'sun', label: 'Sunshine', color: '#ffc93c' },
  { id: 'mint', label: 'Mint', color: '#3ddc97' },
  { id: 'sky', label: 'Sky', color: '#5ac8fa' },
  { id: 'iris', label: 'Iris', color: '#7d7aff' },
  { id: 'lilac', label: 'Lilac', color: '#c77dff' },
  { id: 'rose', label: 'Rose', color: '#ff7eb6' },
]

/** The character as configured: which one, what you call it, what it wears, its colour. */
export type CharacterConfig = { id: CharacterId; name: string; outfit?: Outfit; color?: string | null }

/**
 * What 'auto' wears on a day: a witch hat at Halloween, a Santa hat in
 * December, a party hat at New Year, a flower around Valentine's Day, a beanie
 * the rest of the winter, sunglasses in summer, else nothing. Pure.
 */
export function seasonalOutfit(d: Date): Wear {
  const m = d.getMonth() + 1
  const day = d.getDate()
  if ((m === 12 && day === 31) || (m === 1 && day <= 2)) return 'party'
  if (m === 10 && day >= 20) return 'witch'
  if (m === 12 && day <= 26) return 'santa'
  if (m === 2 && day >= 7 && day <= 14) return 'flower'
  if (m === 12 || m <= 2) return 'beanie'
  if ((m === 6 && day >= 21) || m === 7 || m === 8) return 'sunglasses'
  return 'none'
}

/** What it wears today. Pure. */
export function wearing(outfit: Outfit | undefined, now: Date): Wear {
  return !outfit || outfit === 'auto' ? (outfit === 'auto' ? seasonalOutfit(now) : 'none') : outfit
}

/** Validate a stored character setting. Pure. */
export function parseCharacter(raw: any): CharacterConfig {
  // The soft blob was called Mochi before; that name belongs to another app.
  const legacy = raw?.id === 'mochi'
  const id = legacy ? 'puff' : raw?.id
  const info = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER)!
  let name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 24) : ''
  if (legacy && name === 'Mochi') name = ''
  const outfit: Outfit = (OUTFITS as readonly string[]).includes(raw?.outfit) ? raw.outfit : 'auto'
  const color = BODY_COLORS.some((c) => c.color && c.color === raw?.color) ? (raw.color as string) : null
  return { id: info.id, name: name || info.name, outfit, color }
}

/** The colour of each mood: the aura ring, the body tint, the card's edge light. */
export const MOOD_COLOR: Record<CharacterMood, string | null> = {
  idle: null,
  listening: '#64d2ff',
  thinking: '#bf5af2',
  searching: '#5e5ce6',
  writing: '#0a84ff',
  working: '#0a84ff',
  done: '#30d158',
  attention: '#ff9f0a',
  error: '#ff453a',
  sleeping: null,
  dancing: '#ff375f',
}

/**
 * How the aura ring shows a mood: a spinning arc while busy, a full breathing
 * ring when it needs you, a full ring when done, none at rest. Pure.
 */
export function ringKind(mood: CharacterMood): 'busy' | 'alert' | 'full' | null {
  if (mood === 'listening' || mood === 'thinking' || mood === 'searching' || mood === 'writing' || mood === 'working') return 'busy'
  if (mood === 'attention' || mood === 'error') return 'alert'
  if (mood === 'done' || mood === 'dancing') return 'full'
  return null
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
      if (tool === 'approval') return 'attention'
      if (tool && (SEARCH_TOOLS.includes(tool) || /(^|_)(search|read|list|find|get)(_|$)/.test(tool))) return 'searching'
      if (tool && (WRITE_TOOLS.includes(tool) || /(^|_)(create|write|update|save|add|edit)(_|$)/.test(tool))) return 'writing'
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

/** Where the eyes look toward a pointer this far away (px): -1..1, a soft curve that never quite reaches the edge. Pure. */
export function gazeToward(dx: number, dy: number): [number, number] {
  return [Math.tanh(dx / 300), Math.tanh(dy / 220)]
}
