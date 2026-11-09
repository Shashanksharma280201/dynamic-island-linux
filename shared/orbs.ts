/**
 * Which "thinking orb" animation fits what's happening: one visual language
 * for an assistant at work, wherever it shows on the island. Pure.
 */
import type { CharacterMood } from './character'

export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping'

/** A tool an agent is using → its orb: looking things up searches, editing composes, … */
export function orbForTool(name?: string): OrbState {
  if (!name) return 'working'
  if (/^(Read|Grep|Glob|LS|WebSearch|NotebookRead|ListMcpResources|ReadMcpResource)/.test(name)) return 'searching'
  if (/^(Edit|MultiEdit|Write|NotebookEdit)/.test(name)) return 'composing'
  if (/^(WebFetch|mcp__)/.test(name)) return 'connecting'
  if (/^(Task|Agent)/.test(name)) return 'weaving'
  if (/^(TodoWrite|ExitPlanMode|EnterPlanMode)/.test(name)) return 'shaping'
  return 'working'
}

/** An agent's turn → its orb. */
export function orbForRun(phase: string, tool?: string): OrbState {
  switch (phase) {
    case 'starting':
      return 'connecting'
    case 'thinking':
      return 'solving'
    case 'tool':
      return orbForTool(tool)
    case 'writing':
      return 'composing'
    default:
      return 'breathing'
  }
}

/** Talking to the island → its orb. */
export function orbForVoice(phase: string): OrbState {
  switch (phase) {
    case 'listening':
      return 'listening'
    case 'transcribing':
      return 'weaving'
    case 'preparing':
      return 'connecting'
    default:
      return 'breathing'
  }
}

/**
 * The character's orb in each mood: its own motion (the ring around it
 * carries the mood's colour). Resting, it's a globe of dots turning slowly.
 */
export const ORB_FOR_MOOD: Record<CharacterMood, OrbState> = {
  idle: 'searching',
  listening: 'listening',
  thinking: 'solving',
  searching: 'searching',
  writing: 'composing',
  working: 'working',
  done: 'searching',
  attention: 'connecting',
  error: 'searching',
  sleeping: 'searching',
  dancing: 'weaving',
}

/** How fast the orb moves in a mood: resting slowly, asleep not at all. Pure. */
export function orbSpeed(mood: CharacterMood): number {
  return mood === 'sleeping' ? 0 : mood === 'idle' || mood === 'error' ? 0.25 : mood === 'done' ? 0.6 : 1
}

/**
 * Frames a second for the character's orb in a mood: busy ones at 24,
 * resting ones at 10 (they turn slowly, and every frame costs the island a
 * repaint), asleep none (it holds still). Pure.
 */
export function orbFps(mood: CharacterMood): number {
  const v = orbSpeed(mood)
  return v === 0 ? 0 : v < 1 ? 10 : 24
}
