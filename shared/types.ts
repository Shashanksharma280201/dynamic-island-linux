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

export type NotificationData = {
  app: string
  summary: string
  body: string
  icon?: string
}

export type Activity =
  | { kind: 'media'; id: string; priority: number; media: MediaState }
  | { kind: 'approval'; id: string; priority: number; request: ToolRequest }
  | { kind: 'notification'; id: string; priority: number; notification: NotificationData }

export const IPC = {
  STATE: 'island:state', // main -> renderer: Activity[]
  DECISION: 'island:decision', // renderer -> main: { id, decision }
  MEDIA_CMD: 'island:media-cmd', // renderer -> main: 'playpause'|'next'|'previous'
  SET_HOVER: 'island:set-hover', // renderer -> main: boolean (renderer hover state)
  REPORT_RECT: 'island:rect', // renderer -> main: island bounding Rect (screen coords)
} as const

export type DecisionMsg = { id: string; decision: Decision }
export type MediaCmd = 'playpause' | 'next' | 'previous'

export type { Rect } from './hitbox'
