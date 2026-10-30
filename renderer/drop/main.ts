import type { DropAimCmd, DropCmd, DropSendCmd, DropSide } from '@shared/drop'
import './drop.css'

/**
 * Phone Drop's glow. While a file heads for your phone's edge, light comes up
 * at this screen's edge next to it: a white bloom with a ring of colour
 * around it, the rest of the screen dimmed a little. When the bytes start,
 * the file comes out of the light; when it's saved, a band of colour sweeps
 * across the screen and the file flies into the island.
 */

type V = { x: number; y: number }
type Thumb = { id: string; el: HTMLDivElement; bar: HTMLElement; at: V; shown: number; leaving: boolean; out: Promise<void> }

const canvas = document.getElementById('glow') as HTMLCanvasElement
const stage = document.getElementById('stage') as HTMLDivElement
const ctx = canvas.getContext('2d')!
/** The glow is soft: drawing it at half size is plenty, and four times cheaper. */
const K = 0.5
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

const glow = { side: 'right' as DropSide, at: 0.5, level: 0, vel: 0, goal: 0, flash: 0, kick: 0, tint: 0, sweep: -1, sweepIn: true }
const pending = new Map<string, { side: DropSide; at: number; thumb?: string; name: string; ext: string; color: string }>()
const thumbs = new Map<string, Thumb>()
/** A file dragged toward the phone's edge: the light follows the pointer along it, with a label. */
const aim = { on: false, at: 0.5, vis: 0, el: null as HTMLDivElement | null, text: null as HTMLSpanElement | null }
let running = false
let idleSent = true
let lastT = 0

const W = () => window.innerWidth
const H = () => window.innerHeight
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Where the light comes in, and which way is into the screen. */
function edge(side: DropSide, at: number): { p: V; n: V; span: number } {
  const a = clamp(at, 0.18, 0.82)
  if (side === 'right') return { p: { x: W(), y: a * H() }, n: { x: -1, y: 0 }, span: W() }
  if (side === 'left') return { p: { x: 0, y: a * H() }, n: { x: 1, y: 0 }, span: W() }
  if (side === 'top') return { p: { x: a * W(), y: 0 }, n: { x: 0, y: 1 }, span: H() }
  return { p: { x: a * W(), y: H() }, n: { x: 0, y: -1 }, span: H() }
}

function resize() {
  canvas.width = Math.ceil(W() * K)
  canvas.height = Math.ceil(H() * K)
}
resize()
window.addEventListener('resize', resize)

function setPhase(phase: string) {
  document.body.dataset.phase = phase
}

function wake() {
  idleSent = false
  if (running) return
  running = true
  lastT = performance.now()
  requestAnimationFrame(frame)
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  const t = now / 1000
  // The light moves on a soft spring (critically damped): it eases in and
  // out, never jumps or overshoots. Up in about half a second, down slower.
  const k = glow.goal > glow.level ? 48 : 14
  glow.vel += ((glow.goal - glow.level) * k - 2 * Math.sqrt(k) * glow.vel) * dt
  glow.level = Math.max(0, glow.level + glow.vel * dt)
  if (aim.on) glow.at += (aim.at - glow.at) * (1 - Math.exp(-dt * 9))
  // The label comes with the light, and goes at once when the file is let go.
  aim.vis += ((aim.on && aim.text?.textContent ? Math.min(1, glow.level * 1.4) : 0) - aim.vis) * (1 - Math.exp(-dt * (aim.on ? 8 : 14)))
  // A flash swells over a moment, then fades.
  glow.flash += (glow.kick - glow.flash) * (1 - Math.exp(-dt * 9))
  glow.kick *= Math.exp(-dt * 3.4)
  glow.tint *= Math.exp(-dt * 1.5)
  if (glow.sweep >= 0) {
    glow.sweep += dt / (reduced ? 0.6 : 1.5)
    if (glow.sweep > 1) glow.sweep = -1
  }
  draw(t)
  placeAim()
  document.body.dataset.level = glow.level.toFixed(2)
  const quiet = glow.goal === 0 && glow.level < 0.004 && Math.abs(glow.vel) < 0.01 && glow.flash < 0.01 && glow.kick < 0.01 && glow.sweep < 0 && !thumbs.size && aim.vis < 0.01
  if (quiet) {
    running = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setPhase('idle')
    if (!idleSent) {
      idleSent = true
      window.island.drop.idle()
    }
    return
  }
  requestAnimationFrame(frame)
}

function draw(t: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(K, 0, 0, K, 0, 0)
  const { p, n, span } = edge(glow.side, glow.at)
  const L = glow.level * (1 + 0.03 * Math.sin(t * 1.6))
  const F = glow.flash
  const big = Math.hypot(W(), H())

  if (L > 0.003 || F > 0.01) {
    // The rest of the screen, a little dimmer, so the light shows.
    const dim = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, big)
    dim.addColorStop(0, 'rgba(3,5,12,0)')
    dim.addColorStop(0.22, `rgba(3,5,12,${0.06 * L})`)
    dim.addColorStop(1, `rgba(3,5,12,${0.22 * L})`)
    ctx.fillStyle = dim
    ctx.fillRect(0, 0, W(), H())

    // A ring of colour around the light, like light through glass.
    const sway = Math.sin(t * 0.9) * 0.025 * span
    for (const [scale, a] of [
      [1, 1],
      [0.8, 0.55],
    ] as const) {
      const c = { x: p.x - n.x * 0.04 * span + n.y * sway * 0.6, y: p.y - n.y * 0.04 * span + n.x * sway * 0.6 }
      const r = span * (0.4 + 0.24 * L + 0.18 * F) * scale + sway
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r)
      const k = (L + F * 0.6) * a
      const s = scale === 1 ? 0 : 0.03
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.36 + s, 'rgba(255,255,255,0)')
      g.addColorStop(0.46 + s, `rgba(140,225,255,${0.16 * k})`)
      g.addColorStop(0.54 + s, `rgba(120,255,190,${0.15 * k})`)
      g.addColorStop(0.62 + s, `rgba(255,226,120,${0.145 * k})`)
      g.addColorStop(0.7 + s, `rgba(255,140,150,${0.12 * k})`)
      g.addColorStop(0.79 + s, `rgba(206,120,255,${0.115 * k})`)
      g.addColorStop(0.9, `rgba(120,110,255,${0.03 * k})`)
      g.addColorStop(1, 'rgba(120,110,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W(), H())
    }

    // The light itself: white where the phone is.
    const rb = span * (0.18 + 0.3 * L + 0.25 * F)
    const b = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rb)
    const w = Math.min(0.72, 0.68 * L + 0.32 * F)
    const red = glow.tint
    b.addColorStop(0, `rgba(255,${Math.round(255 - 140 * red)},${Math.round(255 - 150 * red)},${w})`)
    b.addColorStop(0.2, `rgba(255,255,255,${0.7 * w})`)
    b.addColorStop(0.45, `rgba(238,246,255,${0.3 * w})`)
    b.addColorStop(0.72, `rgba(220,236,255,${0.08 * w})`)
    b.addColorStop(1, 'rgba(220,236,255,0)')
    ctx.fillStyle = b
    ctx.fillRect(0, 0, W(), H())

    // The edge itself catches the light.
    const along = n.x !== 0 ? H() : W()
    const line = n.x !== 0 ? ctx.createLinearGradient(0, p.y - along * 0.4, 0, p.y + along * 0.4) : ctx.createLinearGradient(p.x - along * 0.4, 0, p.x + along * 0.4, 0)
    line.addColorStop(0, 'rgba(255,255,255,0)')
    line.addColorStop(0.5, `rgba(255,255,255,${0.6 * w})`)
    line.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = line
    const th = 5
    if (glow.side === 'right') ctx.fillRect(W() - th, 0, th, H())
    else if (glow.side === 'left') ctx.fillRect(0, 0, th, H())
    else if (glow.side === 'top') ctx.fillRect(0, 0, W(), th)
    else ctx.fillRect(0, H() - th, W(), th)
  }

  // On arrival, a band of colour sweeps across the screen.
  if (glow.sweep >= 0) {
    const u = glow.sweep
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
    const env = Math.sin(Math.PI * u)
    const reach = span * 1.25
    // Into the screen for a file that arrived; toward the edge for one leaving.
    const d = glow.sweepIn ? e * reach : (1 - e) * reach
    const c = { x: p.x + n.x * d, y: p.y + n.y * d }
    const half = span * 0.13
    const g = ctx.createLinearGradient(c.x - n.x * half, c.y - n.y * half, c.x + n.x * half, c.y + n.y * half)
    const stops: [number, string][] = [
      [0, '170,120,255,0'],
      [0.14, `170,120,255,${0.09 * env}`],
      [0.3, `90,160,255,${0.12 * env}`],
      [0.44, `110,240,255,${0.14 * env}`],
      [0.52, `255,255,255,${0.17 * env}`],
      [0.6, `140,255,170,${0.13 * env}`],
      [0.74, `255,235,130,${0.12 * env}`],
      [0.88, `255,150,120,${0.08 * env}`],
      [1, '255,150,120,0'],
    ]
    // The leading edge goes first (into the screen).
    for (const [o, rgba] of stops) g.addColorStop(1 - o, `rgba(${rgba})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W(), H())
  }
}

// ---- Dragging a file to the phone ----

function aimAt(c: DropAimCmd) {
  if (c.level <= 0) {
    aim.on = false
    glow.goal = pending.size || thumbs.size ? glow.goal : 0
    setPhase('aim-off')
    return wake()
  }
  if (!aim.on || glow.side !== c.side) glow.at = c.at
  aim.on = true
  aim.at = c.at
  glow.side = c.side
  // Brighter as it nears; full when letting go would send it.
  glow.goal = c.ready ? 1 : 0.25 + 0.5 * c.level
  if (!aim.el) {
    aim.el = document.createElement('div')
    aim.el.className = 'aim'
    aim.el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 18.5h3"/></svg><span></span>'
    aim.text = aim.el.querySelector('span')
    stage.appendChild(aim.el)
  }
  if (aim.text && c.label !== undefined) aim.text.textContent = c.label
  aim.el.classList.toggle('ready', !!c.ready)
  setPhase(c.ready ? 'aim-ready' : 'aim')
  wake()
}

/** The label sits just inside the light, beside the pointer. */
function placeAim() {
  const el = aim.el
  if (!el) return
  const show = aim.vis
  if (show <= 0.01) {
    if (el.style.opacity !== '0') el.style.opacity = '0'
    return
  }
  const { p, n } = edge(glow.side, glow.at)
  const along = glow.side === 'left' || glow.side === 'right' ? { x: p.x, y: clamp(glow.at, 0.06, 0.94) * H() } : { x: clamp(glow.at, 0.12, 0.88) * W(), y: p.y }
  const inset = n.x !== 0 ? 150 : 80
  el.style.opacity = show.toFixed(3)
  el.style.transform = `translate(${along.x + n.x * inset}px, ${along.y + n.y * inset}px) translate(-50%, -50%) scale(${(0.92 + 0.08 * show).toFixed(3)})`
}

// ---- The file ----

function makeThumb(id: string, info: { thumb?: string; name: string; ext: string; color: string }): Thumb {
  const el = document.createElement('div')
  el.className = 'thumb'
  el.dataset.id = id
  const bob = document.createElement('div')
  bob.className = 'bob'
  const card = document.createElement('div')
  card.className = 'card'
  if (info.thumb) {
    const img = document.createElement('img')
    img.src = info.thumb
    img.alt = ''
    card.appendChild(img)
    card.classList.add('photo')
  } else {
    const tile = document.createElement('div')
    tile.className = 'tile'
    tile.style.setProperty('--c', info.color)
    tile.textContent = (info.ext || 'file').toUpperCase().slice(0, 5)
    card.appendChild(tile)
  }
  const label = document.createElement('div')
  label.className = 'label'
  label.textContent = info.name
  const bar = document.createElement('div')
  bar.className = 'bar'
  bar.appendChild(document.createElement('i'))
  bob.append(card, label, bar)
  el.appendChild(bob)
  stage.appendChild(el)
  return { id, el, bar, at: { x: 0, y: 0 }, shown: performance.now(), leaving: false, out: Promise.resolve() }
}

const place = (v: V, s: number, extra = '') => `translate3d(${v.x}px, ${v.y}px, 0) translate(-50%, -50%) ${extra} scale(${s})`

function arrive(id: string) {
  const info = pending.get(id)
  if (!info || thumbs.has(id)) return
  glow.side = info.side
  glow.at = info.at
  glow.goal = 1
  glow.kick = Math.max(glow.kick, 0.3)
  const { p, n, span } = edge(info.side, info.at)
  const th = makeThumb(id, info)
  thumbs.set(id, th)
  const into = Math.min(span * 0.24, 360)
  const from = { x: p.x - n.x * 70, y: p.y - n.y * 70 }
  th.at = { x: p.x + n.x * into, y: p.y + n.y * into }
  // It turns toward you as it comes out of the edge.
  const turn = n.x !== 0 ? `rotateY(${n.x < 0 ? -42 : 42}deg)` : `rotateX(${n.y < 0 ? 42 : -42}deg)`
  const emerge = th.el.animate(
    [
      { transform: place(from, 0.5, turn), opacity: 0, filter: 'blur(6px) brightness(1.5)' },
      { opacity: 1, offset: 0.25 },
      { transform: place(th.at, 1, 'rotateY(0deg) rotateX(0deg) rotateZ(-2deg)'), opacity: 1, filter: 'blur(0) brightness(1)' },
    ],
    { duration: reduced ? 200 : 940, easing: 'cubic-bezier(.22,.8,.26,1)', fill: 'forwards' },
  )
  // Even a file that's already here shows itself in the light for a moment.
  th.out = emerge.finished.then(() => new Promise((r) => setTimeout(r, reduced ? 0 : 380)))
  setPhase('arrive')
  wake()
}

function progress(id: string, p: number) {
  const th = thumbs.get(id)
  if (!th) return
  if (p < 1 && performance.now() - th.shown > 450) th.bar.classList.add('on')
  ;(th.bar.firstChild as HTMLElement).style.width = `${Math.round(p * 100)}%`
}

/** Into the island, along a curve, getting smaller. */
async function fly(id: string, to: V, sweep: boolean) {
  const th = thumbs.get(id)
  if (!th || th.leaving) return
  th.leaving = true
  await th.out
  th.bar.classList.remove('on')
  if (sweep) {
    glow.sweep = 0
    glow.sweepIn = true
    glow.kick = 0.85
  }
  glow.goal = 0
  const from = th.at
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - Math.max(60, Math.abs(from.x - to.x) * 0.12) }
  const a = th.el.animate(
    [
      { transform: place(from, 1, 'rotateZ(-2deg)') },
      { transform: place(from, 1.07, 'rotateZ(0deg)'), offset: 0.12 },
      { transform: place(mid, 0.6, 'rotateZ(-6deg)'), offset: 0.55 },
      { transform: place(to, 0.12, 'rotateZ(0deg)'), opacity: 1, offset: 0.92 },
      { transform: place(to, 0.06, 'rotateZ(0deg)'), opacity: 0 },
    ],
    { duration: reduced ? 300 : 1100, easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' },
  )
  setPhase(sweep ? 'land' : 'stow')
  a.onfinish = () => {
    splash(to)
    th.el.remove()
    thumbs.delete(id)
    pending.delete(id)
    window.island.drop.landed(id)
  }
  wake()
}

/** A ring where the file went in. */
function splash(at: V) {
  const s = document.createElement('div')
  s.className = 'splash'
  s.style.left = `${at.x}px`
  s.style.top = `${at.y}px`
  stage.appendChild(s)
  s.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.9 },
      { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 },
    ],
    { duration: 640, easing: 'cubic-bezier(.2,.7,.3,1)' },
  ).onfinish = () => s.remove()
}

/** A file leaving for the phone: it swings toward the edge and the light takes it. */
function sendOut(c: DropSendCmd) {
  aim.on = false
  glow.side = c.side
  glow.at = c.at
  glow.goal = 1
  const { p, n } = edge(c.side, c.at)
  const th = makeThumb(c.id, c)
  thumbs.set(c.id, th)
  th.leaving = true
  const from = c.from
  // Through a point a little off the straight line, so it swings in.
  const mid = { x: (from.x + p.x) / 2 + n.y * 60, y: (from.y + p.y) / 2 - Math.abs(n.x) * 70 }
  const gone = { x: p.x - n.x * 60, y: p.y - n.y * 60 }
  const turn = n.x !== 0 ? `rotateY(${n.x < 0 ? 38 : -38}deg)` : `rotateX(${n.y < 0 ? -38 : 38}deg)`
  const a = th.el.animate(
    [
      { transform: place(from, 0.85), opacity: 0, filter: 'brightness(1)' },
      { transform: place(from, 1.06), opacity: 1, offset: 0.14 },
      { transform: place(mid, 0.82, 'rotateZ(4deg)'), offset: 0.5 },
      { transform: place(p, 0.34, turn), opacity: 1, filter: 'brightness(1.5) blur(1px)', offset: 0.86 },
      { transform: place(gone, 0.12, turn), opacity: 0, filter: 'brightness(1.8) blur(5px)' },
    ],
    { duration: reduced ? 320 : 1300, easing: 'cubic-bezier(.42,0,.28,1)', fill: 'forwards' },
  )
  setPhase('send')
  a.onfinish = () => {
    th.el.remove()
    thumbs.delete(c.id)
    glow.kick = 0.85
    glow.sweep = 0
    glow.sweepIn = false
    glow.goal = 0
  }
  wake()
}

function fail(id: string) {
  pending.delete(id)
  glow.tint = 1
  glow.goal = 0
  const th = thumbs.get(id)
  setPhase('fail')
  if (!th) return wake()
  th.leaving = true
  const a = th.el.animate(
    [
      { transform: place(th.at, 1) },
      { transform: place({ x: th.at.x - 10, y: th.at.y }, 1), offset: 0.12 },
      { transform: place({ x: th.at.x + 10, y: th.at.y }, 1), offset: 0.24 },
      { transform: place({ x: th.at.x - 6, y: th.at.y }, 1), offset: 0.36 },
      { transform: place(th.at, 1), offset: 0.48, opacity: 1 },
      { transform: place({ x: th.at.x, y: th.at.y + 50 }, 0.85), opacity: 0 },
    ],
    { duration: 900, easing: 'ease-in-out', fill: 'forwards' },
  )
  a.onfinish = () => {
    th.el.remove()
    thumbs.delete(id)
  }
  wake()
}

window.island.drop.onCmd((c: DropCmd) => {
  if (c.t === 'approach') {
    pending.set(c.id, { side: c.side, at: c.at, thumb: c.thumb, name: c.name, ext: c.ext, color: c.color })
    if (c.thumb) new Image().src = c.thumb // ready when it comes out
    glow.side = c.side
    glow.at = c.at
    glow.goal = Math.max(glow.goal, 0.55)
    setPhase('approach')
    wake()
  } else if (c.t === 'arrive') arrive(c.id)
  else if (c.t === 'progress') progress(c.id, c.p)
  else if (c.t === 'land') void fly(c.id, c.to, true)
  else if (c.t === 'stow') void fly(c.id, c.to, false)
  else if (c.t === 'cancel') {
    pending.delete(c.id)
    if (!pending.size && !thumbs.size) glow.goal = 0
    setPhase('cancel')
    wake()
  } else if (c.t === 'fail') fail(c.id)
  else if (c.t === 'send') sendOut(c)
  else if (c.t === 'aim') aimAt(c)
})
setPhase('idle')
window.island.drop.ready()
