import type { ReactNode } from 'react'
import type { HubTab } from './Hub'
import { SlidersIcon, ChatIcon, MailIcon, NoteIcon, GearIcon } from '../icons'

const ITEMS: { id: HubTab; label: string; icon: ReactNode }[] = [
  { id: 'controls', label: 'Controls', icon: <SlidersIcon /> },
  { id: 'chats', label: 'Chats', icon: <ChatIcon /> },
  { id: 'mail', label: 'Mail', icon: <MailIcon /> },
  { id: 'notes', label: 'Notes', icon: <NoteIcon /> },
]

/** Detached glass pill of section icons beside the panel. */
export function Rail({ tab, onTab }: { tab: HubTab; onTab: (t: HubTab) => void }) {
  return (
    <div className="rail" role="tablist" aria-orientation="vertical" onClick={(e) => e.stopPropagation()}>
      {ITEMS.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={tab === it.id}
          aria-label={it.label}
          title={it.label}
          className={`rail-btn${tab === it.id ? ' on' : ''}`}
          onClick={() => onTab(it.id)}
        >
          {it.icon}
        </button>
      ))}
      <span className="rail-sep" />
      <button className="rail-btn small" title="Settings" aria-label="Settings" onClick={() => window.island.openSettings()}>
        <GearIcon />
      </button>
    </div>
  )
}
