import { useEffect, useState, type MouseEvent } from 'react'
import type { ConnectedCapsule, ConnectedCard, Tone } from '@shared/connected'
import { secondsLeft } from '@shared/connected'
import type { DecisionMsg } from '@shared/types'
import type { ApprovalKey } from '@shared/approvalKeys'
import { Badge } from './Badge'
import { Character } from '../character/Character'
import { ConnectedAppIcon } from '../hub/AppIcons'
import { useShortcutLabel } from '../useShortcuts'

const Key = ({ k }: { k: ApprovalKey }) => <kbd className="key">{useShortcutLabel(k)}</kbd>

/** A tone as a CSS class. */
export const toneClass = (t?: Tone) => (t ? `tone-${t}` : '')

/** Seconds left until `deadline`, ticking every second. */
function useCountdown(deadline: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])
  return secondsLeft(deadline, now)
}

/**
 * A connected package asking for your answer (a trade to approve…). Nothing
 * happens unless you press a button or its shortcut; when the time runs out,
 * the service treats it as a no.
 */
export function ConnectedAskCard({ id, card, queued }: { id: string; card: ConnectedCard; queued: number }) {
  const left = useCountdown(card.deadline)
  const decide = (e: MouseEvent, decision: DecisionMsg['decision']) => {
    e.stopPropagation()
    window.island.sendDecision({ id, decision })
  }
  return (
    <div className="card approval connected-ask" data-tool="connected_ask" data-tone={card.tone} style={{ ['--pkg' as string]: card.color }}>
      <div className="card-head">
        <span className="pkg-icon" aria-hidden>
          <ConnectedAppIcon />
        </span>
        <span className="app-name">{card.app}</span>
        <span className="spacer" />
        <span className={`ask-timer${left <= 10 ? ' low' : ''}`} title="Seconds left to answer; no answer means no">
          {left}s
        </span>
        <Badge count={queued} />
      </div>
      <div className="headline ask-title">{card.title}</div>
      {card.subtitle && <div className="caption ellipsis">{card.subtitle}</div>}
      {card.lines.length > 0 && (
        <div className="ask-lines">
          {card.lines.map((l, i) => (
            <div key={i} className="ask-line">
              <span className="ask-label">{l.label}</span>
              <span className={`ask-value ${toneClass(l.tone)}`}>{l.value}</span>
            </div>
          ))}
        </div>
      )}
      {card.note && <div className="caption ask-note">{card.note}</div>}
      <div className="actions">
        <span className="spacer" />
        <button className="pill deny" disabled={left === 0} onClick={(e) => decide(e, 'deny')}>
          {card.rejectLabel}
          <Key k="deny" />
        </button>
        <button className={`pill primary allow ${card.tone === 'down' ? 'sell' : ''}`} disabled={left === 0} onClick={(e) => decide(e, 'allow')}>
          {card.approveLabel}
          <Key k="allow" />
        </button>
      </div>
    </div>
  )
}

/** The capsule: the package's short status (today's P&L) with an arrow and the character. */
export function CompactConnected({ status }: { status: ConnectedCapsule }) {
  const arrow = status.tone === 'up' ? '▲' : status.tone === 'down' ? '▼' : status.tone === 'warn' ? '■' : '●'
  return (
    <div className={`capsule connected-capsule ${toneClass(status.tone)}`} title={`${status.app} · ${status.text} · ${status.detail}`}>
      <span className="cc-arrow" aria-hidden>
        {arrow}
      </span>
      <span className="cc-short">{status.short}</span>
      <Character mood={status.tone === 'down' || status.tone === 'warn' ? 'attention' : 'idle'} size={26} track />
    </div>
  )
}

/** The status, opened (hover or click): the full number and what's behind it. */
export function ConnectedStatusCard({ status, onOpen }: { status: ConnectedCapsule; onOpen: () => void }) {
  return (
    <div className="card connected-status" data-tone={status.tone} style={{ ['--pkg' as string]: status.color }}>
      <div className="card-head">
        <span className="pkg-icon" aria-hidden>
          <ConnectedAppIcon />
        </span>
        <span className="app-name">{status.app}</span>
        <span className="spacer" />
        <button
          className="chip"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          Open
        </button>
      </div>
      <div className={`cs-big ${toneClass(status.tone)}`}>{status.text}</div>
      <div className="caption">{status.detail}</div>
    </div>
  )
}
