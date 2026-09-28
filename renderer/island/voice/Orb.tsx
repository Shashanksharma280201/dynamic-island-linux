import { ThinkingOrb } from 'thinking-orbs'
import type { OrbMood } from '@shared/claude'

// Claude's coral for the working states; listening glows warm amber.
const TINT: Partial<Record<OrbMood, string>> = {
  listening: '#ffb35c',
  breathing: '#e9e9ee',
}

/**
 * Animated orb from thinking-orbs (https://libraries.dev/orbs, MIT) showing
 * what Claude is doing: listening, thinking, searching, editing, writing…
 */
export function Orb({ mood, size = 64, label }: { mood: OrbMood; size?: 20 | 32 | 64; label?: string }) {
  return (
    <ThinkingOrb
      state={mood}
      size={size}
      theme="dark"
      color={TINT[mood] ?? '#f0a483'}
      aria-label={label}
      className={`orb orb-${mood}`}
      data-mood={mood}
    />
  )
}
