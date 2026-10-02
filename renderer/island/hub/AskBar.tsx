import { useRef, useState, type ReactNode } from 'react'
import type { ClaudeRun, ClaudeView } from '@shared/claude'
import { moodFor } from '@shared/character'
import { errorText } from './common'
import { useKeyboard } from './useKeyboard'
import { Character, useCharacter } from '../character/Character'
import { runActive, runStatus } from '../states/ClaudeActivity'
import { StopIcon, XIcon } from '../icons'

/** A ready-made request: its chip label, and what is sent. */
export type AskIdea = { name: string; instruction: string }

/**
 * Asking the agent from inside a tab: a box to type in, ready-made requests,
 * and the answer to what was asked from here, live while it works. The same
 * conversation as the Claude tab.
 */
export function AskBar({
  claude,
  onTyping,
  label,
  placeholder,
  setupHint,
  ideas = [],
  chips,
  compose = (t) => t,
  hideBefore = 0,
  onAsk,
  afterRun,
  onSave,
  className = '',
}: {
  claude: ClaudeView | null
  onTyping: (on: boolean) => void
  /** What it's about, for screen readers ("about documents"). */
  label: string
  /** The box's hint, given who answers ("Sparky", or "Claude"). */
  placeholder: (who: string) => string
  /** Without an AI set up: what asking would do here. */
  setupHint: (name: string) => string
  ideas?: AskIdea[]
  /** More chips before the ideas (like saved recipes). */
  chips?: (send: (text: string) => void, fill: (text: string) => void) => ReactNode
  /** The prompt actually sent for what was typed (with context added). */
  compose?: (text: string, claudeCode: boolean) => string
  /** Something else happened here since: an older answer stays hidden. */
  hideBefore?: number
  onAsk?: () => void
  /** More under a finished answer (like the files it made). */
  afterRun?: (run: ClaudeRun) => ReactNode
  /** Keep what's typed for later (shows a ☆). */
  onSave?: (text: string) => Promise<unknown>
  className?: string
}) {
  const { name } = useCharacter()
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [askedAt, setAskedAt] = useState(0)
  const [closedRun, setClosedRun] = useState<string | null>(null)
  const kb = useKeyboard(onTyping)
  const ref = useRef<HTMLTextAreaElement>(null)
  if (!claude) return null
  const code = claude.assistant.provider === 'claude-code'
  const who = code ? 'Claude' : name
  const run = claude.run
  const working = runActive(run)
  // The answer to what was asked from here (not from another tab).
  const ours = run && askedAt && askedAt > hideBefore && run.startedAt >= askedAt - 2000 && run.id !== closedRun ? run : null

  if (!code && claude.assistant.problem)
    return (
      <div className={`ask-bar setup ${className}`}>
        <span className="caption">{setupHint(name)}</span>
        <button className="pill small" onClick={(e) => (e.stopPropagation(), window.island.openSettings('ai'))}>
          Set Up
        </button>
      </div>
    )

  const send = async (typed: string) => {
    const t = typed.trim()
    if (!t || working) return
    setErr(null)
    try {
      setAskedAt(Date.now())
      onAsk?.()
      await window.island.claude.ask(compose(t, code))
      setText('')
    } catch (e) {
      setErr(errorText(e))
    }
  }
  const extra = chips?.((t) => void send(t), setText)

  return (
    <div className={`ask-bar ${className}`} onClick={(e) => e.stopPropagation()}>
      {ours && (
        <div className={`ask-run${working ? ' live' : ''}${ours.phase === 'error' ? ' failed' : ''}`}>
          <Character mood={moodFor(ours.phase, ours.tool?.name)} size={26} label={runStatus(ours)} />
          <div className="ask-run-text">
            <div className="claude-status">{working ? runStatus(ours) : ours.phase === 'error' ? 'Couldn’t finish' : runStatus(ours)}</div>
            {(ours.reply || ours.error) && <div className="ask-run-reply">{ours.phase === 'error' ? ours.error : ours.reply}</div>}
            {!working && afterRun?.(ours)}
          </div>
          {working ? (
            <button className="round-btn stop" title={`Stop ${who}`} aria-label={`Stop ${who}`} onClick={() => void window.island.claude.stop()}>
              <StopIcon />
            </button>
          ) : (
            <button className="close-btn" aria-label="Dismiss" onClick={() => setClosedRun(ours.id)}>
              <XIcon />
            </button>
          )}
        </div>
      )}
      {!working && !text.trim() && (ideas.length > 0 || !!extra) && (
        <div className="chips ask-ideas">
          {extra}
          {ideas.map((s) => (
            <button key={s.name} className="chip idea" title={s.instruction} onClick={() => void send(s.instruction)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {err && (
        <div className="status error" onClick={() => setErr(null)}>
          {err}
        </div>
      )}
      <div className="reply-field claude-field">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={working ? `${who} is working…` : placeholder(who)}
          aria-label={`Ask ${who} ${label}`}
          onPointerDown={() => {
            kb.take()
            setTimeout(() => ref.current?.focus(), 50)
          }}
          onFocus={kb.take}
          onBlur={kb.release}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(text)
            } else if (e.key === 'Escape') {
              ref.current?.blur()
            }
          }}
        />
        {onSave && text.trim() && !working && (
          <button
            className="plain save-recipe"
            title="Save as a recipe (one tap next time)"
            aria-label="Save as a recipe"
            onClick={() => void onSave(text.trim()).catch((e) => setErr(errorText(e)))}
          >
            ☆
          </button>
        )}
        <button className="send" title="Send" aria-label="Send" disabled={!text.trim() || working} onClick={() => void send(text)}>
          ↑
        </button>
      </div>
    </div>
  )
}
