import type { InboxSources, SystemState } from '@shared/types'
import { ControlCenter } from '../states/ControlCenter'
import { ChatsView } from './ChatsView'
import { MailView } from './MailView'
import { NotesView } from './NotesView'
import { DocsView, type DocsIncoming } from './DocsView'
import { CrmView } from './crm/CrmView'
import { ClaudePanel } from './ClaudePanel'
import { MusicView } from '../music/MusicView'
import type { ClaudeView } from '@shared/claude'
import type { Voice } from '../voice/useVoice'
import { useLoad } from './common'
import { DocsAppIcon } from './AppIcons'

export type HubTab = 'controls' | 'claude' | 'music' | 'chats' | 'mail' | 'notes' | 'docs' | 'crm'

export const HUB_TABS: HubTab[] = ['controls', 'claude', 'music', 'chats', 'mail', 'notes', 'docs', 'crm']

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
  incoming,
  dropping,
}: {
  sys: SystemState | null
  tab: HubTab
  onTyping: (on: boolean) => void
  claude: ClaudeView | null
  voice: Voice
  /** Files just dropped on the island (for the Documents tab). */
  incoming?: DocsIncoming | null
  /** Files are being dragged over the island. */
  dropping?: boolean
}) {
  const { data: sources } = useLoad<InboxSources>(
    () => window.island.inbox.sources(),
    [],
    (reload) =>
      window.island.inbox.onChanged((w) => {
        if (w === 'sources') reload()
      }),
    'sources',
  )
  return (
    <div className={`card panel hub ${tab}`} onClick={(e) => e.stopPropagation()}>
      {tab === 'controls' && <ControlCenter sys={sys} />}
      {tab === 'chats' && sources && <ChatsView sources={sources} onTyping={onTyping} />}
      {tab === 'mail' && sources && <MailView sources={sources} onTyping={onTyping} />}
      {tab === 'notes' && <NotesView onTyping={onTyping} />}
      {tab === 'claude' && <ClaudePanel view={claude} voice={voice} onTyping={onTyping} />}
      {tab === 'music' && <MusicView onTyping={onTyping} />}
      {tab === 'docs' && <DocsView claude={claude} onTyping={onTyping} incoming={incoming} />}
      {tab === 'crm' && <CrmView claude={claude} onTyping={onTyping} />}
      {dropping && <DropZone />}
    </div>
  )
}

/** Shown over the panel while files are dragged onto the island. */
function DropZone() {
  return (
    <div className="drop-zone" aria-hidden>
      <DocsAppIcon />
      <div className="title">Drop to add to Documents</div>
    </div>
  )
}
