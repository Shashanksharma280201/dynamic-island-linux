import type { MouseEvent } from 'react'
import type { ToolRequest, DecisionMsg } from '@shared/types'
import { describeTool } from '@shared/toolDetail'
import { ruleLabel } from '@shared/format'
import { Badge } from './Badge'
import { TerminalIcon } from '../icons'

/** Claude Code permission prompt, styled like an Apple permission dialog. */
export function ApprovalCard({ request, queued }: { request: ToolRequest; queued: number }) {
  const decide = (e: MouseEvent, msg: Omit<DecisionMsg, 'id'>) => {
    e.stopPropagation()
    window.island.sendDecision({ id: request.id, ...msg })
  }
  const detail = describeTool(request.toolName, request.toolInput ?? {})
  const rule = ruleLabel(request.suggestions)

  return (
    <div className="card approval">
      <div className="card-head">
        <span className="app-glyph" style={{ background: '#d97757' }}>
          <TerminalIcon />
        </span>
        <span className="app-name">Claude Code</span>
        <span className="spacer" />
        <Badge count={queued} />
      </div>
      <div className="headline" style={{ marginBottom: 8 }}>
        {detail.label}
      </div>
      <pre className="code">{detail.body || '(no arguments)'}</pre>
      {request.cwd && (
        <div className="caption ellipsis" style={{ marginTop: 6 }}>
          in {request.cwd}
        </div>
      )}
      <div className="actions">
        <button
          className="plain muted"
          title="Dismiss here and answer in Claude's terminal prompt"
          onClick={(e) => decide(e, { decision: 'ask' })}
        >
          Answer in terminal
        </button>
        <span className="spacer" />
        <button className="pill deny" onClick={(e) => decide(e, { decision: 'deny' })}>
          Don't Allow
        </button>
        <button className="pill primary allow" onClick={(e) => decide(e, { decision: 'allow' })}>
          Allow
        </button>
      </div>
      {rule && (
        <button
          className="pill always"
          title={`Allow and don't ask again for ${rule} in this project`}
          onClick={(e) => decide(e, { decision: 'allow', always: true })}
        >
          <span className="ellipsis" style={{ display: 'block' }}>
            Always Allow {rule}
          </span>
        </button>
      )}
    </div>
  )
}
