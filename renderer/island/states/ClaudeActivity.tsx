import type { MouseEvent } from 'react'
import type { ClaudeRun } from '@shared/claude'
import { orbFor } from '@shared/claude'
import { Orb } from '../voice/Orb'
import { XIcon } from '../icons'

export const runActive = (r?: ClaudeRun) => !!r && ['starting', 'thinking', 'tool', 'writing'].includes(r.phase)

/** One line on what Claude is doing right now. Pure. */
export function runStatus(r: ClaudeRun): string {
  switch (r.phase) {
    case 'starting':
      return 'Starting Claude Code…'
    case 'thinking':
      return r.steps ? 'Thinking about the results…' : 'Thinking…'
    case 'tool':
      return r.tool?.detail ?? 'Working…'
    case 'writing':
      return 'Writing…'
    case 'done':
      return r.steps ? `Done · ${r.steps} step${r.steps === 1 ? '' : 's'}` : 'Done'
    case 'stopped':
      return 'Stopped'
    default:
      return 'Something went wrong'
  }
}

/** Claude working, on the edge capsule: just the orb. */
export function CompactClaude({ run }: { run: ClaudeRun }) {
  return (
    <div className="capsule claude-capsule" title={`Claude: ${runStatus(run)}`}>
      <Orb mood={orbFor(run.phase, run.tool?.name)} size={20} label={runStatus(run)} />
    </div>
  )
}

/** Hovered while working, or the answer once it's done. */
export function ClaudeCard({ id, run, onOpen }: { id: string; run: ClaudeRun; onOpen: () => void }) {
  const active = runActive(run)
  const act = (e: MouseEvent, fn: () => void) => {
    e.stopPropagation()
    fn()
  }
  return (
    <div className={`card claude-card ${run.phase}`}>
      <div className="card-head">
        <span className="claude-mark" aria-hidden>
          ✳
        </span>
        <span className="app-name ellipsis">Claude Code · {run.cwd.split('/').filter(Boolean).pop() ?? '~'}</span>
        <span className="spacer" />
        {!active && (
          <button className="close-btn" title="Dismiss" onClick={(e) => act(e, () => window.island.dismiss(id))}>
            <XIcon />
          </button>
        )}
      </div>
      <div className="claude-card-body">
        <Orb mood={active ? orbFor(run.phase, run.tool?.name) : 'breathing'} size={32} />
        <div className="claude-card-text">
          <div className="claude-prompt ellipsis">{run.prompt}</div>
          <div className={`claude-status ${run.phase}`}>{runStatus(run)}</div>
          {run.phase === 'error' ? (
            <div className="claude-reply error clamp4">{run.error}</div>
          ) : (
            run.reply && <div className="claude-reply clamp4">{run.reply}</div>
          )}
        </div>
      </div>
      <div className="actions">
        <button className="plain" onClick={(e) => act(e, onOpen)}>
          Open Claude
        </button>
        <span className="spacer" />
        {active && (
          <button className="pill danger" onClick={(e) => act(e, () => void window.island.claude.stop())}>
            Stop
          </button>
        )}
      </div>
    </div>
  )
}
