import type { NotificationData } from '@shared/types'

/** A desktop notification surfaced on the island (transient banner). */
export function NotificationCard({ notification }: { notification: NotificationData }) {
  return (
    <div style={{ padding: '12px 16px', maxWidth: 360, minWidth: 220 }}>
      <div className="sub" style={{ textTransform: 'capitalize' }}>
        {notification.app || 'Notification'}
      </div>
      <div
        className="title"
        style={{
          margin: '3px 0 2px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {notification.summary}
      </div>
      {notification.body && (
        <div
          className="sub"
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 340,
          }}
        >
          {notification.body}
        </div>
      )}
    </div>
  )
}
