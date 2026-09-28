import type { Activity } from '@shared/types'
import { orbFor } from '@shared/claude'
import { Orb } from '../voice/Orb'

/** The small detached element shown for a 2nd simultaneous activity. */
export function DetachedCircle({ activity }: { activity: Activity }) {
  if (activity.kind === 'media' && activity.media.artUrl) {
    return <img className="detached-art" src={activity.media.artUrl} alt="" />
  }
  if (activity.kind === 'claude') return <Orb mood={orbFor(activity.run.phase, activity.run.tool?.name)} size={20} />
  const glyph = activity.kind === 'media' ? '♪' : activity.kind === 'approval' ? '!' : '•'
  return <div className="detached-glyph">{glyph}</div>
}
