/**
 * Packages: what the island can do. Each one can bring a tab in the rail and
 * tools the agent may use; Settings → Packages turns them on or off. Built-in
 * packages for now; the same shape will carry third-party ones later.
 */
export type PackageId = 'basics' | 'notes' | 'chats' | 'mail' | 'music'

/** Rail tabs a package can own. */
export type PackageTab = 'notes' | 'chats' | 'mail' | 'music'

export type PackageToolInfo = {
  name: string
  /** What it does, in plain words. */
  summary: string
  /** It acts on your behalf (sends, plays…), so the agent asks you first. */
  asks?: boolean
}

export type PackageInfo = {
  id: PackageId
  name: string
  description: string
  tab?: PackageTab
  /** What it touches, in plain words. */
  permissions: string[]
  tools: PackageToolInfo[]
  /** Can't be turned off. */
  required?: boolean
}

export const PACKAGES: PackageInfo[] = [
  {
    id: 'basics',
    name: 'Basics',
    description: 'The date and time, so the agent knows when “today” is.',
    permissions: ['The clock'],
    tools: [{ name: 'current_time', summary: 'Tell the date, time and time zone' }],
    required: true,
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Your notes, kept as files on this computer. The agent can find, read and write them.',
    tab: 'notes',
    permissions: ['Your notes folder'],
    tools: [
      { name: 'notes_search', summary: 'Find notes' },
      { name: 'notes_read', summary: 'Read a note' },
      { name: 'notes_create', summary: 'Write a new note' },
    ],
  },
  {
    id: 'chats',
    name: 'WhatsApp',
    description: 'Your chats on the island, and an agent that can catch you up and reply for you.',
    tab: 'chats',
    permissions: ['Your WhatsApp chats (linked device)'],
    tools: [
      { name: 'chats_list', summary: 'List recent chats and unread counts' },
      { name: 'chats_read', summary: 'Read a chat' },
      { name: 'chats_send', summary: 'Send a message', asks: true },
    ],
  },
  {
    id: 'mail',
    name: 'Mail',
    description: 'Your inbox on the island, and an agent that can summarise and answer mail.',
    tab: 'mail',
    permissions: ['Your mail accounts'],
    tools: [
      { name: 'mail_list', summary: 'List recent mail' },
      { name: 'mail_read', summary: 'Read an email' },
      { name: 'mail_reply', summary: 'Reply to an email', asks: true },
    ],
  },
  {
    id: 'music',
    name: 'Music',
    description: 'Spotify in its own style, plus control of whatever is playing.',
    tab: 'music',
    permissions: ['Media players on this computer', 'Your Spotify account (if connected)'],
    tools: [
      { name: 'music_now_playing', summary: 'Say what’s playing' },
      { name: 'music_control', summary: 'Play, pause, skip' },
      { name: 'spotify_play', summary: 'Find and play a song, album or playlist on Spotify' },
    ],
  },
]

export function packageInfo(id: PackageId): PackageInfo | undefined {
  return PACKAGES.find((p) => p.id === id)
}

/** Saved: the packages you turned off (new packages start on). */
export type PackagesConfig = { disabled: PackageId[] }

/** Validate the stored package settings. Pure. */
export function parsePackages(raw: any): PackagesConfig {
  const ids = new Set(PACKAGES.filter((p) => !p.required).map((p) => p.id))
  const disabled = Array.isArray(raw?.disabled) ? raw.disabled.filter((v: unknown): v is PackageId => ids.has(v as PackageId)) : []
  return { disabled: [...new Set<PackageId>(disabled)] }
}

export function enabledPackages(c: PackagesConfig): PackageId[] {
  return PACKAGES.filter((p) => p.required || !c.disabled.includes(p.id)).map((p) => p.id)
}

/** The rail tabs to show for the enabled packages. Pure. */
export function enabledTabs(c: PackagesConfig): PackageTab[] {
  const on = new Set(enabledPackages(c))
  return PACKAGES.flatMap((p) => (p.tab && on.has(p.id) ? [p.tab] : []))
}
