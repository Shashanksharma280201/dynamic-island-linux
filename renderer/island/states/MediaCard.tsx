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
      <div
        className={`bar${media.canSeek ? ' seekable' : ''}`}
        onClick={seek}
        title={media.canSeek ? 'Click to seek' : undefined}
      >
        <div className="fill" style={{ width: `${(pos / length) * 100}%` }} />
      </div>
      <div className="times">
        <span className="time">{formatTime(pos)}</span>
        <span className="time">-{formatTime(length - pos)}</span>
      </div>
    </div>
  )
}

/** Now Playing: artwork, title/artist, scrubber and transport controls. */
export function MediaCard({ media }: { media: MediaState }) {
  const cmd = (e: MouseEvent, c: MediaCmd) => {
    e.stopPropagation()
    window.island.sendMediaCmd(c)
  }
  return (
    <div className="card media">
      <div className="row" style={{ gap: 12 }}>
        {media.artUrl ? <img className="art" src={media.artUrl} alt="" /> : <div className="art" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="headline ellipsis">{media.title}</div>
          <div className="secondary ellipsis" style={{ fontSize: 13, marginTop: 1 }}>
            {media.artist}
          </div>
        </div>
      </div>
      <Progress media={media} />
      {media.canControl && (
        <div className="transport">
          {media.shuffle !== undefined ? (
            <button
              className={`icon-btn small${media.shuffle ? ' on' : ''}`}
              onClick={(e) => cmd(e, 'shuffle')}
              title={media.shuffle ? 'Shuffle on' : 'Shuffle off'}
            >
              <ShuffleIcon />
            </button>
          ) : (
            <span style={{ width: 30 }} />
          )}
          <button className="icon-btn" onClick={(e) => cmd(e, 'previous')} title="Previous">
            <PrevIcon />
          </button>
          <button
            className="icon-btn big"
            onClick={(e) => cmd(e, 'playpause')}
            title={media.playing ? 'Pause' : 'Play'}
          >
            {media.playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </button>
          <button className="icon-btn" onClick={(e) => cmd(e, 'next')} title="Next">
            <NextIcon />
          </button>
          {media.loop !== undefined ? (
            <button
              className={`icon-btn small${media.loop !== 'None' ? ' on' : ''}`}
              onClick={(e) => cmd(e, 'loop')}
              title={
                media.loop === 'Track' ? 'Repeat one' : media.loop === 'Playlist' ? 'Repeat all' : 'Repeat off'
              }
            >
              <RepeatIcon one={media.loop === 'Track'} />
            </button>
          ) : (
            <span style={{ width: 30 }} />
          )}
        </div>
      )}
    </div>
  )
}
