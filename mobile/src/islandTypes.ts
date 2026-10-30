/**
 * What the island sends the phone (protocol version 1). A copy of the types
 * in the island's shared/phone.ts (tests/dropPhone.test.ts checks they match).
 */
export const PHONE_PROTOCOL = 1

export type PhoneLine = { label: string; value: string; tone?: 'up' | 'down' | 'neutral' | 'warn' }

export type PhoneApproval = {
  id: string
  kind: 'claude' | 'question' | 'plan' | 'agent' | 'trade'
  /** "Claude Code", "Trading", the app the assistant wants to use. */
  app: string
  color: string
  title: string
  /** The command, the file, the plan… */
  body: string
  /** The project folder it's in. */
  where?: string
  lines?: PhoneLine[]
  note?: string
  allow: string
  deny: string
  /** Claude offered a rule to stop asking ("always allow"). */
  canAlways?: boolean
  questions?: { question: string; header?: string; multiSelect: boolean; options: { label: string; description?: string }[] }[]
  /** A trade expires (epoch ms on the computer's clock) … */
  deadline?: number
  /** … in this many seconds from when the view was made (the phone counts down from this). */
  secondsLeft?: number
}

export type PhoneMedia = {
  title: string
  artist: string
  playing: boolean
  canControl: boolean
  /** A cover: an https URL, or /island/art when it's a file on the computer. */
  art?: string
  length?: number
  position?: number
  positionAt?: number
}

export type PhoneSession = { id: string; agent: string; project: string; phase: string; prompt?: string; step?: string; added: number; removed: number }

export type PhoneNote = { id: string; at: number; app: string; title: string; body?: string; source: string; urgency?: string }

export type PhoneTrading = { app: string; text: string; short: string; tone: string; detail: string; color: string }

export type PhoneView = {
  protocol: number
  at: number
  /** This computer's name. */
  name: string
  approvals: PhoneApproval[]
  media: PhoneMedia | null
  sessions: PhoneSession[]
  notes: PhoneNote[]
  trading: PhoneTrading | null
  dnd: boolean
}

/** A file the computer is sending to the phone. */
export type PhoneIncoming = { id: string; name: string; size: number; kind: string; thumb?: string; side: 'left' | 'right' | 'top' | 'bottom'; at: number }
