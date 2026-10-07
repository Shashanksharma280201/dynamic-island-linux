import type { MediaState } from '@shared/types'
import { Waveform } from './Waveform'
import { Character } from '../character/Character'

/** Compact Now-Playing on the edge capsule: album art, a waveform and the character. */
export function CompactMedia({ media }: { media: MediaState }) {
  return (
    <div className="capsule" title={`${media.title} · ${media.artist}`}>
      {media.artUrl ? (
        <img className="compact-art" src={media.artUrl} alt="" />
      ) : (
        <div className="compact-art placeholder" />
      )}
      <Waveform playing={media.playing} size={22} />
      {/* Bobs along while something plays. */}
      <Character mood={media.playing ? 'dancing' : 'idle'} size={28} track />
    </div>
  )
}
