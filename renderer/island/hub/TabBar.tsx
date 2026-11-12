import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useAnimationControls } from 'framer-motion'
import { pop } from '../../anim/spring'
import type { InboxUnread } from '@shared/types'
import { currentWindow, type ClaudeUsage, type UsageWindow } from '@shared/claude'
import { resetText } from '@shared/format'
import type { HubTab } from './Hub'

/** How long the pointer rests on an icon before its name shows (a tooltip's usual wait). */
export const LABEL_WAIT_MS = 450

/** One weight and size for every section's icon: drawn lines in the label colour, like SF Symbols. */
const Glyph = ({ children, stroke = 1.8 }: { children: ReactNode; stroke?: number }) => (
  <svg className="tab-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

/** Each section's icon. */
export const TAB_ICONS: Record<HubTab | 'settings', ReactNode> = {
  controls: (
    <Glyph>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </Glyph>
  ),
  today: (
    <Glyph>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.8h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  agents: (
    <Glyph>
      <path d="M10.5 3.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L4 10l4.8-1.7z" />
      <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </Glyph>
  ),
  alerts: (
    <Glyph>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5.5 2.3 7 2.3 7H3.7S6 15 6 9.5" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Glyph>
  ),
  claude: (
    <Glyph stroke={2.1}>
      <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" />
    </Glyph>
  ),
  sessions: (
    <Glyph>
      <rect x="3" y="4.5" width="18" height="15" rx="3.2" />
      <path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" />
    </Glyph>
  ),
  connected: (
    <Glyph>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Glyph>
  ),
  services: (
    <Glyph>
      <path d="M12 3.5 3.5 8l8.5 4.5L20.5 8z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </Glyph>
  ),
  music: (
    <Glyph>
      <path d="M9 17.5V5.5l11-2v12" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="15.5" r="2.5" />
    </Glyph>
  ),
  chats: (
    <Glyph>
      <path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.5z" />
    </Glyph>
  ),
  mail: (
    <Glyph>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </Glyph>
  ),
  notes: (
    <Glyph>
      <rect x="4.5" y="3.5" width="15" height="17" rx="3" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </Glyph>
  ),
  docs: (
    <Glyph>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Glyph>
  ),
  crm: (
    <Glyph>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <circle cx="9.5" cy="10.5" r="2.3" />
      <path d="M5.8 16.3c.7-1.7 2.1-2.6 3.7-2.6s3 .9 3.7 2.6M15 9.5h3M15 13h3" />
    </Glyph>
  ),
  settings: (
    <Glyph>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Glyph>
  ),
}

const ITEMS: { id: HubTab; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'today', label: 'Today' },
  { id: 'agents', label: 'Agents' },
  { id: 'alerts', label: 'Notifications' },
  { id: 'claude', label: 'Claude' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'connected', label: 'Connected' },
  { id: 'services', label: 'Services' },
  { id: 'music', label: 'Music' },
  { id: 'chats', label: 'Chats' },
  { id: 'mail', label: 'Mail' },
  { id: 'notes', label: 'Notes' },
  { id: 'docs', label: 'Documents' },
  { id: 'crm', label: 'CRM' },
]

/** Badge text: nothing for 0, "99+" past 99. Pure. */
export function badgeText(n: number | null | undefined): string {
  if (!n || n < 0) return ''
  return n > 99 ? '99+' : String(n)
}

/** Unread counts for the badges, kept fresh while the bar is showing. */
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

/** An icon that hops when its count goes up. */
function Hop({ count, children }: { count: number; children: ReactNode }) {
  const controls = useAnimationControls()
  const last = useRef(count)
  useEffect(() => {
    if (count > last.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void controls.start({ y: [0, -5, 0, -2, 0], transition: { duration: 0.7, ease: 'easeOut' } })
    }
    last.current = count
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.span className="tab-icon" animate={controls}>
      {children}
    </motion.span>
  )
}

/**
 * The island's sections, in a row across the top of the open island: one
 * line icon each, the open one lit in the accent (a pill slides to it), its
 * name below under the pointer, a count for what's new and a dot for what's
 * running.
 */
export function TabBar({
  tab,
  onTab,
  usage,
  hidden = [],
  alerts = 0,
  sessions = 0,
  connected,
  running = [],
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
  /** Sections with something going on (music playing, Claude working…): a dot under the icon. */
  running?: HubTab[]
}) {
  const unread = useUnread()
  const barRef = useRef<HTMLDivElement | null>(null)
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const on = barRef.current?.querySelector<HTMLElement>('.rail-btn[aria-selected="true"]')
    setPill(on ? { x: on.offsetLeft, w: on.offsetWidth } : null)
  }, [tab, hidden.join()])
  // The name under the icon the pointer rests on. Drawn outside the bar (the
  // island clips) just below the icon, like a tooltip: it waits for the
  // pointer to rest a moment (then follows it along the bar at once), and a
  // click puts it away (it would sit over the section's own title) until the
  // pointer moves to another icon.
  const [label, setLabel] = useState<{ text: string; x: number; y: number } | null>(null)
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const wait = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warm = useRef(false)
  const pressed = useRef<HTMLElement | null>(null)
  const stopWaiting = () => {
    if (wait.current) clearTimeout(wait.current)
    wait.current = null
  }
  useEffect(() => stopWaiting, [])
  const placeLabel = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect()
    setLabel({ text, x: r.left + r.width / 2, y: r.bottom + 6 })
    warm.current = true
  }
  const showLabel = (el: HTMLElement, text: string) => {
    stopWaiting()
    if (pressed.current === el) return
    if (warm.current) return placeLabel(el, text)
    setLabel(null)
    wait.current = setTimeout(() => placeLabel(el, text), LABEL_WAIT_MS)
  }
  const hideLabel = () => {
    stopWaiting()
    setLabel(null)
  }
  const pointerHandlers = (text: string) => ({
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => showLabel(e.currentTarget, text),
    onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => {
      if (pressed.current === e.currentTarget) pressed.current = null
    },
    onMouseDown: (e: ReactMouseEvent<HTMLElement>) => {
      pressed.current = e.currentTarget
      hideLabel()
    },
    // From the keyboard the name shows at once; a click's focus doesn't show it.
    onFocus: (e: ReactFocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) placeLabel(e.currentTarget, text)
    },
    onBlur: hideLabel,
  })
  // Kept inside the window: the first and last icons' names don't run off its edge.
  useLayoutEffect(() => {
    const el = labelRef.current
    if (!el || !label) return
    const half = el.offsetWidth / 2
    el.style.left = `${Math.min(Math.max(label.x, half + 6), window.innerWidth - half - 6)}px`
  }, [label])
  const badge = (id: HubTab) =>
    id === 'chats' ? badgeText(unread?.chats) : id === 'mail' ? badgeText(unread?.mail) : id === 'alerts' && tab !== 'alerts' ? badgeText(alerts) : id === 'sessions' ? badgeText(sessions) : id === 'connected' ? badgeText(connected?.waiting) : ''
  return (
    <div
      ref={barRef}
      className="rail tab-bar"
      role="tablist"
      aria-orientation="horizontal"
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={() => {
        hideLabel()
        warm.current = false
        pressed.current = null
      }}
    >
      {pill && <motion.span className="tab-pill" initial={false} animate={{ x: pill.x, width: pill.w }} transition={pop} aria-hidden />}
      {ITEMS.filter((it) => !hidden.includes(it.id)).map((it, i) => {
        const b = badge(it.id)
        const count = it.id === 'chats' ? unread?.chats : it.id === 'mail' ? unread?.mail : it.id === 'alerts' ? alerts : it.id === 'sessions' ? sessions : null
        const name = it.id === 'connected' && connected?.name ? connected.name : it.label
        const title = it.id === 'connected' ? (b ? `${name} · ${connected?.waiting} waiting for you` : name) : it.id === 'claude' ? usageTitle(usage) : b ? `${it.label} · ${count} ${it.id === 'alerts' ? 'new' : it.id === 'sessions' ? 'need you' : 'unread'}` : it.label
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={tab === it.id}
            aria-label={name}
            className={`rail-btn${tab === it.id ? ' on' : ''}${running.includes(it.id) ? ' running' : ''}`}
            style={{ '--i': i } as CSSProperties}
            onClick={() => onTab(it.id)}
            {...pointerHandlers(title)}
          >
            {it.id === 'claude' && <UsageRing usage={usage} />}
            <Hop count={count ?? 0}>{TAB_ICONS[it.id]}</Hop>
            {b && (
              <motion.span key={b} className={`rail-badge ${it.id}`} aria-label={`${b} unread`} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={pop}>
                {b}
              </motion.span>
            )}
          </button>
        )
      })}
      <span className="tab-sep" />
      <button
        className="rail-btn small"
        style={{ '--i': ITEMS.length } as CSSProperties}
        aria-label="Settings"
        onClick={() => window.island.openSettings()}
        {...pointerHandlers('Settings')}
      >
        <span className="tab-icon">{TAB_ICONS.settings}</span>
      </button>
      {label &&
        createPortal(
          <span ref={labelRef} className="tab-label" style={{ top: label.y, left: label.x }} aria-hidden>
            {label.text}
          </span>,
          document.body,
        )}
    </div>
  )
}
