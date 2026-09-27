import type { NotificationData } from '@shared/types'
import { Badge } from './Badge'
import { BellIcon } from '../icons'

/** A desktop notification, styled like an Apple notification banner. */
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
      <div className="card-head">
        <span className="app-glyph" style={{ background: n.icon ? 'transparent' : 'var(--fill)' }}>
          {n.icon ? <img src={n.icon} alt="" /> : <BellIcon />}
        </span>
        <span className="app-name ellipsis">{n.app || 'Notification'}</span>
        <span className="spacer" />
        <Badge count={queued} />
        <span className="when">now</span>
      </div>
      <div className="title ellipsis">{n.summary}</div>
      {n.body && <div className="notif-body clamp2">{n.body}</div>}
      {n.actions && n.actions.length > 0 && (
        <div className="actions">
          {n.actions.map((a) => (
            <button
              key={a.key}
              className="pill"
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
