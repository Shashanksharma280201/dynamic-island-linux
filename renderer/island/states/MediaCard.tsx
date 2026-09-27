import { useEffect, useState, type MouseEvent } from 'react'
import type { MediaState, MediaCmd } from '@shared/types'
import { currentPosition, formatTime } from '@shared/format'
import { PlayIcon, PauseIcon, PrevIcon, NextIcon, ShuffleIcon, RepeatIcon } from '../icons'

function Progress({ media }: { media: MediaState }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!media.playing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [media.playing])
  if (!media.length) return null
  const length = media.length
  const pos = currentPosition(media, now)
  const seek = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (!media.canSeek) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    window.island.sendMediaCmd({ type: 'seek', position: frac * length })
  }
  return (
    <div className="progress">
      <span className="sub time">{formatTime(pos)}</span>
      <div
        className={`bar${media.canSeek ? ' seekable' : ''}`}
        onClick={seek}
        title={media.canSeek ? 'Click to seek' : undefined}
      >
        <div className="fill" style={{ width: `${(pos / length) * 100}%` }} />
      </div>
      <span className="sub time">-{formatTime(length - pos)}</span>
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
        <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 8 }}>
          {media.shuffle !== undefined && (
            <button
              className={`ctrl small${media.shuffle ? ' on' : ''}`}
              onClick={(e) => cmd(e, 'shuffle')}
              title={media.shuffle ? 'Shuffle on' : 'Shuffle off'}
            >
              <ShuffleIcon />
            </button>
          )}
          <button className="ctrl" onClick={(e) => cmd(e, 'previous')} title="Previous">
            <PrevIcon />
          </button>
          <button className="ctrl big" onClick={(e) => cmd(e, 'playpause')} title={media.playing ? 'Pause' : 'Play'}>
            {media.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="ctrl" onClick={(e) => cmd(e, 'next')} title="Next">
            <NextIcon />
          </button>
          {media.loop !== undefined && (
            <button
              className={`ctrl small${media.loop !== 'None' ? ' on' : ''}`}
              onClick={(e) => cmd(e, 'loop')}
              title={
                media.loop === 'Track' ? 'Repeat one' : media.loop === 'Playlist' ? 'Repeat all' : 'Repeat off'
              }
            >
              <RepeatIcon one={media.loop === 'Track'} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
