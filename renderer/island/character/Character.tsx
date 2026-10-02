import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion'
import { ThinkingOrb } from 'thinking-orbs'
import type { OrbMood } from '@shared/claude'
import { DEFAULT_CHARACTER, type CharacterConfig, type CharacterId, type CharacterMood } from '@shared/character'

/** The chosen character (and its name) for everything on the island. */
export const CharacterContext = createContext<CharacterConfig>({ id: DEFAULT_CHARACTER, name: 'Orbit' })
export const useCharacter = () => useContext(CharacterContext)

// ---------------------------------------------------------------- motion ----

const loop = (duration: number, ease: any = 'easeInOut'): Transition => ({ duration, repeat: Infinity, ease })

/** How the whole body moves in each mood. */
function bodyMotion(mood: CharacterMood): { animate: TargetAndTransition; transition: Transition } {
  switch (mood) {
    case 'listening':
      return { animate: { scale: [1, 1.05, 1], rotate: -4, y: 0 }, transition: { ...loop(1.2), rotate: { duration: 0.3 } } }
    case 'thinking':
      return { animate: { rotate: [-3, 3, -3], y: 0 }, transition: loop(3) }
    case 'searching':
    case 'writing':
    case 'working':
      return { animate: { y: [0, -2.5, 0], rotate: 0 }, transition: loop(0.7) }
    case 'done':
      return { animate: { y: [0, -9, 0, -4, 0], scaleY: [1, 0.92, 1.04, 0.97, 1] }, transition: { duration: 0.9, repeat: Infinity, repeatDelay: 1.4 } }
    case 'attention':
      return { animate: { rotate: [0, -9, 9, -6, 6, 0] }, transition: { duration: 0.7, repeat: Infinity, repeatDelay: 0.9 } }
    case 'error':
      return { animate: { x: [0, -3, 3, -2, 2, 0], rotate: 0 }, transition: { duration: 0.5, repeat: Infinity, repeatDelay: 2 } }
    case 'sleeping':
      return { animate: { scaleY: [1, 0.95, 1], y: [0, 1.5, 0] }, transition: loop(3.2) }
    case 'dancing':
      return { animate: { rotate: [-8, 8, -8], y: [0, -4, 0, -4, 0] }, transition: loop(0.9) }
    default:
      return { animate: { y: [0, -2, 0], rotate: 0, scale: 1 }, transition: loop(3.4) }
  }
}

/** Blinks every few seconds while awake. */
function useBlink(active: boolean): boolean {
  const [shut, setShut] = useState(false)
  useEffect(() => {
    if (!active) return
    let t: ReturnType<typeof setTimeout>
    const next = () => {
      t = setTimeout(() => {
        setShut(true)
        t = setTimeout(() => (setShut(false), next()), 130)
      }, 2600 + Math.random() * 2600)
    }
    next()
    return () => clearTimeout(t)
  }, [active])
  return shut
}

/** Idle glances around now and then. */
function useGlance(active: boolean): number {
  const [x, setX] = useState(0)
  useEffect(() => {
    if (!active) return setX(0)
    const t = setInterval(() => setX([0, 0, -2.5, 2.5][Math.floor(Math.random() * 4)]), 2200)
    return () => clearInterval(t)
  }, [active])
  return x
}

// ------------------------------------------------------------------ eyes ----

type EyeLook = { color: string; rx: number; ry: number; glow?: boolean; shine?: boolean }

/** A pair of eyes that changes with the mood. */
function Eyes({ lx, rx: rxPos, y, look, mood, still }: { lx: number; rx: number; y: number; look: EyeLook; mood: CharacterMood; still: boolean }) {
  const awake = mood !== 'sleeping' && mood !== 'done' && mood !== 'dancing' && mood !== 'error'
  const blink = useBlink(awake && !still)
  const glance = useGlance(mood === 'idle' && !still)
  const stroke = { stroke: look.color, strokeWidth: look.rx * 0.75, strokeLinecap: 'round' as const, fill: 'none' }
  const one = (cx: number, side: -1 | 1) => {
    if (mood === 'done' || mood === 'dancing')
      return <path key={side} d={`M${cx - look.rx} ${y + 1} Q${cx} ${y - look.ry * 1.1} ${cx + look.rx} ${y + 1}`} {...stroke} />
    if (mood === 'sleeping') return <path key={side} d={`M${cx - look.rx} ${y} Q${cx} ${y + look.ry * 0.6} ${cx + look.rx} ${y}`} {...stroke} />
    if (mood === 'error')
      // "> <": squeezed shut
      return <path key={side} d={`M${cx + side * look.rx * 0.8} ${y - look.ry * 0.6} L${cx - side * look.rx * 0.8} ${y} L${cx + side * look.rx * 0.8} ${y + look.ry * 0.6}`} {...stroke} />
    const wide = mood === 'listening' || mood === 'attention'
    const focus = mood === 'searching' || mood === 'writing' || mood === 'working'
    const ry = look.ry * (wide ? 1.22 : focus ? 0.72 : 1)
    const dy = mood === 'thinking' ? -look.ry * 0.45 : 0
    const dx = mood === 'thinking' ? look.rx * 0.35 : glance
    return (
      <motion.g key={side} animate={{ x: dx, y: dy, scaleY: blink ? 0.1 : 1 }} transition={{ duration: blink ? 0.06 : 0.25 }} style={{ originX: `${cx}px`, originY: `${y}px` }}>
        <ellipse cx={cx} cy={y} rx={look.rx * (wide ? 1.1 : 1)} ry={ry} fill={look.color} filter={look.glow ? 'url(#glow)' : undefined} />
        {look.shine && <circle cx={cx + look.rx * 0.35} cy={y - ry * 0.4} r={look.rx * 0.38} fill="#fff" />}
      </motion.g>
    )
  }
  return (
    <g>
      {one(lx, -1)}
      {one(rxPos, 1)}
    </g>
  )
}

// -------------------------------------------------------------- overlays ----

/** Little extras by the character's head: thought dots, tools, sparkles… */
function Overlay({ mood }: { mood: CharacterMood }) {
  const at = (children: ReactNode) => <g transform="translate(78 16)">{children}</g>
  switch (mood) {
    case 'thinking':
      return at(
        [0, 1, 2].map((i) => (
          <motion.circle key={i} cx={-8 + i * 7} cy={-2 - i * 3} r={2 + i * 0.6} fill="#c7c7cc" animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3 }} />
        )),
      )
    case 'searching':
      return at(
        <motion.g animate={{ x: [-4, 4, -4] }} transition={loop(1.4)}>
          <circle cx={0} cy={0} r={6} fill="rgba(90,200,250,.25)" stroke="#e5e5ea" strokeWidth={2.4} />
          <line x1={4.5} y1={4.5} x2={10} y2={10} stroke="#e5e5ea" strokeWidth={3} strokeLinecap="round" />
        </motion.g>,
      )
    case 'writing':
      return at(
        <motion.g animate={{ x: [-3, 3, -3], y: [0, 1, 0] }} transition={loop(0.5)}>
          <rect x={-2.5} y={-9} width={5} height={15} rx={1.2} fill="#ffcc00" transform="rotate(35)" />
          <path d="M3.6 5.6 L6.6 9.4 L1.6 8.4Z" fill="#3a3a3c" />
        </motion.g>,
      )
    case 'working':
      return at(
        <motion.g animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}>
          {[0, 45, 90, 135].map((a) => (
            <rect key={a} x={-1.6} y={-8} width={3.2} height={16} rx={1} fill="#aeaeb2" transform={`rotate(${a})`} />
          ))}
          <circle r={5.2} fill="#aeaeb2" />
          <circle r={2.2} fill="#3a3a3c" />
        </motion.g>,
      )
    case 'done':
      return (
        <g>
          {[
            [16, 18, 0],
            [84, 12, 0.3],
            [90, 34, 0.6],
          ].map(([x, y, d]) => (
            <motion.path key={x} d={`M${x} ${y - 5} L${x + 1.4} ${y - 1.4} L${x + 5} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 5} L${x - 1.4} ${y + 1.4} L${x - 5} ${y} L${x - 1.4} ${y - 1.4}Z`} fill="#ffd60a" animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: d }} style={{ originX: `${x}px`, originY: `${y}px` }} />
          ))}
        </g>
      )
    case 'attention':
      return at(
        <motion.g animate={{ scale: [1, 1.25, 1] }} transition={loop(0.7)}>
          <circle r={8} fill="#ff9f0a" />
          <rect x={-1.4} y={-5} width={2.8} height={6.5} rx={1.2} fill="#fff" />
          <circle cy={4} r={1.5} fill="#fff" />
        </motion.g>,
      )
    case 'sleeping':
      return at(
        [0, 1].map((i) => (
          <motion.text key={i} x={-4 + i * 7} y={4 - i * 8} fontSize={8 + i * 3} fontWeight={800} fill="#aeaeb2" animate={{ opacity: [0, 1, 0], y: [4 - i * 8, -4 - i * 8] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2 }}>
            z
          </motion.text>
        )),
      )
    case 'dancing':
      return at(
        <motion.text x={-4} y={4} fontSize={14} fill="#30d158" animate={{ y: [6, -6], opacity: [0, 1, 0], rotate: [-10, 10] }} transition={loop(1.2)}>
          ♪
        </motion.text>,
      )
    default:
      return null
  }
}

// ------------------------------------------------------------ characters ----

const ANTENNA: Partial<Record<CharacterMood, string>> = {
  listening: '#5ac8fa',
  thinking: '#ffd60a',
  searching: '#ff9f0a',
  writing: '#ff9f0a',
  working: '#ff9f0a',
  attention: '#ff453a',
  error: '#ff453a',
  sleeping: '#636366',
}

function Bolt({ mood, still }: { mood: CharacterMood; still: boolean }) {
  const light = ANTENNA[mood] ?? '#30d158'
  return (
    <g>
      <line x1={50} y1={13} x2={50} y2={24} stroke="#9aa4b2" strokeWidth={3} strokeLinecap="round" />
      <motion.circle cx={50} cy={11} r={5} fill={light} animate={still ? undefined : { opacity: mood === 'sleeping' ? 0.5 : [1, 0.55, 1] }} transition={loop(mood === 'listening' ? 0.8 : 2)} />
      <rect x={13} y={45} width={8} height={18} rx={4} fill="#c9d0d9" />
      <rect x={79} y={45} width={8} height={18} rx={4} fill="#c9d0d9" />
      <rect x={18} y={24} width={64} height={58} rx={24} fill="#eef1f5" />
      <rect x={18} y={24} width={64} height={58} rx={24} fill="url(#boltShade)" />
      <rect x={26} y={35} width={48} height={33} rx={15} fill="#161b26" />
      <Eyes lx={40} rx={60} y={51.5} look={{ color: '#64d2ff', rx: 5.6, ry: 7.5, glow: true }} mood={mood} still={still} />
    </g>
  )
}

function Mochi({ mood, still }: { mood: CharacterMood; still: boolean }) {
  const sad = mood === 'error'
  const happy = mood === 'done' || mood === 'dancing'
  return (
    <motion.g animate={mood === 'sleeping' ? { scaleY: 0.9, scaleX: 1.06 } : happy ? { scaleY: [1, 0.9, 1], scaleX: [1, 1.08, 1] } : { scaleY: 1, scaleX: 1 }} transition={happy ? loop(0.6) : { duration: 0.4 }} style={{ originX: '50px', originY: '86px' }}>
      <path d="M12 82 C 10 40, 32 18, 50 18 C 68 18, 90 40, 88 82 Q 50 92 12 82Z" fill="#fff6f0" />
      <path d="M12 82 C 10 40, 32 18, 50 18 C 68 18, 90 40, 88 82 Q 50 92 12 82Z" fill="url(#mochiShade)" />
      <Eyes lx={38} rx={62} y={52} look={{ color: '#2b2b2e', rx: 4.6, ry: 6, shine: true }} mood={mood} still={still} />
      <ellipse cx={28} cy={64} rx={6.5} ry={3.6} fill="#ffb3c1" opacity={0.85} />
      <ellipse cx={72} cy={64} rx={6.5} ry={3.6} fill="#ffb3c1" opacity={0.85} />
      {mood === 'listening' || mood === 'attention' ? (
        <ellipse cx={50} cy={65} rx={3} ry={3.6} fill="#2b2b2e" />
      ) : (
        <path d={sad ? 'M44 68 Q50 63 56 68' : 'M45 63 Q50 68 55 63'} stroke="#2b2b2e" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      )}
    </motion.g>
  )
}

const ORB_MOOD: Partial<Record<CharacterMood, OrbMood>> = {
  listening: 'listening',
  thinking: 'solving',
  searching: 'searching',
  writing: 'composing',
  working: 'working',
  attention: 'connecting',
}

function Orbit({ mood, still }: { mood: CharacterMood; still: boolean }) {
  return (
    <g>
      <circle cx={50} cy={52} r={30} fill="url(#orbitCore)" />
      <Eyes lx={41} rx={59} y={50} look={{ color: '#fff3ec', rx: 4.2, ry: 5.8 }} mood={mood} still={still} />
      {mood !== 'sleeping' && mood !== 'error' && mood !== 'listening' && mood !== 'attention' && (
        <path d="M45 61 Q50 65 55 61" stroke="#fff3ec" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      )}
      {(mood === 'listening' || mood === 'attention') && <ellipse cx={50} cy={62} rx={2.6} ry={3} fill="#fff3ec" />}
    </g>
  )
}

const BODIES: Record<CharacterId, (p: { mood: CharacterMood; still: boolean }) => JSX.Element> = { bolt: Bolt, mochi: Mochi, orbit: Orbit }

/**
 * The island's character in a mood. Uses the chosen character unless `id`
 * is given (Settings previews). Small sizes leave out the extras.
 */
export function Character({ mood, size = 64, id, label }: { mood: CharacterMood; size?: number; id?: CharacterId; label?: string }) {
  const chosen = useCharacter()
  const which = id ?? chosen.id
  const reduce = useReducedMotion() ?? false
  const uid = useId().replace(/:/g, '')
  const Body = BODIES[which] ?? Orbit
  const body = bodyMotion(mood)
  const svg = (
    <svg className={`character character-${which}`} data-mood={mood} data-character={which} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label ?? `${chosen.name}: ${mood}`}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="boltShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
        <radialGradient id="mochiShade" cx="40%" cy="30%" r="80%">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#d9b8a8" stopOpacity="0.45" />
        </radialGradient>
        <radialGradient id="orbitCore" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#f6b597" />
          <stop offset="0.6" stopColor="#d9714b" />
          <stop offset="1" stopColor="#8f3a20" />
        </radialGradient>
      </defs>
      <motion.g key={reduce ? 'still' : mood} animate={reduce ? undefined : body.animate} transition={body.transition} style={{ originX: '50px', originY: '88px' }} data-uid={uid}>
        <Body mood={mood} still={reduce} />
      </motion.g>
      {size >= 30 && <Overlay mood={mood} />}
    </svg>
  )
  if (which !== 'orbit') return svg
  // Orbit wears the original thinking orb as a swirling halo.
  const orbMood = ORB_MOOD[mood] ?? 'breathing'
  const halo = size >= 48 ? 64 : size >= 28 ? 32 : 20
  // Layout is inline so it works in any window (island or Settings).
  return (
    <span className="character-orbit-wrap" style={{ position: 'relative', display: 'inline-block', flex: 'none', width: size, height: size }}>
      <span
        className="character-orbit-halo"
        style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 }}
      >
        <span style={{ display: 'block', flex: 'none', transform: `scale(${(size * 1.08) / halo})` }}>
          <ThinkingOrb state={orbMood} size={halo as 20 | 32 | 64} theme="dark" color={mood === 'listening' ? '#ffb35c' : '#f0a483'} />
        </span>
      </span>
      <span style={{ position: 'absolute', inset: 0 }}>{svg}</span>
    </span>
  )
}
