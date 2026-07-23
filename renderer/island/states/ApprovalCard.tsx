import type { ToolRequest } from '@shared/types'
import { describeTool } from '@shared/toolDetail'

export function ApprovalCard({ request }: { request: ToolRequest }) {
  const decide = (decision: 'allow' | 'deny') =>
    (window as any).island.sendDecision({ id: request.id, decision })
  const detail = describeTool(request.toolName, request.toolInput ?? {})

  return (
    <div style={{ padding: '14px 16px', width: 400, maxWidth: 460 }}>
      <div className="sub">Claude wants to</div>
      <div className="title" style={{ margin: '3px 0 8px' }}>
        {detail.label}
      </div>
      <pre
        style={{
          margin: 0,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '10px 12px',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.45,
          color: '#eaeaea',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 180,
          overflow: 'auto',
        }}
      >
        {detail.body || '(no arguments)'}
      </pre>
      {request.cwd && (
        <div className="sub" style={{ marginTop: 6, opacity: 0.6 }}>
          in {request.cwd}
        </div>
      )}
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
