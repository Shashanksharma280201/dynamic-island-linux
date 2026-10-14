import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { agentName, baseName, currentStep, sessionStatus, type AgentSession, type FileDiff } from '@shared/sessions'
import { orbForTool } from '@shared/orbs'
import type { ClaudeView } from '@shared/claude'
import { pop } from '../../anim/spring'
import { AGENT_INK, Orb } from '../../orb/Orb'
import { Character } from '../character/Character'
import { TerminalIcon } from '../icons'
import { DiffStat, sessionMood, turnTime } from '../states/SessionActivity'
import { useNow } from '../useSessions'
import { BackButton, Empty } from './common'

/**
 * Claude Code sessions running in your terminals: each one live (what it's
 * doing, how long, what it changed), and per session its steps, its answer
 * and the diff of every file it touched.
 */
export function SessionsView({ sessions, claude }: { sessions: AgentSession[]; claude: ClaudeView | null }) {
  const [open, setOpen] = useState<string | null>(null)
  const busy = sessions.some((s) => s.phase === 'working' || s.phase === 'waiting')
  const now = useNow(busy)
  const shown = open ? sessions.find((s) => s.id === open) : undefined
  const hooked = claude?.approvals ?? true

  if (shown) return <SessionDetail s={shown} now={now} onBack={() => setOpen(null)} />
  return (
    <div className="view sessions-view">
      <div className="section-head">
        <span className="large-title">Sessions</span>
        <span className="spacer" />
        {sessions.length > 0 && <span className="caption">{summary(sessions)}</span>}
      </div>
      {sessions.length === 0 ? (
        hooked ? (
          <Empty
            icon={<Character mood="idle" size={56} track interactive />}
            title="No sessions right now"
            body="Start Claude Code in any terminal and follow it here: each step, the files it changes, and a nudge when it needs you."
          />
        ) : (
          <Empty
            icon={<Character mood="listening" size={56} track interactive />}
            title="Follow Claude Code from anywhere"
            body="Turn on the Claude Code hook and every session in your terminals shows up here live. You can answer its questions and approvals from the island too."
            action={
              <button className="pill primary" onClick={(e) => (e.stopPropagation(), void window.island.claude.setApprovals(true))}>
                Turn on
              </button>
            }
          />
        )
      ) : (
        <ul className="session-list">
          <AnimatePresence initial={false}>
            {sessions.map((s) => (
              <motion.li key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} transition={pop}>
                <button className={`session-row ${s.phase}`} data-session={s.id} onClick={() => setOpen(s.id)}>
                  <span className="session-icon">
                    {s.phase === 'working' ? (
                      <Orb state={currentStep(s) ? orbForTool(currentStep(s)!.tool) : 'solving'} size={26} color={AGENT_INK} />
                    ) : (
                      <Character mood={sessionMood(s)} size={28} />
                    )}
                  </span>
                  <span className="session-text">
                    <span className="session-title">
                      <span className="ellipsis">{s.project || '~'}</span>
                      {s.agent !== 'claude-code' && <span className="agent-tag">{agentName(s.agent)}</span>}
                    </span>
                    <span className={`session-status ellipsis ${s.phase}`}>{sessionStatus(s, now)}</span>
                  </span>
                  <span className="session-side">
                    <span className="session-time">{turnTime(s, now)}</span>
                    <DiffStat added={s.added} removed={s.removed} />
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

/** "2 working · 1 needs you". Pure. */
export function summary(list: AgentSession[]): string {
  const working = list.filter((s) => s.phase === 'working').length
  const waiting = list.filter((s) => s.phase === 'waiting').length
  const parts = [working ? `${working} working` : '', waiting ? `${waiting} need${waiting === 1 ? 's' : ''} you` : ''].filter(Boolean)
  return parts.join(' · ') || `${list.length} open`
}

function SessionDetail({ s, now, onBack }: { s: AgentSession; now: number; onBack: () => void }) {
  const [lost, setLost] = useState(false)
  return (
    <div className="view sessions-view session-detail">
      <div className="section-head">
        <BackButton onClick={onBack} label="Sessions" />
        <span className="spacer" />
        {s.pid && (
          <button className="chip terminal-btn" onClick={async () => setLost(!(await window.island.sessions.focus(s.id)))}>
            <TerminalIcon />
            Open terminal
          </button>
        )}
      </div>
      <div className="session-hero">
        <Character mood={sessionMood(s)} size={44} track interactive />
        <div className="session-text">
          <div className="session-title large">
            <span className="ellipsis">{s.project || '~'}</span>
            <span className="agent-tag">{agentName(s.agent)}</span>
          </div>
          <div className="caption ellipsis" title={s.cwd}>
            {s.cwd}
          </div>
        </div>
      </div>
      {lost && <div className="caption session-lost">Couldn’t find its terminal window.</div>}
      {s.prompt && <div className="session-prompt">{s.prompt}</div>}
      <div className={`session-status ${s.phase}`}>
        {s.phase === 'working' && <Orb state={currentStep(s) ? orbForTool(currentStep(s)!.tool) : 'solving'} size={15} color={AGENT_INK} className="status-orb" />}
        {sessionStatus(s, now)} · {turnTime(s, now)}
      </div>
      {s.final && <div className="claude-reply session-final">{s.final}</div>}
      {s.steps.length > 0 && (
        <>
          <div className="group-label">Steps{s.turnSteps > s.steps.length ? ` (last ${s.steps.length} of ${s.turnSteps})` : ''}</div>
          <ol className="claude-steps session-steps">
            {s.steps.map((t) => (
              <li key={t.id} className={t.done ? 'done' : 'cur'}>
                {!t.done && <Orb state={orbForTool(t.tool)} size={15} color={AGENT_INK} className="step-orb" />}
                <span className="ellipsis">{t.label}</span>
                {t.stat && <DiffStat {...t.stat} />}
              </li>
            ))}
          </ol>
        </>
      )}
      {s.files.length > 0 && (
        <>
          <div className="group-label">
            Changes <DiffStat added={s.added} removed={s.removed} />
          </div>
          <div className="diff-files">
            {s.files.map((f, i) => (
              <FileChange key={f.file} f={f} open={i === 0 && s.files.length <= 3} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** One file's changes, folded to its name until you open it. */
function FileChange({ f, open: initial }: { f: FileDiff; open: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <div className={`diff-file${open ? ' open' : ''}`}>
      <button className="diff-name" onClick={() => setOpen(!open)} title={f.file} aria-expanded={open}>
        <span className="chev" aria-hidden>
          ›
        </span>
        <span className="ellipsis">{baseName(f.file)}</span>
        <span className="spacer" />
        <DiffStat added={f.added} removed={f.removed} />
      </button>
      {open && (
        <div className="diff-body" onWheel={(e) => e.stopPropagation()}>
          {f.truncated && !f.hunks.length ? (
            <div className="caption">Too big to show here.</div>
          ) : (
            f.hunks.map((h, i) => (
              <div className="hunk" key={i}>
                <div className="hunk-head">@@ line {h.newStart}</div>
                {h.lines.map((l, j) => (
                  <div key={j} className={`dl ${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'ctx'}`}>
                    <span className="dm">{l[0] === ' ' ? '' : l[0] === '-' ? '−' : '+'}</span>
                    {l.slice(1) || ' '}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
