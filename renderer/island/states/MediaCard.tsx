import type { MouseEvent } from 'react'
import type { MediaState, MediaCmd } from '@shared/types'

/**
 * Media card with title/artist + transport controls. Controls are ALWAYS
 * visible when the player supports control, so play/pause/next/previous are
 * reachable without depending on hover.
 */
export function MediaCard({ media }: { media: MediaState }) {
  const cmd = (e: MouseEvent, c: MediaCmd) => {
    e.stopPropagation()
    ;(window as any).island.sendMediaCmd(c)
  }
  return (
    <div style={{ padding: '10px 14px', minWidth: 240, maxWidth: 340 }}>
      <div className="row" style={{ gap: 10 }}>
        {media.artUrl ? (
          <img className="art" src={media.artUrl} />
        ) : (
          <div className="art" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="title"
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {media.title}
          </div>
          <div
            className="sub"
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {media.artist}
          </div>
        </div>
      </div>
      {media.canControl && (
        <div
          className="row"
          style={{ justifyContent: 'center', gap: 18, marginTop: 10 }}
        >
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
