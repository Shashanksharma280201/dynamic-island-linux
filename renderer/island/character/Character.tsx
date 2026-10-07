import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion'
import { ThinkingOrb } from 'thinking-orbs'
import type { OrbMood } from '@shared/claude'
import { DEFAULT_CHARACTER, MOOD_COLOR, gazeToward, ringKind, type CharacterConfig, type CharacterId, type CharacterMood } from '@shared/character'
import { sound } from '../../sound'

/** The chosen character (and its name) for everything on the island. */
export const CharacterContext = createContext<CharacterConfig>({ id: DEFAULT_CHARACTER, name: 'Orbit' })
export const useCharacter = () => useContext(CharacterContext)

// ---------------------------------------------------------------- motion ----

/** A face shown over the mood for a moment (a reaction). */
type Face = 'happy' | 'spiral' | 'heart' | null
/** Where the eyes look: -1..1 on each axis. */
type Look = [number, number]

/** Three boops this close together and it gets dizzy. */
export const BOOP_WINDOW_MS = 1400
export const DIZZY_MS = 2400


/** The eyes follow the pointer anywhere on screen (the main process sends it). */
function useGaze(ref: RefObject<SVGSVGElement>, enabled: boolean): Look {
  const [look, setLook] = useState<Look>([0, 0])
  useEffect(() => {
    if (!enabled || !window.island?.onCursor) return setLook([0, 0])
    return window.island.onCursor(({ x, y }) => {
      const r = ref.current?.getBoundingClientRect()
      if (!r || !r.width) return
      const next = gazeToward(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
      setLook((prev) => (Math.abs(prev[0] - next[0]) + Math.abs(prev[1] - next[1]) < 0.03 ? prev : next))
    })
  }, [enabled, ref])
  return look
}

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
      // Breathes: a slow rise and a hint of swell.
      return { animate: { y: [0, -2, 0], scaleY: [1, 1.016, 1], rotate: 0, scale: 1 }, transition: loop(3.6) }
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
function Eyes({ lx, rx: rxPos, y, look, mood, still, face = null }: { lx: number; rx: number; y: number; look: EyeLook; mood: CharacterMood; still: boolean; face?: Face }) {
  const awake = !face && mood !== 'sleeping' && mood !== 'done' && mood !== 'dancing' && mood !== 'error'
  const blink = useBlink(awake && !still)
  const glance = useGlance(mood === 'idle' && !still)
  const stroke = { stroke: look.color, strokeWidth: look.rx * 0.75, strokeLinecap: 'round' as const, fill: 'none' }
  const one = (cx: number, side: -1 | 1) => {
    if (face === 'spiral') {
      let d = `M${cx} ${y}`
      for (let a = 0.3; a < Math.PI * 4.2; a += 0.3) d += ` L${cx + Math.cos(a * side) * a * look.rx * 0.14} ${y + Math.sin(a * side) * a * look.rx * 0.14}`
      return <path key={side} d={d} stroke={look.color} strokeWidth={look.rx * 0.36} fill="none" strokeLinecap="round" />
    }
    if (face === 'heart')
      return <path key={side} transform={`translate(${cx} ${y}) scale(${look.rx * 0.16})`} d="M0 6 C-9 -1 -7 -9 0 -4 C7 -9 9 -1 0 6Z" fill="#ff375f" />
    if (face === 'happy' || mood === 'done' || mood === 'dancing')
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

type BodyProps = { mood: CharacterMood; still: boolean; face: Face; look: Look; tint: string }

/** The face turns toward where the eyes look (a head on a sphere). */
const Face = ({ look, still, children }: { look: Look; still: boolean; children: ReactNode }) => (
  <motion.g animate={{ x: look[0] * 3.2, y: look[1] * 2.6 }} transition={still ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 24 }}>
    {children}
  </motion.g>
)

function Bolt({ mood, still, face, look, tint }: BodyProps) {
  const light = face === 'heart' ? '#ff375f' : (ANTENNA[mood] ?? '#30d158')
  return (
    <g>
      <line x1={50} y1={13} x2={50} y2={24} stroke="#9aa4b2" strokeWidth={3} strokeLinecap="round" />
      <motion.circle cx={50} cy={11} r={5} fill={light} animate={still ? undefined : { opacity: mood === 'sleeping' ? 0.5 : [1, 0.55, 1] }} transition={loop(mood === 'listening' ? 0.8 : 2)} />
      <rect x={13} y={45} width={8} height={18} rx={4} fill="#c9d0d9" />
      <rect x={79} y={45} width={8} height={18} rx={4} fill="#c9d0d9" />
      <rect x={18} y={24} width={64} height={58} rx={24} fill="#eef1f5" />
      <rect x={18} y={24} width={64} height={58} rx={24} fill="url(#boltShade)" />
      <rect x={18} y={24} width={64} height={58} rx={24} fill={tint} />
      <rect x={26} y={35} width={48} height={33} rx={15} fill="#161b26" />
      <Face look={look} still={still}>
        <Eyes lx={40} rx={60} y={51.5} look={{ color: '#64d2ff', rx: 5.6, ry: 7.5, glow: true }} mood={mood} still={still} face={face} />
      </Face>
    </g>
  )
}

function Puff({ mood, still, face, look, tint }: BodyProps) {
  const sad = mood === 'error'
  const happy = mood === 'done' || mood === 'dancing'
  const body = 'M12 82 C 10 40, 32 18, 50 18 C 68 18, 90 40, 88 82 Q 50 92 12 82Z'
  return (
    <motion.g animate={mood === 'sleeping' ? { scaleY: 0.9, scaleX: 1.06 } : happy ? { scaleY: [1, 0.9, 1], scaleX: [1, 1.08, 1] } : { scaleY: 1, scaleX: 1 }} transition={happy ? loop(0.6) : { duration: 0.4 }} style={{ originX: '50px', originY: '86px' }}>
      <path d={body} fill="#fff6f0" />
      <path d={body} fill="url(#puffShade)" />
      <path d={body} fill={tint} />
      <Face look={look} still={still}>
        <Eyes lx={38} rx={62} y={52} look={{ color: '#2b2b2e', rx: 4.6, ry: 6, shine: true }} mood={mood} still={still} face={face} />
        <ellipse cx={28} cy={64} rx={6.5} ry={3.6} fill="#ffb3c1" opacity={face === 'heart' ? 1 : 0.85} />
        <ellipse cx={72} cy={64} rx={6.5} ry={3.6} fill="#ffb3c1" opacity={face === 'heart' ? 1 : 0.85} />
        {face === 'spiral' || mood === 'listening' || mood === 'attention' ? (
          <ellipse cx={50} cy={65} rx={3} ry={3.6} fill="#2b2b2e" />
        ) : (
          <path d={sad ? 'M44 68 Q50 63 56 68' : face ? 'M44 63 Q50 70 56 63' : 'M45 63 Q50 68 55 63'} stroke="#2b2b2e" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        )}
      </Face>
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

function Orbit({ mood, still, face, look, tint }: BodyProps) {
  return (
    <g>
      <circle cx={50} cy={52} r={30} fill="url(#orbitCore)" />
      <circle cx={50} cy={52} r={30} fill={tint} />
      <Face look={look} still={still}>
        <Eyes lx={41} rx={59} y={50} look={{ color: '#fff3ec', rx: 4.2, ry: 5.8 }} mood={mood} still={still} face={face} />
        {(face || (mood !== 'sleeping' && mood !== 'error' && mood !== 'listening' && mood !== 'attention')) && face !== 'spiral' && (
          <path d={face ? 'M44 60 Q50 67 56 60' : 'M45 61 Q50 65 55 61'} stroke="#fff3ec" strokeWidth={2.2} fill="none" strokeLinecap="round" />
        )}
        {(face === 'spiral' || (!face && (mood === 'listening' || mood === 'attention'))) && <ellipse cx={50} cy={62} rx={2.6} ry={3} fill="#fff3ec" />}
      </Face>
    </g>
  )
}

const BODIES: Record<CharacterId, (p: BodyProps) => JSX.Element> = { bolt: Bolt, puff: Puff, orbit: Orbit }

// ------------------------------------------------------------------ ring ----

/** The aura ring: the mood's colour, spinning while busy, breathing when it needs you. */
function Ring({ mood, still, color = MOOD_COLOR[mood] }: { mood: CharacterMood; still: boolean; color?: string | null }) {
  const kind = ringKind(mood)
  if (!kind || !color) return null
  const c = 2 * Math.PI * 46
  return (
    <g className="aura-ring" data-ring={kind}>
      <circle cx={50} cy={52} r={46} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={3.4} />
      <motion.circle
        cx={50}
        cy={52}
        r={46}
        fill="none"
        stroke={color}
        strokeWidth={3.6}
        strokeLinecap="round"
        filter="url(#glow)"
        strokeDasharray={kind === 'busy' ? `${c * 0.18} ${c}` : `${c} ${c}`}
        style={{ originX: '50px', originY: '52px' }}
        initial={{ opacity: 0 }}
        animate={still ? { opacity: 1, rotate: -90 } : kind === 'busy' ? { opacity: 1, rotate: [-90, 270] } : kind === 'alert' ? { opacity: [1, 0.55, 1], rotate: -90 } : { opacity: 1, rotate: -90 }}
        transition={kind === 'busy' ? { rotate: { duration: 1.4, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.24 } } : kind === 'alert' ? { opacity: loop(1.2), rotate: { duration: 0 } } : { duration: 0.24 }}
      />
    </g>
  )
}

// ------------------------------------------------------------- reactions ----

/** Boop the character, boop it again fast and it gets dizzy; rest the pointer on it and it loves you. */
function useReactions(enabled: boolean) {
  const [face, setFace] = useState<Face>(null)
  const [react, setReact] = useState<'boop' | 'dizzy' | 'love' | null>(null)
  const boops = useRef<number[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const lastLove = useRef(0)
  const play = (r: 'boop' | 'dizzy' | 'love', ms: number) => {
    clearTimeout(timer.current)
    setReact(r)
    setFace(r === 'dizzy' ? 'spiral' : r === 'love' ? 'heart' : 'happy')
    timer.current = setTimeout(() => (setReact(null), setFace(null)), ms)
  }
  useEffect(() => () => (clearTimeout(timer.current), clearTimeout(hoverTimer.current)), [])
  if (!enabled) return { face: null, react: null, handlers: {} }
  return {
    face,
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
      onPointerMove: () => {},
      onPointerLeave: () => clearTimeout(hoverTimer.current),
    },
  }
}

/** Body motion for a reaction, on top of the mood. */
function reactionMotion(r: 'boop' | 'dizzy' | 'love'): { animate: TargetAndTransition; transition: Transition } {
  if (r === 'boop') return { animate: { scaleX: [1, 1.14, 0.96, 1], scaleY: [1, 0.86, 1.06, 1], rotate: 0, y: 0 }, transition: { duration: 0.6, times: [0, 0.12, 0.35, 1] } }
  if (r === 'dizzy') return { animate: { rotate: [-10, 10, -10], y: 0 }, transition: loop(0.62) }
  return { animate: { y: [0, -3, 0], rotate: 0 }, transition: loop(0.8) }
}

/** Little extras for a reaction: stars circling, hearts rising. */
function ReactionOverlay({ r }: { r: 'boop' | 'dizzy' | 'love' }) {
  if (r === 'dizzy')
    return (
      <motion.g animate={{ rotate: 360 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }} style={{ originX: '50px', originY: '14px' }}>
        {[0, 120, 240].map((a) => (
          <path key={a} transform={`rotate(${a} 50 14) translate(${50 + 16} 14) scale(.5)`} d="M0 -8 L1.6 -1.6 L8 0 L1.6 1.6 L0 8 L-1.6 1.6 L-8 0 L-1.6 -1.6Z" fill="#ffd60a" />
        ))}
      </motion.g>
    )
  if (r === 'love')
    return (
      <g>
        {[
          [80, 20, 0],
          [18, 16, 0.35],
          [88, 40, 0.7],
        ].map(([x, y, d]) => (
          <motion.path key={x} d="M0 6 C-9 -1 -7 -9 0 -4 C7 -9 9 -1 0 6Z" fill="#ff375f" initial={{ opacity: 0, x, y: y + 10, scale: 0.4 }} animate={{ opacity: [0, 1, 0], y: [y + 10, y - 8], scale: 0.8 }} transition={{ duration: 1.4, delay: d }} />
        ))}
      </g>
    )
  return null
}

/**
 * The island's character in a mood. Uses the chosen character unless `id`
 * is given (Settings previews). Small sizes leave out the extras.
 * `track`: the eyes follow the pointer. `interactive`: boop it, rest on it.
 */
export function Character({
  mood,
  size = 64,
  id,
  label,
  track = false,
  interactive = false,
  ring = size >= 30,
  color: colorOverride,
}: {
  mood: CharacterMood
  size?: number
  id?: CharacterId
  label?: string
  track?: boolean
  interactive?: boolean
  ring?: boolean
  /** A colour for the ring and tint instead of the mood's own (e.g. green for a file drop). */
  color?: string
}) {
  const chosen = useCharacter()
  const which = id ?? chosen.id
  const reduce = useReducedMotion() ?? false
  const uid = useId().replace(/:/g, '')
  const ref = useRef<SVGSVGElement>(null)
  const look = useGaze(ref, track && !reduce && mood !== 'sleeping')
  const { face, react, handlers } = useReactions(interactive && !reduce)
  const Body = BODIES[which] ?? Orbit
  const body = react ? reactionMotion(react) : bodyMotion(mood)
  const color = colorOverride ?? MOOD_COLOR[mood]
  const tintId = `tint-${uid}`
  const svg = (
    <svg
      ref={ref}
      className={`character character-${which}${interactive ? ' interactive' : ''}`}
      data-mood={mood}
      data-character={which}
      data-reaction={react ?? undefined}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ?? `${chosen.name}: ${mood}`}
      {...handlers}
    >
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
        <radialGradient id="puffShade" cx="40%" cy="30%" r="80%">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#d9b8a8" stopOpacity="0.45" />
        </radialGradient>
        <radialGradient id="orbitCore" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#f6b597" />
          <stop offset="0.6" stopColor="#d9714b" />
          <stop offset="1" stopColor="#8f3a20" />
        </radialGradient>
        {/* The mood's colour rising from the bottom of the body. */}
        <linearGradient id={tintId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={color ?? '#000'} stopOpacity={color ? (which === 'orbit' ? 0.35 : 0.5) : 0} />
          <stop offset="0.7" stopColor={color ?? '#000'} stopOpacity={0} />
        </linearGradient>
      </defs>
      {ring && <Ring mood={mood} still={reduce} color={color} />}
      <motion.g key={reduce ? 'still' : (react ?? mood)} animate={reduce ? undefined : body.animate} transition={body.transition} style={{ originX: '50px', originY: '88px' }} data-uid={uid}>
        <Body mood={mood} still={reduce} face={face} look={look} tint={`url(#${tintId})`} />
      </motion.g>
      {size >= 30 && (react ? <ReactionOverlay r={react} /> : <Overlay mood={mood} />)}
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
