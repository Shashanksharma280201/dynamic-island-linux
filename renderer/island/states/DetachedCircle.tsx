import type { Activity } from '@shared/types'
import { moodFor } from '@shared/character'
import { Character } from '../character/Character'

/** The small detached element shown for a 2nd simultaneous activity. */
export function DetachedCircle({ activity }: { activity: Activity }) {
  if (activity.kind === 'media' && activity.media.artUrl) {
    return <img className="detached-art" src={activity.media.artUrl} alt="" />
  }
  if (activity.kind === 'claude') return <Character mood={moodFor(activity.run.phase, activity.run.tool?.name)} size={24} />
  const glyph = activity.kind === 'media' ? '♪' : activity.kind === 'approval' ? '!' : '•'
  return <div className="detached-glyph">{glyph}</div>
}
