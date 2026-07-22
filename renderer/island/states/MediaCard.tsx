import type { MediaState, MediaCmd } from '@shared/types'

export function MediaCard({ media, expanded }: { media: MediaState; expanded: boolean }) {
  const cmd = (c: MediaCmd) => (window as any).island.sendMediaCmd(c)
  return (
    <div className="row" style={{ padding: expanded ? '12px 16px' : '6px 12px' }}>
      {media.artUrl ? <img className="art" src={media.artUrl} /> : <div className="art" />}
      <div style={{ minWidth: expanded ? 160 : 90 }}>
        <div className="title">{media.title}</div>
        <div className="sub">{media.artist}</div>
      </div>
      {expanded && media.canControl && (
        <div className="row">
          <button className="btn" onClick={() => cmd('previous')}>
            ⏮
          </button>
          <button className="btn" onClick={() => cmd('playpause')}>
            {media.playing ? '⏸' : '▶'}
          </button>
          <button className="btn" onClick={() => cmd('next')}>
            ⏭
          </button>
        </div>
      )}
    </div>
  )
}
