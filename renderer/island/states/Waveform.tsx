import { motion } from 'framer-motion'

/** Animated equalizer bars (the iOS Now-Playing trailing glyph). */
export function Waveform({ playing, color = '#48e06f' }: { playing: boolean; color?: string }) {
  const bars = [0, 1, 2, 3]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
      {bars.map((i) => (
        <motion.span
          key={i}
          style={{ width: 3, borderRadius: 2, background: color, display: 'block' }}
          animate={
            playing
              ? { height: [5, 15, 7, 13, 5] }
              : { height: 4 }
          }
          transition={
            playing
              ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }
              : { duration: 0.2 }
          }
        />
      ))}
    </div>
  )
}
