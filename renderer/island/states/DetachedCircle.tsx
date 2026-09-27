import type { Activity } from '@shared/types'

/** The small detached element shown for a 2nd simultaneous activity. */
export function DetachedCircle({ activity }: { activity: Activity }) {
  if (activity.kind === 'media' && activity.media.artUrl) {
    return <img className="detached-art" src={activity.media.artUrl} alt="" />
  }
  const glyph = activity.kind === 'media' ? '♪' : activity.kind === 'approval' ? '!' : '•'
  return <div className="detached-glyph">{glyph}</div>
}
