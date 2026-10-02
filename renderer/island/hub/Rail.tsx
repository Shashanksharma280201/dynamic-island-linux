import { useEffect, useState, type ReactNode } from 'react'
import type { InboxUnread } from '@shared/types'
import { currentWindow, type ClaudeUsage, type UsageWindow } from '@shared/claude'
import { resetText } from '@shared/format'
import type { HubTab } from './Hub'
import {
  ClaudeAppIcon,
  ControlsAppIcon,
  DocsAppIcon,
  MailAppIcon,
  NotesAppIcon,
  SettingsAppIcon,
  SpotifyAppIcon,
  WhatsAppIcon,
} from './AppIcons'

const ITEMS: { id: HubTab; label: string; icon: ReactNode }[] = [
  { id: 'controls', label: 'Controls', icon: <ControlsAppIcon /> },
  { id: 'claude', label: 'Claude', icon: <ClaudeAppIcon /> },
  { id: 'music', label: 'Music', icon: <SpotifyAppIcon /> },
  { id: 'chats', label: 'Chats', icon: <WhatsAppIcon /> },
  { id: 'mail', label: 'Mail', icon: <MailAppIcon /> },
  { id: 'notes', label: 'Notes', icon: <NotesAppIcon /> },
  { id: 'docs', label: 'Documents', icon: <DocsAppIcon /> },
]

/** Badge text: nothing for 0, "99+" past 99. Pure. */
export function badgeText(n: number | null | undefined): string {
  if (!n || n < 0) return ''
  return n > 99 ? '99+' : String(n)
}

/** Unread counts for the badges, kept fresh while the rail is showing. */
function useUnread(): InboxUnread | null {
  const [u, setU] = useState<InboxUnread | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      window.island.inbox
        .unread()
        .then((v) => live && setU(v))
        .catch(() => {})
    load()
    const off = window.island.inbox.onChanged(() => load())
    const t = setInterval(load, 60_000)
    return () => {
      live = false
      off()
      clearInterval(t)
    }
  }, [])
  return u
}

const level = (pct: number, limited?: boolean) => (limited || pct >= 95 ? 'full' : pct >= 80 ? 'high' : 'ok')

function Arc({ r, win, className }: { r: number; win?: UsageWindow; className: string }) {
  if (!win) return null
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, win.pct))
  return (
    <>
      <circle className={`ring-track ${className}`} cx="20" cy="20" r={r} />
      <circle
        className={`ring-fill ${className} ${level(pct, win.limited)}`}
        cx="20"
        cy="20"
        r={r}
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        data-pct={Math.round(pct)}
      />
    </>
  )
}

/** Session (outer) and weekly (inner) plan usage drawn around the Claude icon. */
function UsageRing({ usage }: { usage?: ClaudeUsage }) {
  const now = Date.now()
  const session = currentWindow(usage?.fiveHour, now)
  const week = currentWindow(usage?.sevenDay, now)
  if (!session && !week) return null
  return (
    <svg className="usage-ring" viewBox="0 0 40 40" aria-hidden>
      <g transform="rotate(-90 20 20)">
        <Arc r={18.2} win={session} className="session" />
        <Arc r={14.6} win={week} className="week" />
      </g>
    </svg>
  )
}

function usageTitle(usage?: ClaudeUsage): string {
  const now = Date.now()
  const part = (name: string, w?: UsageWindow) => {
    const c = currentWindow(w, now)
    if (!c) return ''
    return `${name} ${Math.round(c.pct)}%${c.resetsAt ? `, resets ${resetText(c.resetsAt, now)}` : ''}`
  }
  const parts = [part('Session', usage?.fiveHour), part('Week', usage?.sevenDay)].filter(Boolean)
  return parts.length ? `Claude · ${parts.join(' · ')}` : 'Claude'
}

/** Detached glass pill of section icons beside the panel. */
export function Rail({ tab, onTab, usage, hidden = [] }: { tab: HubTab; onTab: (t: HubTab) => void; usage?: ClaudeUsage; hidden?: HubTab[] }) {
  const unread = useUnread()
  const badge = (id: HubTab) => (id === 'chats' ? badgeText(unread?.chats) : id === 'mail' ? badgeText(unread?.mail) : '')
  return (
    <div className="rail" role="tablist" aria-orientation="vertical" onClick={(e) => e.stopPropagation()}>
      {ITEMS.filter((it) => !hidden.includes(it.id)).map((it) => {
        const b = badge(it.id)
        const count = it.id === 'chats' ? unread?.chats : it.id === 'mail' ? unread?.mail : null
        const title = it.id === 'claude' ? usageTitle(usage) : b ? `${it.label} · ${count} unread` : it.label
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={tab === it.id}
            aria-label={it.label}
            title={title}
            className={`rail-btn${tab === it.id ? ' on' : ''}`}
            onClick={() => onTab(it.id)}
          >
            {it.id === 'claude' && <UsageRing usage={usage} />}
            {it.icon}
            {b && (
              <span className={`rail-badge ${it.id}`} aria-label={`${b} unread`}>
                {b}
              </span>
            )}
          </button>
        )
      })}
      <span className="rail-sep" />
      <button className="rail-btn small" title="Settings" aria-label="Settings" onClick={() => window.island.openSettings()}>
        <SettingsAppIcon />
      </button>
    </div>
  )
}
