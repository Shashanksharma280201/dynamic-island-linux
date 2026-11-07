import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useAnimationControls } from 'framer-motion'
import { pop } from '../../anim/spring'
import type { InboxUnread } from '@shared/types'
import { currentWindow, type ClaudeUsage, type UsageWindow } from '@shared/claude'
import { resetText } from '@shared/format'
import type { HubTab } from './Hub'
import {
  ClaudeAppIcon,
  ControlsAppIcon,
  NotificationsAppIcon,
  SessionsAppIcon,
  ServicesAppIcon,
  ConnectedAppIcon,
  CrmAppIcon,
  DocsAppIcon,
  MailAppIcon,
  NotesAppIcon,
  SettingsAppIcon,
  SpotifyAppIcon,
  WhatsAppIcon,
} from './AppIcons'

const ITEMS: { id: HubTab; label: string; icon: ReactNode }[] = [
  { id: 'controls', label: 'Controls', icon: <ControlsAppIcon /> },
  { id: 'alerts', label: 'Notifications', icon: <NotificationsAppIcon /> },
  { id: 'claude', label: 'Claude', icon: <ClaudeAppIcon /> },
  { id: 'sessions', label: 'Sessions', icon: <SessionsAppIcon /> },
  { id: 'connected', label: 'Connected', icon: <ConnectedAppIcon /> },
  { id: 'services', label: 'Services', icon: <ServicesAppIcon /> },
  { id: 'music', label: 'Music', icon: <SpotifyAppIcon /> },
  { id: 'chats', label: 'Chats', icon: <WhatsAppIcon /> },
  { id: 'mail', label: 'Mail', icon: <MailAppIcon /> },
  { id: 'notes', label: 'Notes', icon: <NotesAppIcon /> },
  { id: 'docs', label: 'Documents', icon: <DocsAppIcon /> },
  { id: 'crm', label: 'CRM', icon: <CrmAppIcon /> },
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

/** How much an icon grows with the pointer `d` px from its centre (the Dock's magnification). Pure. */
export function magnify(d: number, max = 0.42, reach = 46): number {
  return 1 + max * Math.exp(-((d / reach) ** 2))
}

/** An icon that bounces (like the Dock's) when its count goes up. */
function Bouncy({ count, side, children }: { count: number; side: 'left' | 'right' | 'top'; children: ReactNode }) {
  const controls = useAnimationControls()
  const last = useRef(count)
  useEffect(() => {
    if (count > last.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Away from the screen edge, twice, settling.
      const out = side === 'left' ? 9 : -9
      void controls.start({ x: [0, out, 0, out * 0.5, 0], transition: { duration: 0.9, ease: 'easeOut' } })
    }
    last.current = count
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.span className="rail-icon" animate={controls}>
      {children}
    </motion.span>
  )
}

/** A macOS-style Dock of section icons beside the panel: they grow under the pointer, show their name, bounce for news, and a dot marks what's running. */
export function Rail({
  tab,
  onTab,
  usage,
  hidden = [],
  alerts = 0,
  sessions = 0,
  connected,
  running = [],
  side = 'right',
}: {
  tab: HubTab
  onTab: (t: HubTab) => void
  usage?: ClaudeUsage
  hidden?: HubTab[]
  /** Notifications not yet seen in the Notifications tab. */
  alerts?: number
  /** Sessions in your terminals that need you. */
  sessions?: number
  /** The connected package's name (its tab's label) and approvals waiting. */
  connected?: { name: string; waiting: number }
  /** Sections with something going on (music playing, Claude working…): a dot, as in the Dock. */
  running?: HubTab[]
  /** The screen edge the island is on: names show toward the panel. */
  side?: 'left' | 'right' | 'top'
}) {
  const unread = useUnread()
  // One selection pill that slides from tab to tab. (Not a shared-layout
  // layoutId: that kept the rail from ever leaving once the panel closed.)
  const railRef = useRef<HTMLDivElement | null>(null)
  const [pillY, setPillY] = useState<number | null>(null)
  useLayoutEffect(() => {
    const on = railRef.current?.querySelector<HTMLElement>('.rail-btn[aria-selected="true"]')
    setPillY(on ? on.offsetTop : null)
  }, [tab, hidden.join()])
  // Magnification: each icon's size follows the pointer, set straight on the
  // element (no re-render per mouse move).
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const onMove = (y: number) => {
    if (still || !railRef.current) return
    for (const b of railRef.current.querySelectorAll<HTMLElement>('.rail-btn')) {
      const r = b.getBoundingClientRect()
      b.style.setProperty('--mag', magnify(y - (r.top + r.height / 2)).toFixed(3))
    }
  }
  const onLeave = () => {
    railRef.current?.querySelectorAll<HTMLElement>('.rail-btn').forEach((b) => b.style.setProperty('--mag', '1'))
    setLabel(null)
  }
  // The name beside the icon under the pointer, like the Dock's. Drawn
  // outside the rail (which clips, for its glass) at the icon's height.
  const [label, setLabel] = useState<{ text: string; y: number; x: number } | null>(null)
  const showLabel = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect()
    setLabel({ text, y: r.top + r.height / 2, x: side === 'left' ? r.right + 14 : r.left - 14 })
  }
  const badge = (id: HubTab) =>
    id === 'chats' ? badgeText(unread?.chats) : id === 'mail' ? badgeText(unread?.mail) : id === 'alerts' && tab !== 'alerts' ? badgeText(alerts) : id === 'sessions' ? badgeText(sessions) : id === 'connected' ? badgeText(connected?.waiting) : ''
  return (
    <div
      ref={railRef}
      className="rail"
      data-side={side}
      role="tablist"
      aria-orientation="vertical"
      onClick={(e) => e.stopPropagation()}
      onMouseMove={(e) => onMove(e.clientY)}
      onMouseLeave={onLeave}
    >
      {pillY !== null && <motion.span className="rail-pill" initial={false} animate={{ y: pillY }} transition={pop} aria-hidden />}
      {ITEMS.filter((it) => !hidden.includes(it.id)).map((it) => {
        const b = badge(it.id)
        const count = it.id === 'chats' ? unread?.chats : it.id === 'mail' ? unread?.mail : it.id === 'alerts' ? alerts : it.id === 'sessions' ? sessions : null
        const label = it.id === 'connected' && connected?.name ? connected.name : it.label
        const title = it.id === 'connected' ? (b ? `${label} · ${connected?.waiting} waiting for you` : label) : it.id === 'claude' ? usageTitle(usage) : b ? `${it.label} · ${count} ${it.id === 'alerts' ? 'new' : it.id === 'sessions' ? 'need you' : 'unread'}` : it.label
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={tab === it.id}
            aria-label={label}
            className={`rail-btn${tab === it.id ? ' on' : ''}${running.includes(it.id) ? ' running' : ''}`}
            onClick={() => onTab(it.id)}
            onMouseEnter={(e) => showLabel(e.currentTarget, title)}
            onFocus={(e) => showLabel(e.currentTarget, title)}
            onBlur={() => setLabel(null)}
          >
            {it.id === 'claude' && <UsageRing usage={usage} />}
            <Bouncy count={count ?? 0} side={side}>
              {it.icon}
            </Bouncy>
            {b && (
              <motion.span key={b} className={`rail-badge ${it.id}`} aria-label={`${b} unread`} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={pop}>
                {b}
              </motion.span>
            )}
          </button>
        )
      })}
      <span className="rail-sep" />
      <button
        className="rail-btn small"
        aria-label="Settings"
        onClick={() => window.island.openSettings()}
        onMouseEnter={(e) => showLabel(e.currentTarget, 'Settings')}
        onFocus={(e) => showLabel(e.currentTarget, 'Settings')}
        onBlur={() => setLabel(null)}
      >
        <span className="rail-icon">
          <SettingsAppIcon />
        </span>
      </button>
      {label &&
        createPortal(
          <span className={`rail-label${side === 'left' ? ' to-right' : ''}`} style={{ top: label.y, left: label.x }} aria-hidden>
            {label.text}
          </span>,
          document.body,
        )}
    </div>
  )
}
