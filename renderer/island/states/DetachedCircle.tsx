import type { Activity } from '@shared/types'

/** The small detached element shown for a 2nd simultaneous activity. */
export function DetachedCircle({ activity }: { activity: Activity }) {
  const glyph = activity.kind === 'media' ? '♪' : '!'
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        background: '#000',
        color: '#48e06f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
      }}
    >
      {glyph}
    </div>
  )
}
