import { useState, type MouseEvent } from 'react'
import { agentName, baseName, currentStep, diffStat, durationText, sessionStatus, type AgentSession } from '@shared/sessions'
import { moodFor, type CharacterMood } from '@shared/character'
import { orbForTool } from '@shared/orbs'
import { Character } from '../character/Character'
import { TerminalIcon, XIcon } from '../icons'
import { AGENT_INK, Orb } from '../../orb/Orb'
import { useNow } from '../useSessions'

/** How the character looks for a session. Pure. */
export function sessionMood(s: AgentSession): CharacterMood {
  if (s.phase === 'waiting') return 'attention'
  if (s.phase === 'done') return 'done'
  if (s.phase === 'idle') return 'idle'
  const step = currentStep(s)
  return step ? moodFor('tool', step.tool) : 'thinking'
}

/** The time this turn has taken so far (or took). Pure. */
export function turnTime(s: AgentSession, now: number): string {
  const start = s.turnStartedAt ?? s.startedAt
  return durationText((s.phase === 'working' || s.phase === 'waiting' ? now : (s.finishedAt ?? s.lastAt)) - start)
}

/** "+12 −3", green and red. */
export function DiffStat({ added, removed }: { added: number; removed: number }) {
  if (!added && !removed) return null
  return (
    <span className="diffstat" aria-label={`${added} lines added, ${removed} removed`} title={diffStat(added, removed)}>
      <span className="add">+{added}</span> <span className="del">−{removed}</span>
    </span>
  )
}

/** A session working in a terminal, on the edge capsule: the character, an orb and a count. */
export function CompactSession({ session, others = 0 }: { session: AgentSession; others?: number }) {
  const step = currentStep(session)
  const status = sessionStatus(session, Date.now())
  return (
    <div className="capsule claude-capsule session-capsule" title={`${session.project}: ${status}${others ? ` (+${others} more working)` : ''}`}>
      <Character mood={sessionMood(session)} size={36} label={status} track />
      <Orb state={step ? orbForTool(step.tool) : 'solving'} size={20} color={AGENT_INK} className="capsule-orb" title={status} />
      {others > 0 ? <span className="step-count sessions-count">{others + 1}</span> : session.turnSteps > 0 && <span className="step-count">{session.turnSteps}</span>}
    </div>
  )
}

/**
 * A session's card: what it's doing (hovered while it works), that it needs
 * you, or what it said when it finished, with a way back to its terminal.
 */
export function SessionCard({ id, session: s, others = 0, onOpen }: { id: string; session: AgentSession; others?: number; onOpen: () => void }) {
  const now = useNow(s.phase === 'working' || s.phase === 'waiting')
  const [lost, setLost] = useState(false)
  const act = (e: MouseEvent, fn: () => void) => {
    e.stopPropagation()
    fn()
  }
  const toTerminal = async () => {
    const ok = await window.island.sessions.focus(s.id)
    if (!ok) setLost(true)
    else if (s.phase === 'done' && id !== 'agent-sessions') window.island.dismiss(id)
  }
  const step = currentStep(s)
  const card = id !== 'agent-sessions'
  return (
    <div className={`card claude-card session-card ${s.phase}`} data-session={s.id}>
      <div className="card-head">
        <span className="claude-mark" aria-hidden>
          ✳
        </span>
        <span className="app-name ellipsis">
          {agentName(s.agent)} · {s.project || '~'}
        </span>
        <span className="spacer" />
        <span className="session-time" title="This turn">
          {turnTime(s, now)}
        </span>
        {card && (
          <button className="close-btn" title="Dismiss" onClick={(e) => act(e, () => window.island.dismiss(id))}>
            <XIcon size={10} />
          </button>
        )}
      </div>
      <div className="claude-card-body">
        <Character mood={sessionMood(s)} size={40} track interactive />
        <div className="claude-card-text">
          {s.prompt && <div className="claude-prompt ellipsis">{s.prompt}</div>}
          {s.phase === 'waiting' ? (
            <div className="session-needs">{sessionStatus(s, now)}</div>
          ) : s.phase === 'working' ? (
            <ol className="claude-steps">
              {s.steps.slice(-3).map((t) => (
                <li key={t.id} className={t.done ? 'done' : 'cur'}>
                  {!t.done && <Orb state={orbForTool(t.tool)} size={15} color={AGENT_INK} className="step-orb" />}
                  <span className="ellipsis">{t.label}</span>
                  {t.stat && <DiffStat {...t.stat} />}
                </li>
              ))}
              {!step && (
                <li className="cur">
                  <Orb state="solving" size={15} color={AGENT_INK} className="step-orb" />
                  Thinking…
                </li>
              )}
            </ol>
          ) : (
            <>
              <div className={`claude-status ${s.phase}`}>{sessionStatus(s, now)}</div>
              {s.final && <div className="claude-reply clamp4">{s.final}</div>}
            </>
          )}
          {(s.added > 0 || s.removed > 0) && (
            <div className="session-meta">
              <DiffStat added={s.added} removed={s.removed} />
              <span>
                {s.files.length} file{s.files.length === 1 ? '' : 's'}
                {s.files.length === 1 ? ` · ${baseName(s.files[0].file)}` : ''}
              </span>
            </div>
          )}
          {lost && <div className="caption session-lost">Couldn’t find its terminal window.</div>}
        </div>
      </div>
      <div className="actions">
        {s.pid && (
          <button className="plain terminal-btn" onClick={(e) => act(e, () => void toTerminal())}>
            <TerminalIcon />
            Open terminal
          </button>
        )}
        {(s.files.length > 0 || others > 0) && (
          <button className="plain" onClick={(e) => act(e, onOpen)}>
            {others > 0 ? `${others} more working` : 'View changes'}
          </button>
        )}
        <span className="spacer" />
        {s.phase === 'done' && card && (
          <button className="pill primary" onClick={(e) => act(e, () => window.island.dismiss(id))}>
            OK
          </button>
        )}
      </div>
    </div>
  )
}
