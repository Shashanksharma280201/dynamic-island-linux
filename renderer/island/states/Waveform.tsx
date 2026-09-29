import { motion } from 'framer-motion'

/** Animated equalizer bars (the iOS Now-Playing trailing glyph). */
export function Waveform({ playing, color = '#48e06f', size = 16 }: { playing: boolean; color?: string; size?: number }) {
  const bars = [0, 1, 2, 3]
  const k = size / 16
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 * k, height: size }}>
      {bars.map((i) => (
        <motion.span
          key={i}
          style={{ width: 3 * k, borderRadius: 2 * k, background: color, display: 'block' }}
          animate={
            playing
              ? { height: [5, 15, 7, 13, 5].map((h) => h * k) }
              : { height: 4 * k }
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
