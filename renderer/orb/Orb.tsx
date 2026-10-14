import { useEffect, useRef } from 'react'
import { MODE_FRAMES, paintFrame, resolvePreset, type OrbState } from 'thinking-orbs/engine'
import { scaleCounts, scaleRadii } from 'thinking-orbs'

export type { OrbState }

/** The size presets the orbs were tuned at; anything else scales from the nearest. */
const BASES = [20, 32, 64] as const

/** Which tuned preset to draw a `size` px orb from, and how much to scale it. Pure. */
export function orbBase(size: number): { base: 20 | 32 | 64; scale: number } {
  const base = size <= 26 ? 20 : size <= 46 ? 32 : 64
  return { base, scale: size / base }
}

/** "#ff9f0a" or "rgb(…)" → an ink tint. Pure. */
export function parseTint(color: string | undefined): { r: number; g: number; b: number } | undefined {
  if (!color) return undefined
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1]
    const n = parseInt(h, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const fn = color.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  return fn ? { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) } : undefined
}

/** The tint for an agent at work (Claude's warm orange, as on Orbit's halo). */
export const AGENT_INK = '#ffb48f'

const LABELS: Record<OrbState, string> = {
  working: 'Working',
  searching: 'Searching',
  solving: 'Thinking',
  listening: 'Listening',
  connecting: 'Connecting',
  weaving: 'Putting it together',
  composing: 'Writing',
  breathing: 'Resting',
  shaping: 'Shaping',
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A dotted "thinking orb" (thinking-orbs, MIT) at any size, in light ink for
 * the island's dark glass. Drawn on its own canvas so it stays sharp from
 * 16 to 200 px. With `level` (0–1, e.g. the microphone) it swells and speeds
 * up with your voice. It stops drawing while hidden, off screen or paused.
 */
export function Orb({
  state,
  size,
  color,
  speed = 1,
  dots = 1,
  dotSize = 1,
  paused = false,
  level,
  className,
  title,
}: {
  state: OrbState
  size: number
  color?: string
  speed?: number
  /** Density multiplier. */
  dots?: number
  /** Dot radius multiplier. */
  dotSize?: number
  paused?: boolean
  /** Read every frame: 0 (quiet) to 1 (loud). */
  level?: () => number
  className?: string
  title?: string
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const levelRef = useRef(level)
  levelRef.current = level

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)

    const { base, scale } = orbBase(size)
    const { mode, speed: baseSpeed, opts: preset } = resolvePreset(state, base)
    // Bigger than the tuned size: a few more dots, a little bolder, not blown up.
    const grow = scale > 1 ? scale : 1
    let opts = scaleCounts(preset, Math.max(0.1, dots * Math.sqrt(grow)))
    // Small ones get bolder dots, or they fade into a grey smudge on dark glass.
    const bold = size <= 24 ? 1.35 : size <= 32 ? 1.15 : 1
    opts = scaleRadii(opts, Math.max(0.1, dotSize * bold * Math.pow(scale, 0.6)))
    const draw = MODE_FRAMES[mode]
    const tint = parseTint(color)

    // Our own clock, so a changing voice level speeds it up without a jump.
    let t = (performance.now() / 1000) * baseSpeed * speed
    let last = performance.now()
    let smooth = 0
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const lv = levelRef.current ? Math.max(0, Math.min(1, levelRef.current() || 0)) : 0
      smooth += (lv - smooth) * (lv > smooth ? 0.35 : 0.08)
      t += dt * baseSpeed * speed * (1 + smooth * 1.6)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      if (smooth > 0.01) {
        // Swell from the middle with the voice.
        const k = 1 + smooth * 0.16
        ctx.translate(size / 2, size / 2)
        ctx.scale(k, k)
        ctx.translate(-size / 2, -size / 2)
      }
      paintFrame(ctx, draw(size, t, opts), true, tint)
    }

    frame(performance.now())
    if (paused || reducedMotion()) return

    let raf = 0
    let running = false
    let onScreen = true
    const loop = (now: number) => {
      frame(now)
      if (running) raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || !onScreen || document.visibilityState === 'hidden') return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      if (onScreen) start()
      else stop()
    })
    io.observe(canvas)
    const onVis = () => (document.visibilityState === 'hidden' ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    start()
    return () => {
      stop()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [state, size, color, speed, dots, dotSize, paused])

  return (
    <canvas
      ref={ref}
      className={`orb${className ? ` ${className}` : ''}`}
      data-state={state}
      role="img"
      aria-label={title ?? LABELS[state]}
      title={title}
      style={{ width: size, height: size, display: 'block', flex: 'none' }}
    />
  )
}

export { BASES as ORB_BASES }
