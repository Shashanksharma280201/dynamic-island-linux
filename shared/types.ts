export type ToolRequest = {
  id: string
  toolName: string
  inputSummary: string
  toolInput?: Record<string, unknown>
  cwd?: string
  /** Claude's `permission_suggestions` (rules offered for "always allow"). */
  suggestions?: unknown[]
}

export type Decision = 'allow' | 'deny' | 'ask'

export type MediaState = {
  title: string
  artist: string
  artUrl?: string
  playing: boolean
  canControl: boolean
  /** Track length in seconds, if the player reports it. */
  length?: number
  /** Playback position in seconds at `positionAt` (epoch ms). */
  position?: number
  positionAt?: number
}

export type Urgency = 'low' | 'normal' | 'critical'

export type NotificationData = {
  app: string
  summary: string
  body: string
  icon?: string
  urgency?: Urgency
}

type Base = { id: string; priority: number; /** insertion order, newer = larger */ seq?: number }

export type Activity =
  | (Base & { kind: 'media'; media: MediaState })
  | (Base & { kind: 'approval'; request: ToolRequest })
  | (Base & { kind: 'notification'; notification: NotificationData })

export type SystemState = {
  volume: number // 0-100
  muted: boolean
  wifi: boolean | null // null if unavailable
  bluetooth: boolean | null // null if unavailable
  brightness: number | null // 0-100, null if unsupported
}

export type SysCmd =
  | { type: 'volume'; value: number }
  | { type: 'brightness'; value: number }
  | { type: 'mute' }
  | { type: 'wifi'; value: boolean }
  | { type: 'bluetooth'; value: boolean }

export const IPC = {
  STATE: 'island:state', // main -> renderer: Activity[]
  DECISION: 'island:decision', // renderer -> main: DecisionMsg
  MEDIA_CMD: 'island:media-cmd', // renderer -> main: MediaCmd
  REPORT_RECT: 'island:rect', // renderer -> main: island bounding Rect (window coords)
  SYS_STATE: 'island:sys-state', // main -> renderer: SystemState
  SYS_CMD: 'island:sys-cmd', // renderer -> main: SysCmd
  PANEL: 'island:panel', // renderer -> main: boolean (Control Center open)
  HOVER: 'island:hover', // main -> renderer: boolean (cursor over the island)
  DISMISS: 'island:dismiss', // renderer -> main: activity id (dismiss a notification)
} as const

export type DecisionMsg = {
  id: string
  decision: Decision
  /** Deny reason shown to Claude. */
  message?: string
  /** Allow and apply Claude's suggested permission rules. */
  always?: boolean
}
export type MediaCmd = 'playpause' | 'next' | 'previous'

export type { Rect } from './hitbox'
