import type { ToolRequest } from '@shared/types'

export function ApprovalCard({ request }: { request: ToolRequest }) {
  const decide = (decision: 'allow' | 'deny') =>
    (window as any).island.sendDecision({ id: request.id, decision })
  return (
    <div style={{ padding: '14px 16px', maxWidth: 360 }}>
      <div className="sub">Claude wants to run</div>
      <div className="title" style={{ margin: '4px 0 2px' }}>
        {request.toolName}
      </div>
      <div
        className="sub"
        style={{
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {request.inputSummary}
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn deny" onClick={() => decide('deny')}>
          Deny
        </button>
        <button className="btn allow" onClick={() => decide('allow')}>
          Allow
        </button>
      </div>
    </div>
  )
}
