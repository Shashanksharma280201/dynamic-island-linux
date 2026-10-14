import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Orb, type OrbState } from './Orb'

/**
 * An orb behind something (the character, while you talk to it): the orb
 * fades and scales in, and cross-fades when its state changes.
 */
export function OrbHalo({
  state,
  size,
  color,
  level,
  children,
}: {
  /** null: no halo. */
  state: OrbState | null
  size: number
  color?: string
  level?: () => number
  children: ReactNode
}) {
  return (
    <div className="orb-halo" style={{ width: size, height: size }}>
      <AnimatePresence initial={false}>
        {state && (
          <motion.div
            key={state}
            className="orb-halo-orb"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.15 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          >
            <Orb state={state} size={size} color={color} level={level} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="orb-halo-body">{children}</div>
    </div>
  )
}
