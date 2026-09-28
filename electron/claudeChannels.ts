/** IPC channels for the island's Claude tab. */
export const CLAUDE = {
  STATE: 'claude:state', // invoke -> ClaudeView
  CHANGED: 'claude:changed', // main -> renderer: ClaudeView
  ASK: 'claude:ask', // invoke(text)
  STOP: 'claude:stop',
  NEW: 'claude:new',
  PICK_FOLDER: 'claude:pick-folder', // invoke -> chosen path | null
  SET_BRIDGE: 'claude:set-bridge', // invoke(on): install the usage status line
  SET_APPROVALS: 'claude:set-approvals', // invoke(on): install the approvals hook
  STT_ENSURE: 'claude:stt-ensure', // invoke: download the speech model if needed
  VOICE: 'claude:voice', // main -> renderer: talk shortcut pressed
} as const
