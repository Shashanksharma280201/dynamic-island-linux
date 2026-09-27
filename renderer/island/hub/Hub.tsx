import { useEffect, useState } from 'react'
import type { InboxSources, SystemState } from '@shared/types'
import { ControlCenter } from '../states/ControlCenter'
import { ChatsView } from './ChatsView'
import { MailView } from './MailView'
import { useLoad } from './common'

export type HubTab = 'controls' | 'chats' | 'mail'

const TABS: { id: HubTab; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'chats', label: 'Chats' },
  { id: 'mail', label: 'Mail' },
]

function savedTab(): HubTab {
  try {
    const t = localStorage.getItem('hub-tab')
    return t === 'chats' || t === 'mail' ? t : 'controls'
  } catch {
    return 'controls'
  }
}

/**
 * The panel that opens when you click the island: Control Center, WhatsApp
 * chats and the mail inbox, switched with a segmented control. Browsable any
 * time, not only when something new arrives.
 */
export function Hub({
  sys,
  onTyping,
  initialTab,
}: {
  sys: SystemState | null
  onTyping: (on: boolean) => void
  initialTab?: HubTab
}) {
  const [tab, setTab] = useState<HubTab>(initialTab ?? savedTab())
  const { data: sources } = useLoad<InboxSources>(
    () => window.island.inbox.sources(),
    [],
    (reload) =>
      window.island.inbox.onChanged((w) => {
        if (w === 'sources') reload()
      }),
  )

  useEffect(() => {
    try {
      localStorage.setItem('hub-tab', tab)
    } catch {
      // storage unavailable
    }
  }, [tab])

  return (
    <div className={`card panel hub ${tab}`} onClick={(e) => e.stopPropagation()}>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'controls' && <ControlCenter sys={sys} />}
      {tab === 'chats' && sources && <ChatsView sources={sources} onTyping={onTyping} />}
      {tab === 'mail' && sources && <MailView sources={sources} onTyping={onTyping} />}
    </div>
  )
}
