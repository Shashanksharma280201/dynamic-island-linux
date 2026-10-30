import type { Activity } from '@shared/types'
import { moodFor } from '@shared/character'
import { Character } from '../character/Character'
import { sessionMood } from './SessionActivity'

/** The small detached element shown for a 2nd simultaneous activity. */
export function DetachedCircle({ activity }: { activity: Activity }) {
  if (activity.kind === 'media' && activity.media.artUrl) {
    return <img className="detached-art" src={activity.media.artUrl} alt="" />
  }
  if (activity.kind === 'claude') return <Character mood={moodFor(activity.run.phase, activity.run.tool?.name)} size={24} />
  if (activity.kind === 'session') return <Character mood={sessionMood(activity.session)} size={24} />
  if (activity.kind === 'connected')
    return (
      <div className={`detached-glyph connected tone-${activity.status.tone}`} title={`${activity.status.app} · ${activity.status.text}`}>
        {activity.status.tone === 'up' ? '▲' : activity.status.tone === 'down' ? '▼' : '●'}
      </div>
    )
  const glyph = activity.kind === 'media' ? '♪' : activity.kind === 'approval' ? '!' : '•'
  return <div className="detached-glyph">{glyph}</div>
}
