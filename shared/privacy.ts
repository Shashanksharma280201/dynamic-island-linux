/** One kind of send off this computer, counted per day. */
export type EgressEntry = {
  /** assistant, brain, wallpaper, services, buddy… */
  feature: string
  /** Where it went: a host (api.anthropic.com) or a name (Anthropic, through Claude Code). */
  to: string
  /** What went, in words: "your question and 2 earlier turns". */
  what: string
  /** The latest time today, and the first. */
  at: number
  first: number
  count: number
}

/** Settings › Privacy. */
export type PrivacyView = {
  paused: boolean
  recent: EgressEntry[]
  places: { to: string; count: number; last: number; features: string[] }[]
  total: number
}

/** What each feature is called on the Privacy page. */
export const FEATURE_NAMES: Record<string, string> = {
  assistant: 'Assistant',
  brain: 'Second brain',
  wallpaper: 'Wallpaper',
  services: 'Services',
  buddy: 'Buddy',
  claude: 'Claude Code',
  notifications: 'Notifications',
}

/** "3 min ago", "yesterday 18:04", "12 Nov 09:30". Pure. */
export function whenText(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  const d = new Date(at)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const today = new Date(now)
  if (d.toDateString() === today.toDateString()) return `today ${time}`
  const y = new Date(now - 86_400_000)
  if (d.toDateString() === y.toDateString()) return `yesterday ${time}`
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}
