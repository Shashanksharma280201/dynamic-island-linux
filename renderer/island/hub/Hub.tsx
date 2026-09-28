import type { InboxSources, SystemState } from '@shared/types'
import { ControlCenter } from '../states/ControlCenter'
import { ChatsView } from './ChatsView'
import { MailView } from './MailView'
import { NotesView } from './NotesView'
import { ClaudePanel } from './ClaudePanel'
import type { ClaudeView } from '@shared/claude'
import type { Voice } from '../voice/useVoice'
import { useLoad } from './common'

export type HubTab = 'controls' | 'claude' | 'chats' | 'mail' | 'notes'

export const HUB_TABS: HubTab[] = ['controls', 'claude', 'chats', 'mail', 'notes']

export function savedTab(): HubTab {
  try {
    const t = localStorage.getItem('hub-tab') as HubTab | null
    return t && HUB_TABS.includes(t) ? t : 'controls'
  } catch {
    return 'controls'
  }
}

export function rememberTab(t: HubTab): void {
  try {
    localStorage.setItem('hub-tab', t)
  } catch {
    // storage unavailable
  }
}

/**
 * The panel that opens when you click the island. Which section it shows is
 * picked with the detached icon rail next to it (see Rail).
 */
export function Hub({
  sys,
  tab,
  onTyping,
  claude,
  voice,
}: {
  sys: SystemState | null
  tab: HubTab
  onTyping: (on: boolean) => void
  claude: ClaudeView | null
  voice: Voice
}) {
  const { data: sources } = useLoad<InboxSources>(
    () => window.island.inbox.sources(),
    [],
    (reload) =>
      window.island.inbox.onChanged((w) => {
        if (w === 'sources') reload()
      }),
  )
  return (
    <div className={`card panel hub ${tab}`} onClick={(e) => e.stopPropagation()}>
      {tab === 'controls' && <ControlCenter sys={sys} />}
      {tab === 'chats' && sources && <ChatsView sources={sources} onTyping={onTyping} />}
      {tab === 'mail' && sources && <MailView sources={sources} onTyping={onTyping} />}
      {tab === 'notes' && <NotesView onTyping={onTyping} />}
      {tab === 'claude' && <ClaudePanel view={claude} voice={voice} onTyping={onTyping} />}
    </div>
  )
}
