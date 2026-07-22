import type { MediaState } from '@shared/types'
import { Waveform } from './Waveform'

/**
 * Compact Now-Playing: leading album art + trailing waveform, hugging a small
 * virtual "cutout" gap in the middle (the Dynamic-Island compact look).
 */
export function CompactMedia({ media }: { media: MediaState }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        height: 26,
      }}
    >
      {media.artUrl ? (
        <img
          src={media.artUrl}
          style={{ width: 20, height: 20, borderRadius: 5, objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: 20, height: 20, borderRadius: 5, background: '#48e06f' }} />
      )}
      <div style={{ width: 14 }} />
      <Waveform playing={media.playing} />
    </div>
  )
}
