import type { MediaState } from '@shared/types'
import { Waveform } from './Waveform'

/**
 * Compact Now-Playing: leading album art + trailing waveform, hugging a small
 * virtual "cutout" gap in the middle (the Dynamic-Island compact look).
 */
export function CompactMedia({ media }: { media: MediaState }) {
  return (
    <div className="compact" title={`${media.title} · ${media.artist}`}>
      {media.artUrl ? (
        <img className="compact-art" src={media.artUrl} alt="" />
      ) : (
        <div className="compact-art placeholder" />
      )}
      <div style={{ width: 56 }} />
      <Waveform playing={media.playing} />
    </div>
  )
}
