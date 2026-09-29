import type { MediaState } from '@shared/types'
import { Waveform } from './Waveform'

/** Compact Now-Playing on the edge capsule: album art above a waveform. */
export function CompactMedia({ media }: { media: MediaState }) {
  return (
    <div className="capsule" title={`${media.title} · ${media.artist}`}>
      {media.artUrl ? (
        <img className="compact-art" src={media.artUrl} alt="" />
      ) : (
        <div className="compact-art placeholder" />
      )}
      <Waveform playing={media.playing} size={22} />
    </div>
  )
}
