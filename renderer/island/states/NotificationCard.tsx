import type { NotificationData } from '@shared/types'
import { Badge } from './Badge'

/** A desktop notification surfaced on the island (transient; click to dismiss). */
export function NotificationCard({
  id,
  notification: n,
  queued,
}: {
  id: string
  notification: NotificationData
  queued: number
}) {
  return (
    <div className={`card notification${n.urgency === 'critical' ? ' critical' : ''}`}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        {n.icon && <img className="notif-icon" src={n.icon} alt="" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="sub app ellipsis">{n.app || 'Notification'}</div>
            <Badge count={queued} />
          </div>
          <div className="title ellipsis" style={{ margin: '3px 0 2px' }}>
            {n.summary}
          </div>
          {n.body && <div className="sub clamp2">{n.body}</div>}
        </div>
      </div>
      {n.actions && n.actions.length > 0 && (
        <div className="row actions">
          {n.actions.map((a) => (
            <button
              key={a.key}
              className="btn small"
              onClick={(e) => {
                e.stopPropagation()
                window.island.notifAction(id, a.key)
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
