import { useEffect, useState, type MouseEvent } from 'react'
import type { MediaState, MediaCmd } from '@shared/types'
import { currentPosition, formatTime } from '@shared/format'

function Progress({ media }: { media: MediaState }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!media.playing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [media.playing])
  if (!media.length) return null
  const pos = currentPosition(media, now)
  return (
    <div className="progress">
      <span className="sub time">{formatTime(pos)}</span>
      <div className="bar">
        <div className="fill" style={{ width: `${(pos / media.length) * 100}%` }} />
      </div>
      <span className="sub time">-{formatTime(media.length - pos)}</span>
    </div>
  )
}

/**
 * Media card with title/artist, progress and transport controls. Controls are
 * always visible when the player supports control.
 */
export function MediaCard({ media }: { media: MediaState }) {
  const cmd = (e: MouseEvent, c: MediaCmd) => {
    e.stopPropagation()
    window.island.sendMediaCmd(c)
  }
  return (
    <div className="card media">
      <div className="row" style={{ gap: 10 }}>
        {media.artUrl ? <img className="art" src={media.artUrl} alt="" /> : <div className="art" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title ellipsis">{media.title}</div>
          <div className="sub ellipsis">{media.artist}</div>
        </div>
      </div>
      <Progress media={media} />
      {media.canControl && (
        <div className="row" style={{ justifyContent: 'center', gap: 18, marginTop: 8 }}>
          <button className="ctrl" onClick={(e) => cmd(e, 'previous')} title="Previous">
            ⏮
          </button>
          <button className="ctrl big" onClick={(e) => cmd(e, 'playpause')} title="Play/Pause">
            {media.playing ? '⏸' : '▶'}
          </button>
          <button className="ctrl" onClick={(e) => cmd(e, 'next')} title="Next">
            ⏭
          </button>
        </div>
      )}
    </div>
  )
}
