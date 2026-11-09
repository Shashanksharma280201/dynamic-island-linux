import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion'
import { Orb } from '../../orb/Orb'
import type { OrbMood } from '@shared/claude'
import { DEFAULT_CHARACTER, MOOD_COLOR, gazeToward, ringKind, wearing, type CharacterConfig, type CharacterId, type CharacterMood, type Outfit, type Wear } from '@shared/character'
import { ANCHORS, FaceWear, HATS, HeadWear } from './Outfits'
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

// ------------------------------------------------------------------ face ----

/** The ink of the eyes and mouth: near-black, like system emoji. */
const INK = '#1c1c1e'

/** Where a character's face sits, in its 100×100 drawing. */
type FaceSpec = {
  eyeY: number
  eyeL: number
  eyeR: number
  /** Eye radius. */
  r: number
  /** Taller-than-wide eyes (Bolt's), else round dots. */
  capsule?: boolean
  mouthY: number
  mouthW: number
}

/** Two dot eyes that change with the mood: wide, squinting, closed, happy. */
function Eyes({ f, mood, still, face = null }: { f: FaceSpec; mood: CharacterMood; still: boolean; face?: Face }) {
  const awake = !face && mood !== 'sleeping' && mood !== 'done' && mood !== 'dancing' && mood !== 'error'
  const blink = useBlink(awake && !still)
  const glance = useGlance(mood === 'idle' && !still)
  const r = f.r
  const line = { stroke: INK, strokeWidth: r * 0.62, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  const one = (cx: number, side: -1 | 1) => {
    const y = f.eyeY
    if (face === 'spiral') {
      let d = `M${cx} ${y}`
      for (let a = 0.3; a < Math.PI * 4.2; a += 0.3) d += ` L${cx + Math.cos(a * side) * a * r * 0.15} ${y + Math.sin(a * side) * a * r * 0.15}`
      return <path key={side} d={d} {...line} strokeWidth={r * 0.36} />
    }
    if (face === 'heart') return <path key={side} transform={`translate(${cx} ${y}) scale(${r * 0.2})`} d="M0 6 C-9 -1 -7 -9 0 -4 C7 -9 9 -1 0 6Z" fill="#ff375f" />
    // Happy: "^ ^".
    if (face === 'happy' || mood === 'done' || mood === 'dancing') return <path key={side} d={`M${cx - r * 1.05} ${y + r * 0.45} Q${cx} ${y - r * 1.25} ${cx + r * 1.05} ${y + r * 0.45}`} {...line} />
    // Asleep: closed, curving down.
    if (mood === 'sleeping') return <path key={side} d={`M${cx - r * 1.05} ${y} Q${cx} ${y + r * 0.95} ${cx + r * 1.05} ${y}`} {...line} />
    // Upset: "> <", squeezed shut.
    if (mood === 'error') return <path key={side} d={`M${cx + side * r * 0.85} ${y - r * 0.75} L${cx - side * r * 0.75} ${y} L${cx + side * r * 0.85} ${y + r * 0.75}`} {...line} />
    const wide = mood === 'listening' || mood === 'attention'
    const focus = mood === 'searching' || mood === 'writing' || mood === 'working'
    const rx = r * (f.capsule ? 0.78 : 1) * (wide ? 1.12 : 1)
    const ry = r * (f.capsule ? 1.32 : 1) * (wide ? 1.16 : focus ? 0.62 : 1)
    // Thinking looks up and away; at work, down at it.
    const dy = mood === 'thinking' ? -r * 0.5 : focus ? r * 0.25 : 0
    const dx = mood === 'thinking' ? r * 0.45 : glance * (r / 4.4)
    return (
      <motion.g key={side} animate={{ x: dx, y: dy, scaleY: blink ? 0.1 : 1 }} transition={{ duration: blink ? 0.06 : 0.25 }} style={{ originX: `${cx}px`, originY: `${y}px` }}>
        <ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={INK} />
        <circle cx={cx + rx * 0.34} cy={y - ry * 0.38} r={Math.min(rx, ry) * 0.3} fill="#fff" opacity={0.9} />
      </motion.g>
    )
  }
  return (
    <g className="eyes">
      {one(f.eyeL, -1)}
      {one(f.eyeR, 1)}
    </g>
  )
}

/** One line for a mouth (a small "o" when it's surprised or listening). */
function Mouth({ f, mood, face }: { f: FaceSpec; mood: CharacterMood; face: Face }) {
  const y = f.mouthY
  const w = f.mouthW
  const l = 50 - w / 2
  const rr = 50 + w / 2
  const line = { stroke: INK, strokeWidth: f.r * 0.56, strokeLinecap: 'round' as const, fill: 'none', className: 'mouth' }
  if (face === 'spiral' || (!face && (mood === 'listening' || mood === 'attention'))) return <ellipse className="mouth" cx={50} cy={y + 0.5} rx={f.r * 0.5} ry={f.r * 0.62} fill={INK} />
  if (face || mood === 'done' || mood === 'dancing') return <path d={`M${l - 1} ${y - 1} Q50 ${y + w * 0.62} ${rr + 1} ${y - 1}`} {...line} />
  if (mood === 'error') return <path d={`M${l + 1} ${y + 2.5} Q50 ${y - w * 0.28} ${rr - 1} ${y + 2.5}`} {...line} />
  if (mood === 'sleeping') return <path d={`M${50 - w * 0.2} ${y + 1} L${50 + w * 0.2} ${y + 1}`} {...line} />
  if (mood === 'thinking') return <path d={`M${50 - w * 0.25} ${y + 1.2} L${50 + w * 0.35} ${y}`} {...line} />
  if (mood === 'searching' || mood === 'writing' || mood === 'working') return <path d={`M${50 - w * 0.3} ${y + 1} L${50 + w * 0.3} ${y + 1}`} {...line} />
  return <path d={`M${l} ${y} Q50 ${y + w * 0.36} ${rr} ${y}`} {...line} />
}

// -------------------------------------------------------------- overlays ----

/** What it's doing, as a small glyph in a badge by its head (like an app's): thinking dots, a magnifier, a check… */
function Badge({ mood, color }: { mood: CharacterMood; color: string | null }) {
  const g = { stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  let glyph: ReactNode = null
  switch (mood) {
    case 'listening':
      glyph = [-3, 0, 3].map((x, i) => <motion.line key={x} x1={x} x2={x} y1={-1.5} y2={1.5} {...g} animate={{ y1: [-1.5, -3.6, -1.5], y2: [1.5, 3.6, 1.5] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />)
      break
    case 'thinking':
      glyph = [-3.2, 0, 3.2].map((x, i) => <motion.circle key={x} cx={x} cy={0} r={1.25} fill="#fff" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />)
      break
    case 'searching':
      glyph = (
        <g {...g}>
          <circle cx={-0.8} cy={-0.8} r={2.9} />
          <path d="M1.4 1.4 L3.6 3.6" />
        </g>
      )
      break
    case 'writing':
      glyph = (
        <g {...g}>
          <path d="M-3.2 3.2 L2.4 -2.4" strokeWidth={2.4} />
          <path d="M-3.9 3.9 L-3.3 3.3" />
        </g>
      )
      break
    case 'working':
      glyph = (
        <motion.g animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <circle r={3.4} {...g} strokeDasharray="14 22" />
        </motion.g>
      )
      break
    case 'done':
      glyph = <path d="M-3.4 0.2 L-1 2.6 L3.6 -2.4" {...g} strokeWidth={2.1} />
      break
    case 'attention':
      glyph = (
        <g>
          <path d="M0 -3.8 L0 0.9" {...g} strokeWidth={2.2} />
          <circle cy={3.5} r={1.2} fill="#fff" />
        </g>
      )
      break
    case 'error':
      glyph = <path d="M-2.8 -2.8 L2.8 2.8 M2.8 -2.8 L-2.8 2.8" {...g} strokeWidth={2.1} />
      break
    case 'sleeping':
      glyph = <path d="M-2.8 -2.8 H2.8 L-2.8 2.8 H2.8" {...g} strokeWidth={1.8} />
      break
    case 'dancing':
      glyph = (
        <g>
          <path d="M1.6 2.4 V-3.8 Q3.4 -3.2 3.8 -1.2" {...g} strokeWidth={1.6} />
          <ellipse cx={-0.2} cy={2.6} rx={2} ry={1.6} fill="#fff" />
        </g>
      )
      break
    default:
      return null
  }
  return (
    <motion.g className="mood-badge" data-badge={mood} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }} style={{ originX: '83px', originY: '19px' }}>
      <g transform="translate(83 19)">
        <circle r={8.6} fill={color ?? '#8e8e93'} stroke="rgba(255,255,255,.9)" strokeWidth={1.4} />
        {glyph}
      </g>
    </motion.g>
  )
}

// ------------------------------------------------------------ characters ----

/** A superellipse (|x|ⁿ + |y|ⁿ = 1): rounder than a rounded rectangle, the shape of Apple's icons at n ≈ 5. Pure. */
export function squircle(cx: number, cy: number, rx: number, ry: number, n = 5, below?: { ry: number; n: number }, steps = 96): string {
  let d = ''
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const c = Math.cos(t)
    const sn = Math.sin(t)
    // The lower half can be flatter and shorter (a dumpling sits on its base).
    const [yr, e] = below && sn > 0 ? [below.ry, below.n] : [ry, n]
    const x = cx + rx * Math.sign(c) * Math.abs(c) ** (2 / e)
    const y = cy + yr * Math.sign(sn) * Math.abs(sn) ** (2 / e)
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return `${d}Z`
}

/** Each character's own colour (your pick in Settings replaces it). */
export const CHARACTER_COLOR: Record<CharacterId, string> = { orbit: '#ff7a59', bolt: '#3d8bfd', puff: '#ff86b4' }

const BOLT_HEAD = squircle(50, 55, 32, 31, 4.6)
const PUFF_BODY = squircle(50, 61, 37, 33, 2.3, { ry: 25, n: 4.2 })

const FACES: Record<CharacterId, FaceSpec> = {
  orbit: { eyeY: 49, eyeL: 40.5, eyeR: 59.5, r: 4.4, mouthY: 61, mouthW: 11 },
  bolt: { eyeY: 52, eyeL: 39, eyeR: 61, r: 4.7, capsule: true, mouthY: 67, mouthW: 10 },
  puff: { eyeY: 59, eyeL: 39.5, eyeR: 60.5, r: 3.9, mouthY: 68, mouthW: 8 },
}

const ANTENNA: Partial<Record<CharacterMood, string>> = {
  listening: '#64d2ff',
  thinking: '#bf5af2',
  searching: '#ff9f0a',
  writing: '#ff9f0a',
  working: '#ff9f0a',
  attention: '#ff453a',
  error: '#ff453a',
  sleeping: '#8e8e93',
}

type BodyProps = { mood: CharacterMood; still: boolean; face: Face; look: Look; fill: string; sheen: string; wear: Wear }

/** The face turns toward where the eyes look (a head on a sphere). */
const Face = ({ look, still, children }: { look: Look; still: boolean; children: ReactNode }) => (
  <motion.g animate={{ x: look[0] * 3.2, y: look[1] * 2.6 }} transition={still ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 24 }}>
    {children}
  </motion.g>
)

/** A flat shape in one colour with a soft light from above. */
const Shape = ({ d, fill, sheen }: { d: string; fill: string; sheen: string }) => (
  <g className="body">
    <path d={d} fill={fill} />
    <path d={d} fill={sheen} />
  </g>
)

function Bolt({ mood, still, face, look, fill, sheen, wear }: BodyProps) {
  const light = face === 'heart' ? '#ff375f' : (ANTENNA[mood] ?? '#30d158')
  // Under a hat the antenna folds away.
  const antenna = !HATS.includes(wear)
  const f = FACES.bolt
  return (
    <g>
      {antenna && <line x1={50} y1={24.5} x2={50} y2={14} stroke={fill} strokeWidth={2.6} strokeLinecap="round" />}
      {antenna && <motion.circle className="antenna" cx={50} cy={11} r={4} fill={light} animate={still ? undefined : { opacity: mood === 'sleeping' ? 0.6 : [1, 0.6, 1] }} transition={loop(mood === 'listening' ? 0.8 : 2)} />}
      <Shape d={BOLT_HEAD} fill={fill} sheen={sheen} />
      <Face look={look} still={still}>
        <Eyes f={f} mood={mood} still={still} face={face} />
        <Mouth f={f} mood={mood} face={face} />
        <FaceWear wear={wear} a={ANCHORS.bolt} />
      </Face>
    </g>
  )
}

function Puff({ mood, still, face, look, fill, sheen, wear }: BodyProps) {
  const happy = mood === 'done' || mood === 'dancing'
  const f = FACES.puff
  return (
    <motion.g animate={mood === 'sleeping' ? { scaleY: 0.92, scaleX: 1.05 } : happy ? { scaleY: [1, 0.92, 1], scaleX: [1, 1.06, 1] } : { scaleY: 1, scaleX: 1 }} transition={happy ? loop(0.6) : { duration: 0.4 }} style={{ originX: '50px', originY: '86px' }}>
      <Shape d={PUFF_BODY} fill={fill} sheen={sheen} />
      <Face look={look} still={still}>
        <Eyes f={f} mood={mood} still={still} face={face} />
        <Mouth f={f} mood={mood} face={face} />
        <FaceWear wear={wear} a={ANCHORS.puff} />
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

function Orbit({ mood, still, face, look, fill, sheen, wear }: BodyProps) {
  const f = FACES.orbit
  return (
    <g>
      <g className="body">
        <circle cx={50} cy={52} r={33} fill={fill} />
        <circle cx={50} cy={52} r={33} fill={sheen} />
      </g>
      <Face look={look} still={still}>
        <Eyes f={f} mood={mood} still={still} face={face} />
        <Mouth f={f} mood={mood} face={face} />
        <FaceWear wear={wear} a={ANCHORS.orbit} />
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
      <circle cx={50} cy={52} r={46} fill="none" stroke="rgba(128,128,128,.16)" strokeWidth={2.8} />
      <motion.circle
        cx={50}
        cy={52}
        r={46}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
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
          <circle key={a} transform={`rotate(${a} 50 14) translate(${50 + 15} 14)`} r={2.2} fill="#ffd60a" />
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
  outfit,
  paint: paintOverride,
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
  /** What it wears, instead of the chosen outfit (Settings previews). */
  outfit?: Outfit
  /** Its body colour, instead of the chosen one (null: its own). */
  paint?: string | null
}) {
  const chosen = useCharacter()
  const which = id ?? chosen.id
  const reduce = useReducedMotion() ?? false
  const uid = useId().replace(/:/g, '')
  const ref = useRef<SVGSVGElement>(null)
  const look = useGaze(ref, track && !reduce && mood !== 'sleeping')
  const { face, react, handlers } = useReactions(interactive && !reduce)
  const Body = BODIES[which] ?? Orbit
  const wear = wearing(outfit ?? chosen.outfit, new Date())
  const paint = paintOverride !== undefined ? paintOverride : (chosen.color ?? null)
  const body = react ? reactionMotion(react) : bodyMotion(mood)
  const color = colorOverride ?? MOOD_COLOR[mood]
  const fill = paint ?? CHARACTER_COLOR[which] ?? CHARACTER_COLOR.orbit
  const sheenId = `sheen-${uid}`
  const svg = (
    <svg
      ref={ref}
      className={`character character-${which}${interactive ? ' interactive' : ''}`}
      data-mood={mood}
      data-character={which}
      data-reaction={react ?? undefined}
      data-outfit={wear}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      overflow="visible"
      aria-label={label ?? `${chosen.name}: ${mood}`}
      {...handlers}
    >
      <defs>
        {/* A soft light from above and a touch of shade below: flat, not glossy. */}
        <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.3} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.1} />
        </linearGradient>
      </defs>
      {ring && <Ring mood={mood} still={reduce} color={color} />}
      <motion.g key={reduce ? 'still' : (react ?? mood)} animate={reduce ? undefined : body.animate} transition={body.transition} style={{ originX: '50px', originY: '88px' }} data-uid={uid}>
        <Body mood={mood} still={reduce} face={face} look={look} fill={fill} sheen={`url(#${sheenId})`} wear={wear} />
        <HeadWear wear={wear} a={ANCHORS[which] ?? ANCHORS.orbit} />
      </motion.g>
      {size >= 30 && (react ? <ReactionOverlay r={react} /> : <Badge key={mood} mood={mood} color={color} />)}
    </svg>
  )
  const orbMood = ORB_MOOD[mood]
  if (which !== 'orbit' || !orbMood) return svg
  // Orbit wears the original thinking orb as a swirling halo while it listens or works.
  const halo = size >= 48 ? 64 : size >= 28 ? 32 : 20
  // Layout is inline so it works in any window (island or Settings).
  return (
    <span className="character-orbit-wrap" style={{ position: 'relative', display: 'inline-block', flex: 'none', width: size, height: size }}>
      <span
        className="character-orbit-halo"
        style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 }}
      >
        <span style={{ display: 'block', flex: 'none', transform: `scale(${(size * 1.08) / halo})` }}>
          <Orb state={orbMood} size={halo} tuned fps={30} color={paint ?? (mood === 'listening' ? '#ffb35c' : '#ff9a7e')} />
        </span>
      </span>
      <span style={{ position: 'absolute', inset: 0 }}>{svg}</span>
    </span>
  )
}
