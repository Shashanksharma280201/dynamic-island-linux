/**
 * Which "thinking orb" animation fits what's happening: one visual language
 * for an assistant at work, wherever it shows on the island. Pure.
 */
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
