import type { MouseEvent } from 'react'
import type { ToolRequest, DecisionMsg } from '@shared/types'
import { describeTool } from '@shared/toolDetail'
import { ruleLabel } from '@shared/format'
import { Badge } from './Badge'

export function ApprovalCard({ request, queued }: { request: ToolRequest; queued: number }) {
  const decide = (e: MouseEvent, msg: Omit<DecisionMsg, 'id'>) => {
    e.stopPropagation()
    window.island.sendDecision({ id: request.id, ...msg })
  }
  const detail = describeTool(request.toolName, request.toolInput ?? {})
  const rule = ruleLabel(request.suggestions)

  return (
    <div className="card approval">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="sub">Claude wants to</div>
        <Badge count={queued} />
      </div>
      <div className="title" style={{ margin: '3px 0 8px' }}>
        {detail.label}
      </div>
      <pre className="code">{detail.body || '(no arguments)'}</pre>
      {request.cwd && (
        <div className="sub ellipsis" style={{ marginTop: 6, opacity: 0.6 }}>
          in {request.cwd}
        </div>
      )}
      <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <button
          className="link"
          title="Dismiss here and answer in Claude's terminal prompt"
          onClick={(e) => decide(e, { decision: 'ask' })}
        >
          Answer in terminal
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn deny" onClick={(e) => decide(e, { decision: 'deny' })}>
            Deny
          </button>
          <button className="btn allow" onClick={(e) => decide(e, { decision: 'allow' })}>
            Allow
          </button>
        </div>
      </div>
      {rule && (
        <button
          className="btn always"
          title={`Allow and don't ask again for ${rule} in this project`}
          onClick={(e) => decide(e, { decision: 'allow', always: true })}
        >
          <span className="ellipsis">Always allow {rule}</span>
        </button>
      )}
    </div>
  )
}
