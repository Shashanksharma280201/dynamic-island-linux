import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { RING, SLOT_IDS, angleOf, choiceAngle, ringHit, ringPlan, ringPlanForTypes, ringTitle, type Hit, type PlanEnv, type RingPlan, type SlotId } from '@shared/dragActions'
import './ring.css'

type Open = { env: PlanEnv; pointer: { x: number; y: number }; files?: string[]; at: number }

// Listening from the very start, so an early message isn't missed.
let opened: Open | null = null
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((f) => f())
const pointerSubs = new Set<(p: { x: number; y: number }) => void>()
let ended: 'end' | 'close' | null = null
window.island.ring.onOpen((o) => {
  opened = { ...o, at: Date.now() }
  ended = null
  tell()
})
window.island.ring.onPointer((p) => pointerSubs.forEach((f) => f(p)))
window.island.ring.onEnd(() => {
  ended = 'end'
  tell()
})
window.island.ring.onClose(() => {
  ended = 'close'
  tell()
})

const ACCENT = '#0a84ff'
const CLAUDE = '#e8845f'
const tintOf = (slot: SlotId | undefined) => (slot === 'ask' ? CLAUDE : ACCENT)
const NO_HIT: Hit = { slot: -1, hub: true, choice: -1, sub: -1, far: false }

/** A pie slice of the ring (in the wheel's own coordinates, centred on 0, 0). */
function slice(i: number, R: number, r: number, gap = 1.8): string {
  const p = (rad: number, a: number) => `${(rad * Math.sin(a)).toFixed(2)} ${(-rad * Math.cos(a)).toFixed(2)}`
  const a0 = ((i * 60 - 30 + gap) * Math.PI) / 180
  const a1 = ((i * 60 + 30 - gap) * Math.PI) / 180
  return `M${p(R, a0)} A${R} ${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 0 0 ${p(r, a0)} Z`
}
function rimArc(i: number): string {
  const R = RING.outer - 3
  const p = (a: number) => `${(R * Math.sin(a)).toFixed(2)} ${(-R * Math.cos(a)).toFixed(2)}`
  return `M${p(((i * 60 - 24) * Math.PI) / 180)} A${R} ${R} 0 0 1 ${p(((i * 60 + 24) * Math.PI) / 180)}`
}
const SLICES = SLOT_IDS.map((_s, i) => slice(i, RING.outer, RING.inner))
const RIMS = SLOT_IDS.map((_s, i) => rimArc(i))

function Icon({ id }: { id: SlotId }) {
  const paths: Record<SlotId, JSX.Element> = {
    convert: <path d="M7 7h11l-3-3M17 17H6l3 3" />,
    edit: (
      <>
        <path d="M4 20h4L19 9l-4-4L4 16v4z" />
        <path d="M13.5 6.5l4 4" />
      </>
    ),
    capture: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    ask: (
      <>
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
      </>
    ),
    shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
    text: <path d="M5 6h14M12 6v12M9 18h6" />,
  }
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      {paths[id]}
    </svg>
  )
}

/** What a drop at this spot would do, if anything. */
function actionAt(plan: RingPlan, h: Hit): { slot: SlotId; choice?: string } | null {
  if (h.slot < 0) return null
  const s = plan.slots[h.slot]
  if (!s.enabled) return null
  if (s.choices?.length) return h.choice >= 0 && s.choices[h.choice] ? { slot: s.id, choice: s.choices[h.choice].id } : null
  return { slot: s.id }
}

function caption(plan: RingPlan, h: Hit, saveTo: PlanEnv['saveTo']): string {
  if (h.hub) return 'Let go here to cancel'
  if (h.slot < 0) return 'Point at an action and let go'
  const s = plan.slots[h.slot]
  if (!s.enabled) return s.why ?? 'Not for this file'
  if (h.choice >= 0 && s.choices?.[h.choice]) {
    const c = s.choices[h.choice]
    return s.id === 'convert' ? `Convert to ${c.label}, saved ${saveTo === 'downloads' ? 'in Downloads' : 'next to the original'}` : `${c.label} ${c.sub}`
  }
  return s.hint
}

function Ring() {
  const [, render] = useState(0)
  const [plan, setPlan] = useState<RingPlan | null>(null)
  const [hit, setHit] = useState<Hit>(NO_HIT)
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: RING.window / 2, y: RING.window / 2 })
  const [phase, setPhase] = useState<'hidden' | 'armed' | 'open' | 'leaving' | 'dropped'>('hidden')
  const planRef = useRef<RingPlan | null>(null)
  const hitRef = useRef<Hit>(NO_HIT)
  const needle = useRef(0)
  const seen = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  planRef.current = plan

  useEffect(() => {
    const f = () => render((n) => n + 1)
    listeners.add(f)
    window.island.ring.ready()
    return () => void listeners.delete(f)
  }, [])

  // A new drag holding still: get ready, wait for the files' types.
  useEffect(() => {
    if (!opened || opened.at === seen.current) return
    seen.current = opened.at
    setPlan(null)
    setHit(NO_HIT)
    hitRef.current = NO_HIT
    setPointer(opened.pointer)
    const at = opened.at
    // The system said what's dragged (macOS): the ring opens with its actions at once.
    if (opened.files?.length) {
      const pl = ringPlan(opened.files, opened.env)
      if (!pl) {
        setPhase('hidden')
        window.island.ring.none()
        return
      }
      planRef.current = pl
      setPlan(pl)
      setPhase('open')
      window.island.ring.shown()
      return
    }
    setPhase('armed')
    // If the dragging app never says what it carries, there's nothing to show.
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (opened?.at === at && !planRef.current) {
        setPhase('hidden')
        window.island.ring.none()
      }
    }, 900)
  })

  // The drag ended or moved away: fold up.
  useEffect(() => {
    if (!ended || phase === 'hidden' || phase === 'dropped' || phase === 'leaving') return
    // Let go on an action with the files known (macOS): that's the drop, even
    // if the dragging app hasn't offered it to this window yet.
    const pl = planRef.current
    const a = ended === 'end' && pl && opened?.files?.length ? actionAt(pl, hitRef.current) : null
    if (a && opened?.files) {
      window.island.ring.drop({ ...a, paths: opened.files })
      setPhase('dropped')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setPhase('hidden'), 400)
      return
    }
    setPhase(planRef.current ? 'leaving' : 'hidden')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPhase('hidden'), 220)
  })

  const track = (p: { x: number; y: number }) => {
    const pl = planRef.current
    setPointer(p)
    if (!pl) return NO_HIT
    const C = RING.window / 2
    const sub = hitRef.current.sub
    const n = sub >= 0 ? pl.slots[sub].choices?.length ?? 0 : 0
    const h = ringHit(p.x - C, p.y - C, sub, n, (s) => !!pl.slots[s].enabled && !!pl.slots[s].choices?.length)
    hitRef.current = h
    setHit(h)
    return h
  }

  useEffect(() => {
    const f = (p: { x: number; y: number }) => {
      if (planRef.current) track(p)
    }
    pointerSubs.add(f)
    return () => void pointerSubs.delete(f)
  }, [])

  const onDrag = (e: DragEvent) => {
    if (phase === 'hidden' || phase === 'leaving' || phase === 'dropped') return
    let pl = planRef.current
    if (!pl && opened) {
      const types = Array.from(e.dataTransfer.items)
        .filter((i) => i.kind === 'file')
        .map((i) => i.type)
      pl = types.length ? ringPlanForTypes(types, opened.env) : null
      if (!pl) {
        setPhase('hidden')
        window.island.ring.none()
        return
      }
      planRef.current = pl
      setPlan(pl)
      setPhase('open')
      window.island.ring.shown()
    }
    if (!pl) return
    const h = track({ x: e.clientX, y: e.clientY })
    if (actionAt(pl, h)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    } else e.dataTransfer.dropEffect = 'none'
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const pl = planRef.current
    if (!pl || phase === 'dropped') return
    const a = actionAt(pl, track({ x: e.clientX, y: e.clientY }))
    if (!a) return
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.island.ring.pathFor(f))
      .filter(Boolean)
    window.island.ring.drop({ ...a, paths })
    setPhase('dropped')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPhase('hidden'), 400)
  }

  const C = RING.window / 2
  const dx = pointer.x - C
  const dy = pointer.y - C
  const raw = angleOf(dx, dy)
  needle.current += ((((raw - needle.current) % 360) + 540) % 360) - 180
  const show = plan && (phase === 'open' || phase === 'leaving' || phase === 'dropped')
  const subSlot = hit.sub >= 0 ? plan?.slots[hit.sub] : undefined
  const tintNow = tintOf(hit.slot >= 0 ? plan?.slots[hit.slot].id : undefined)
  const capBelow = subSlot?.id !== 'ask'

  return (
    <div className={`stage ${phase}`} onDragEnter={onDrag} onDragOver={onDrag} onDrop={onDrop} data-phase={phase}>
      {/* Waiting to hear what's dragged: an all but invisible disc under the pointer, since on
          Windows and macOS a drag passes through fully transparent parts of a window. */}
      {phase === 'armed' && <div className="catch" style={{ left: pointer.x - 70, top: pointer.y - 70 }} />}
      {show && plan && (
        <>
          <div className="halo" />
          <div className="ring" data-ring="open">
            <div className="ring-shadow" />
            <div className="ring-glass" />
            <span className="ripple" />
            <svg className="wheel" viewBox="-220 -220 440 440" aria-hidden="true">
              <defs>
                <radialGradient id="segIdle" cx="0" cy="0" r="150" gradientUnits="userSpaceOnUse">
                  <stop offset="0.4" stopColor="#fff" stopOpacity="0.015" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0.07" />
                </radialGradient>
                {(['segOn', 'segAsk'] as const).map((id) => (
                  <radialGradient key={id} id={id} cx="0" cy="0" r="156" gradientUnits="userSpaceOnUse">
                    <stop offset="0.38" stopColor={id === 'segAsk' ? CLAUDE : ACCENT} stopOpacity="0.16" />
                    <stop offset="1" stopColor={id === 'segAsk' ? CLAUDE : ACCENT} stopOpacity="0.82" />
                  </radialGradient>
                ))}
              </defs>
              {plan.slots.map((s, i) => {
                const lit = s.enabled && (hit.slot === i || hit.sub === i)
                const a = (i * 60 * Math.PI) / 180
                const off = lit ? 7 : 0
                const move = { transform: `translate(${(off * Math.sin(a)).toFixed(2)}px, ${(-off * Math.cos(a)).toFixed(2)}px)` }
                return (
                  <g key={s.id} className="seg-g" style={{ animationDelay: `${40 + i * 30}ms` }}>
                    <path className="seg" d={SLICES[i]} style={{ ...move, fill: lit ? (s.id === 'ask' ? 'url(#segAsk)' : 'url(#segOn)') : 'url(#segIdle)' }} />
                    <path className="rim" d={RIMS[i]} style={{ ...move, stroke: tintOf(s.id), opacity: lit ? 1 : 0, filter: `drop-shadow(0 0 6px ${tintOf(s.id)})` }} />
                  </g>
                )
              })}
            </svg>
            {plan.slots.map((s, i) => {
              const lit = s.enabled && (hit.slot === i || hit.sub === i)
              const a = (i * 60 * Math.PI) / 180
              const off = lit ? 7 : 0
              const style: CSSProperties & Record<string, string> = {
                left: `${220 + (RING.labelAt + off) * Math.sin(a)}px`,
                top: `${220 - (RING.labelAt + off) * Math.cos(a)}px`,
                animationDelay: `${100 + i * 30}ms`,
                transform: `translate(-50%, -50%) scale(${lit ? 1.07 : 1})`,
                '--tint': tintOf(s.id),
              }
              return (
                <div key={s.id} className={`seg-label ${lit ? 'on' : s.enabled ? '' : 'off'}`} style={style} data-slot={s.id} data-on={lit ? 'true' : 'false'}>
                  <span className="ib">
                    <Icon id={s.id} />
                  </span>
                  <span>{s.label}</span>
                </div>
              )
            })}
            <div className="needle" style={{ opacity: hit.hub || Math.hypot(dx, dy) < 30 ? 0 : 1, transform: `rotate(${needle.current.toFixed(1)}deg)`, ['--tint' as string]: tintNow }}>
              <i />
            </div>
            <div className={`hub ${hit.hub ? 'cancel' : ''}`}>
              {hit.hub ? (
                <div className="hub-x">
                  <svg className="ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ strokeWidth: 2.2 }}>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  Cancel
                </div>
              ) : (
                <>
                  <span className={`doc ${plan.files.length > 1 ? 'stack' : ''}`}>
                    <i />
                    <b style={{ background: plan.files[0].color }}>{plan.files[0].ext.toUpperCase()}</b>
                  </span>
                  <span className="hub-name">{ringTitle(plan.files)}</span>
                </>
              )}
            </div>
            {subSlot?.choices?.map((c, i) => {
              const n = subSlot.choices!.length
              const a = (choiceAngle(hit.sub, i, n) * Math.PI) / 180
              const on = hit.choice === i
              const style: CSSProperties & Record<string, string> = {
                left: `${220 + RING.choiceAt * Math.sin(a)}px`,
                top: `${220 - RING.choiceAt * Math.cos(a)}px`,
                animationDelay: `${i * 40}ms`,
                transform: `translate(-50%, -50%) scale(${on ? 1.08 : 1})`,
                '--fx': `${(-66 * Math.sin(a)).toFixed(1)}px`,
                '--fy': `${(66 * Math.cos(a)).toFixed(1)}px`,
                '--tint': tintOf(subSlot.id),
              }
              return (
                <div key={`${subSlot.id}-${c.id}`} className={`chip ${on ? 'on' : ''}`} style={style} data-choice={c.id}>
                  <span className="cl">
                    {subSlot.id === 'ask' ? (
                      <svg className="ico" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" style={{ strokeWidth: 2.2, color: on ? '#fff' : CLAUDE }}>
                        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
                      </svg>
                    ) : (
                      <span className="dot" style={{ background: c.color }} />
                    )}
                    {c.label}
                  </span>
                  <span className="sub">{c.sub}</span>
                </div>
              )
            })}
          </div>
          <div className="caption" style={{ top: capBelow ? C + 176 : C - 212 }} data-caption>
            <span className="dot" style={{ background: hit.hub ? '#ff6961' : tintNow }} />
            <span>{caption(plan, hit, opened?.env.saveTo)}</span>
          </div>
        </>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Ring />)
