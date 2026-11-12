import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion'
import { Orb } from '../../orb/Orb'
import { ORB_FOR_MOOD, orbFps, orbSpeed } from '@shared/orbs'
import { CHARACTER_COLOR, CHARACTER_DOTS, DEFAULT_CHARACTER, MOOD_COLOR, ringKind, type CharacterConfig, type CharacterId, type CharacterMood } from '@shared/character'
import { sound } from '../../sound'

/** The chosen character (and its name) for everything on the island. */
export const CharacterContext = createContext<CharacterConfig>({ id: DEFAULT_CHARACTER, name: 'Orbit' })
export const useCharacter = () => useContext(CharacterContext)

/** Three boops this close together and it gets dizzy. */
export const BOOP_WINDOW_MS = 1400
export const DIZZY_MS = 2400

// ------------------------------------------------------------------ orbs ----

export { CHARACTER_COLOR, CHARACTER_DOTS }

const loop = (duration: number, ease: any = 'easeInOut'): Transition => ({ duration, repeat: Infinity, ease })

/**
 * How the whole orb moves in a mood, beyond its own dots: only where it says
 * something (needs you, went wrong, done). Resting and working, the dots do
 * the moving, so nothing else repaints.
 */
function bodyMotion(mood: CharacterMood): { animate: TargetAndTransition; transition: Transition } | null {
  switch (mood) {
    case 'done':
      return { animate: { y: [0, -6, 0, -2, 0], scale: [1, 0.96, 1.03, 0.99, 1] }, transition: { duration: 0.9 } }
    case 'attention':
      return { animate: { scale: [1, 1.08, 1] }, transition: { duration: 0.7, repeat: Infinity, repeatDelay: 1.3 } }
    case 'error':
      return { animate: { x: [0, -3, 3, -2, 2, 0] }, transition: { duration: 0.5, repeat: Infinity, repeatDelay: 2.4 } }
    default:
      return null
  }
}

// ------------------------------------------------------------------ ring ----

/** The aura ring: the mood's colour, spinning while busy, breathing when it needs you. */
function Ring({ mood, still, color = MOOD_COLOR[mood] }: { mood: CharacterMood; still: boolean; color?: string | null }) {
  const kind = ringKind(mood)
  if (!kind || !color) return null
  const c = 2 * Math.PI * 47
  return (
    <svg className="aura-ring" data-ring={kind} viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <circle cx={50} cy={50} r={47} fill="none" stroke="rgba(128,128,128,.16)" strokeWidth={2.6} />
      <motion.circle
        cx={50}
        cy={50}
        r={47}
        fill="none"
        stroke={color}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeDasharray={kind === 'busy' ? `${c * 0.18} ${c}` : `${c} ${c}`}
        style={{ originX: '50px', originY: '50px' }}
        initial={{ opacity: 0 }}
        animate={still ? { opacity: 1, rotate: -90 } : kind === 'busy' ? { opacity: 1, rotate: [-90, 270] } : kind === 'alert' ? { opacity: [1, 0.55, 1], rotate: -90 } : { opacity: 1, rotate: -90 }}
        transition={kind === 'busy' ? { rotate: { duration: 1.4, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.24 } } : kind === 'alert' ? { opacity: loop(1.2), rotate: { duration: 0 } } : { duration: 0.24 }}
      />
    </svg>
  )
}

// ------------------------------------------------------------- reactions ----

type Reaction = 'boop' | 'dizzy' | 'love'

/** Boop the orb, boop it again fast and it gets dizzy; rest the pointer on it and it glows. */
function useReactions(enabled: boolean) {
  const [react, setReact] = useState<Reaction | null>(null)
  const boops = useRef<number[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const lastLove = useRef(0)
  const play = (r: Reaction, ms: number) => {
    clearTimeout(timer.current)
    setReact(r)
    timer.current = setTimeout(() => setReact(null), ms)
  }
  useEffect(() => () => (clearTimeout(timer.current), clearTimeout(hoverTimer.current)), [])
  if (!enabled) return { react: null, handlers: {} }
  return {
    react,
    handlers: {
      onPointerDown: () => {
        if (react === 'dizzy') return
        const now = Date.now()
        boops.current = [...boops.current.filter((t) => now - t < BOOP_WINDOW_MS), now]
        if (boops.current.length >= 3) {
          boops.current = []
          play('dizzy', DIZZY_MS)
          sound('dizzy')
        } else {
          play('boop', 600)
          sound('boop')
        }
      },
      onPointerEnter: () => {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(() => {
          if (Date.now() - lastLove.current < 8000) return
          lastLove.current = Date.now()
          play('love', 1600)
        }, 1600)
      },
      onPointerLeave: () => clearTimeout(hoverTimer.current),
    },
  }
}

/** The orb's motion for a reaction, on top of the mood. */
function reactionMotion(r: Reaction): { animate: TargetAndTransition; transition: Transition } {
  if (r === 'boop') return { animate: { scaleX: [1, 1.14, 0.96, 1], scaleY: [1, 0.86, 1.06, 1] }, transition: { duration: 0.6, times: [0, 0.12, 0.35, 1] } }
  if (r === 'dizzy') return { animate: { rotate: [0, 360, 720] }, transition: { duration: DIZZY_MS / 1000, ease: 'easeInOut' } }
  return { animate: { scale: [1, 1.1, 1] }, transition: { duration: 0.8, repeat: 1 } }
}

/**
 * The island's character: a dotted thinking orb in its own colour, moving
 * the way the agent is working (resting, listening, thinking, searching,
 * writing…), with a ring in the mood's colour. Uses the chosen character
 * unless `id` is given (Settings previews). `interactive`: boop it, rest on it.
 */
export function Character({
  mood,
  size = 64,
  id,
  label,
  interactive = false,
  ring = size >= 30,
  color: colorOverride,
  paint: paintOverride,
  still = false,
}: {
  mood: CharacterMood
  size?: number
  id?: CharacterId
  label?: string
  interactive?: boolean
  ring?: boolean
  /** A colour for the ring instead of the mood's own (e.g. green for a file drop). */
  color?: string
  /** Its colour, instead of the chosen one (null: its own). */
  paint?: string | null
  /** Hold the orb still (it has been resting a while): no frames drawn until this changes. */
  still?: boolean
}) {
  const chosen = useCharacter()
  const which = id && CHARACTER_COLOR[id] ? id : CHARACTER_COLOR[chosen.id] ? chosen.id : DEFAULT_CHARACTER
  const reduce = useReducedMotion() ?? false
  const { react, handlers } = useReactions(interactive && !reduce)
  const paint = paintOverride !== undefined ? paintOverride : (chosen.color ?? null)
  const ink = paint ?? CHARACTER_COLOR[which]
  const ringColor = colorOverride ?? MOOD_COLOR[mood]
  const motionFor = react ? reactionMotion(react) : bodyMotion(mood)
  const fps = orbFps(mood)
  const { dots, dotSize } = CHARACTER_DOTS[which]
  // With a ring, the orb sits inside it; on its own it fills the space.
  const orbSize = Math.round(ring && ringKind(mood) && ringColor ? size * 0.86 : size)
  return (
    <span
      className={`character character-${which}${interactive ? ' interactive' : ''}`}
      data-mood={mood}
      data-character={which}
      data-color={ink}
      data-reaction={react ?? undefined}
      role="img"
      aria-label={label ?? `${chosen.name}: ${mood}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', width: size, height: size, opacity: mood === 'sleeping' ? 0.6 : 1 }}
      {...handlers}
    >
      {ring && <Ring mood={mood} still={reduce} color={ringColor} />}
      <motion.span
        key={reduce ? 'still' : (react ?? mood)}
        className="character-orb"
        style={{ display: 'block', flex: 'none' }}
        animate={reduce || !motionFor ? undefined : motionFor.animate}
        transition={motionFor?.transition}
      >
        <Orb state={ORB_FOR_MOOD[mood]} size={orbSize} color={ink} dots={dots} dotSize={dotSize} fps={fps || 1} paused={fps === 0 || still} speed={orbSpeed(mood) || 1} bright />
      </motion.span>
    </span>
  )
}
