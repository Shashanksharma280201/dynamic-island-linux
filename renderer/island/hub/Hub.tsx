import { useRef, type ReactNode } from 'react'
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
import { DocIcon } from '../icons'
import { NotificationsView } from './NotificationsView'
import { TodayView } from './TodayView'
import { AgentsView } from './AgentsView'
import { SessionsView } from './SessionsView'
import { ServicesView, useServices } from './ServicesView'
import { ConnectedView, useConnected } from './ConnectedView'
import type { AgentSession } from '@shared/sessions'
import type { CenterView } from '@shared/notifCenter'

export type HubTab = 'controls' | 'today' | 'agents' | 'alerts' | 'claude' | 'sessions' | 'connected' | 'services' | 'music' | 'chats' | 'mail' | 'notes' | 'docs' | 'crm'

export const HUB_TABS: HubTab[] = ['controls', 'today', 'agents', 'alerts', 'claude', 'sessions', 'connected', 'services', 'music', 'chats', 'mail', 'notes', 'docs', 'crm']

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
 * The panel that opens when you click the island: the island itself grows
 * into it, with its sections in a row across the top (`bar`, see TabBar) and
 * the open one below.
 */
export function Hub({
  sys,
  tab,
  onTyping,
  claude,
  voice,
  incoming,
  dropping,
  center,
  onTab,
  sessions,
  bar,
}: {
  sys: SystemState | null
  /** The row of sections across the top. */
  bar?: ReactNode
  tab: HubTab
  /** The notification center (Notifications tab, Do Not Disturb). */
  center: CenterView
  /** Claude Code sessions in your terminals. */
  sessions: AgentSession[]
  onTab: (t: HubTab) => void
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
  const services = useServices()
  const connected = useConnected()
  // A new tab slides in from the side you went along the bar.
  const last = useRef({ tab, dir: '' })
  if (last.current.tab !== tab) last.current = { tab, dir: HUB_TABS.indexOf(tab) > HUB_TABS.indexOf(last.current.tab) ? 'from-right' : 'from-left' }
  return (
    <div className="hub-shell" onClick={(e) => e.stopPropagation()}>
      {bar}
      <div key={tab} className={`card panel hub ${tab} ${last.current.dir}`}>
      {tab === 'controls' && <ControlCenter sys={sys} dnd={center.dnd} />}
      {tab === 'today' && <TodayView onTyping={onTyping} />}
      {tab === 'agents' && <AgentsView sessions={sessions} onTyping={onTyping} />}
      {tab === 'alerts' && <NotificationsView center={center} onOpen={onTab} />}
      {tab === 'chats' && sources && <ChatsView sources={sources} onTyping={onTyping} />}
      {tab === 'mail' && sources && <MailView sources={sources} onTyping={onTyping} />}
      {tab === 'notes' && <NotesView onTyping={onTyping} />}
      {tab === 'claude' && <ClaudePanel view={claude} voice={voice} onTyping={onTyping} />}
      {tab === 'sessions' && <SessionsView sessions={sessions} claude={claude} />}
      {tab === 'connected' && <ConnectedView state={connected} />}
      {tab === 'services' && <ServicesView list={services} />}
      {tab === 'music' && <MusicView onTyping={onTyping} />}
      {tab === 'docs' && <DocsView claude={claude} onTyping={onTyping} incoming={incoming} />}
      {tab === 'crm' && <CrmView claude={claude} onTyping={onTyping} />}
      {dropping && <DropZone />}
      </div>
    </div>
  )
}

/** Shown over the panel while files are dragged onto the island. */
function DropZone() {
  return (
    <div className="drop-zone" aria-hidden>
      <DocIcon size={34} />
      <div className="title">Drop to add to Documents</div>
    </div>
  )
}
