export type ToolRequest = {
  id: string
  toolName: string
  inputSummary: string
  cwd?: string
}

export type Decision = 'allow' | 'deny' | 'ask'

export type MediaState = {
  title: string
  artist: string
  artUrl?: string
  playing: boolean
  canControl: boolean
}

export type Activity =
  | { kind: 'media'; id: string; priority: number; media: MediaState }
  | { kind: 'approval'; id: string; priority: number; request: ToolRequest }

export const IPC = {
  STATE: 'island:state', // main -> renderer: Activity[]
  DECISION: 'island:decision', // renderer -> main: { id, decision }
  MEDIA_CMD: 'island:media-cmd', // renderer -> main: 'playpause'|'next'|'previous'
  SET_HOVER: 'island:set-hover', // renderer -> main: boolean (mouse passthrough)
} as const

export type DecisionMsg = { id: string; decision: Decision }
export type MediaCmd = 'playpause' | 'next' | 'previous'
