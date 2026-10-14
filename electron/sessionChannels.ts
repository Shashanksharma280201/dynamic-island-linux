/** IPC channels of the agent sessions running in your terminals. */
export const SESSIONS = {
  LIST: 'sessions:list', // invoke -> AgentSession[]
  FOCUS: 'sessions:focus', // invoke(id) -> boolean: its terminal came to the front
  FORGET: 'sessions:forget', // invoke(id): take it off the island
  CHANGED: 'sessions:changed', // main -> renderer: AgentSession[]
} as const
