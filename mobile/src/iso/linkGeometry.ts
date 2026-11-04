import {
  axisVector,
  circleRing,
  cylinder,
  depthOf,
  dotGrid,
  fitProjection,
  insetPlan,
  iso,
  onTop,
  pathOf,
  planOutline,
  radialTicks,
  sideRing,
  slabOf,
  topTicks,
  type Flat,
  type Plan,
  type Point3,
  type Projection,
  type SolidPaths,
} from './kit'

/**
 * "The link", as a bench instrument: your computer and your phone on one base
 * plate, joined by a glass tube that a capsule (your files) runs along. A lamp
 * on a mast says whether they can reach each other, and a dial gauge reads how
 * long a round trip takes. World units are about a pixel of the real thing:
 * x along the bench, y into it, z up. Everything here is built once.
 */

/** The drawing's box (the SVG viewBox). */
export const VIEW = { width: 360, height: 228 }

const BASE: Plan = { x: 0, y: 0, w: 288, d: 136, r: 12 }
const BASE_Z = 10

// The computer: a laptop on the left, its lid up at the back.
const LAPTOP: Plan = { x: 22, y: 30, w: 106, d: 72, r: 6 }
const LAPTOP_TOP = BASE_Z + 6
const LID: Plan = { x: 24, y: 24, w: 102, d: 6, r: 2 }
const LID_TOP = LAPTOP_TOP + 66
/** The lid's front face (the screen is drawn on it). */
const LID_FACE = LID.y + LID.d

// The phone, standing in a dock on the right.
const DOCK: Plan = { x: 200, y: 44, w: 62, d: 50, r: 8 }
const DOCK_TOP = BASE_Z + 10
const PHONE: Plan = { x: 213, y: 56, w: 36, d: 6, r: 3.5 }
const PHONE_TOP = DOCK_TOP + 70
const PHONE_FACE = PHONE.y + PHONE.d

// The tube between them, on two posts, with a coupling at each end.
export const TUBE = { from: 140, to: 192, y: 70, z: BASE_Z + 12, r: 6.5 }
const PORT: Plan = { x: 128, y: 60, w: 12, d: 20, r: 3 }
/** The coupling on the dock's side that the tube goes into. */
const DOCK_PORT: Plan = { x: 192, y: 60, w: 14, d: 20, r: 3 }

// The lamp on its mast, and the dial gauge in front.
const MAST = { x: 166, y: 26 }
const MAST_TOP = BASE_Z + 70
export const GAUGE = { x: 160, y: 112, r: 17, z: BASE_Z + 8 }
/** The gauge's needle: 0 ms at `from`, `max` ms a full sweep later (radians, in the dial's plane). */
export const GAUGE_SCALE = { from: Math.PI * 0.75, sweep: Math.PI * 1.5, max: 300 }

/** The camera, fitted to the bench and everything on it. */
export const P: Projection = fitProjection(
  [
    [BASE.x, BASE.y, -8],
    [BASE.x + BASE.w, BASE.y, -8],
    [BASE.x, BASE.y + BASE.d, -8],
    [BASE.x + BASE.w, BASE.y + BASE.d, -8],
    [LID.x, LID.y, LID_TOP],
    [PHONE.x + PHONE.w, PHONE.y, PHONE_TOP],
    [MAST.x, MAST.y, MAST_TOP + 14],
  ],
  VIEW.width,
  VIEW.height,
  { pad: 10 },
)

/** A solid as the renderer draws it: its paths and how it's lit. */
export type Solid = { kind: 'solid'; paths: SolidPaths; lit?: boolean; tone?: 'hi' | 'mid' | 'lo'; halo?: boolean }
export type Line = { kind: 'line'; d: string; tone: 'hi' | 'mid' | 'lo' | 'faint' | 'lit'; width?: number; dashed?: boolean }
export type Fill = { kind: 'fill'; d: string; tone: 'paper' | 'face' | 'top' | 'shade0' | 'shade1' | 'shade2' | 'shade3' | 'glass' | 'ink'; opacity?: number }
export type Dots = { kind: 'dots'; points: Flat[]; r: number; tone: 'hi' | 'mid' | 'lo' }
export type Part = Solid | Line | Fill | Dots

const solid = (paths: SolidPaths, o: Omit<Solid, 'kind' | 'paths'> = {}): Solid => ({ kind: 'solid', paths, ...o })
const line = (d: string, tone: Line['tone'], o: Omit<Line, 'kind' | 'd' | 'tone'> = {}): Line => ({ kind: 'line', d, tone, ...o })
const fill = (d: string, tone: Fill['tone'], opacity?: number): Fill => ({ kind: 'fill', d, tone, opacity })

/** A flat four-cornered shape on a face of the bench (corners in world space). */
const quad = (points: Point3[]) => pathOf(points.map((p) => iso(p, P)), true)

/** A rounded rectangle standing on the plane y = `y` (a screen on a lid). */
function onFace(y: number, x0: number, x1: number, z0: number, z1: number, r: number, steps = 6): string {
  const pts: Point3[] = []
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (Math.PI / 2) * (i / steps)
      pts.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)])
    }
  }
  corner(x1 - r, z1 - r, 0)
  corner(x0 + r, z1 - r, Math.PI / 2)
  corner(x0 + r, z0 + r, Math.PI)
  corner(x1 - r, z0 + r, Math.PI * 1.5)
  return quad(pts)
}

/** The outline of a cylinder lying along x (the tube, the capsule): its silhouette and end rings. */
function lyingCylinder(x0: number, x1: number, y: number, z: number, r: number, steps = 28) {
  const ring = (x: number) => Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return iso([x, y + r * Math.cos(a), z + r * Math.sin(a)], P)
  })
  const pts = [...ring(x0), ...ring(x1)]
  // Its outline: the hull of both end rings.
  const hull = convexHull(pts)
  // The top highlight and the bottom edge, along its length.
  const along = (a: number) => pathOf([iso([x0, y + r * Math.cos(a), z + r * Math.sin(a)], P), iso([x1, y + r * Math.cos(a), z + r * Math.sin(a)], P)])
  return {
    body: pathOf(hull, true),
    shine: along(Math.PI * 0.42),
    under: along(-Math.PI * 0.35),
    nearEnd: sideRing([x1, y, z], r, 'x', P, steps),
    farEnd: sideRing([x0, y, z], r, 'x', P, steps),
  }
}

function convexHull(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Flat[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Flat[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Screws and rivets: small dots on a top face. */
const screws = (at: [number, number][], z: number): Dots => ({ kind: 'dots', points: at.map(([x, y]) => iso([x, y, z], P)), r: 1.15, tone: 'mid' })

// ---- The layers, back to front ----

/** Behind the capsule: the base, the computer, the mast and the back of the tube. */
export function backParts(): Part[] {
  const parts: Part[] = []
  // Feet under the corners, then the plate on them.
  for (const [x, y] of [
    [16, 16],
    [272, 16],
    [16, 120],
    [272, 120],
  ])
    parts.push(solid(cylinder(x, y, 8, -7, 7, P, 24), { tone: 'mid' }))
  parts.push(solid(slabOf(BASE, 0, BASE_Z, P, 10, 1.6), { halo: true }))
  // A groove around the top, screws in the corners, a ruler along the front.
  parts.push(line(planOutline(insetPlan(BASE, 7), BASE_Z, P, 10), 'faint'))
  parts.push(screws([[13, 13], [275, 13], [13, 123], [275, 123]], BASE_Z))
  const ruler: Plan = { x: 34, y: 120, w: 140, d: 9, r: 1.5 }
  parts.push(solid(slabOf(ruler, BASE_Z, 1.2, P, 4), { tone: 'mid' }))
  const ticks = topTicks(38, 170, 4, 5, ruler.y + 0.5, BASE_Z + 1.2, [2.6, 5], P)
  parts.push(line(ticks.minor, 'lo'), line(ticks.major, 'mid'))
  // The label plate at the front left, with its two rivets.
  const label: Plan = { x: 186, y: 112, w: 34, d: 14, r: 2 }
  parts.push(solid(slabOf(label, BASE_Z, 1.4, P, 4), { tone: 'mid' }))
  parts.push(screws([[189.5, 119], [216.5, 119]], BASE_Z + 1.4))
  parts.push(line(onTop([[194, 117], [212, 117]], BASE_Z + 1.4, P), 'lo'), line(onTop([[194, 121], [208, 121]], BASE_Z + 1.4, P), 'faint'))

  // The laptop: its base, the hinge, the lid with its screen, the keys and the trackpad.
  parts.push(solid(slabOf(LAPTOP, BASE_Z, LAPTOP_TOP - BASE_Z, P, 8, 1.2), { halo: true }))
  parts.push(solid(slabOf({ x: LID.x + 6, y: LID.y + 4, w: LID.w - 12, d: 5, r: 2.5 }, LAPTOP_TOP, 2.4, P, 6), { tone: 'mid' }))
  parts.push(solid(slabOf(LID, LAPTOP_TOP, LID_TOP - LAPTOP_TOP, P, 6, 0.8)))
  parts.push(fill(onFace(LID_FACE + 0.15, LID.x + 6, LID.x + LID.w - 6, LAPTOP_TOP + 7, LID_TOP - 6, 3), 'ink'))
  parts.push(line(onFace(LID_FACE + 0.2, LID.x + 6, LID.x + LID.w - 6, LAPTOP_TOP + 7, LID_TOP - 6, 3), 'lo'))
  // The island on the computer's screen: a little pill at the top.
  parts.push(fill(onFace(LID_FACE + 0.3, LID.x + LID.w / 2 - 13, LID.x + LID.w / 2 + 13, LID_TOP - 15, LID_TOP - 10, 2.5), 'shade0'))
  parts.push(line(onFace(LID_FACE + 0.3, LID.x + LID.w / 2 - 13, LID.x + LID.w / 2 + 13, LID_TOP - 15, LID_TOP - 10, 2.5), 'mid'))
  // Keys: four rows of caps, a space bar, and the trackpad below them.
  const keys: string[] = []
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 12; col++) keys.push(planOutline({ x: LAPTOP.x + 8 + col * 7.6, y: LAPTOP.y + 9 + row * 7.4, w: 5.8, d: 5.6, r: 1 }, LAPTOP_TOP, P, 2))
  keys.push(planOutline({ x: LAPTOP.x + 31, y: LAPTOP.y + 39, w: 44, d: 5.6, r: 1 }, LAPTOP_TOP, P, 2))
  parts.push(line(keys.join(''), 'lo'))
  parts.push(line(planOutline({ x: LAPTOP.x + 34, y: LAPTOP.y + 50, w: 38, d: 17, r: 2.5 }, LAPTOP_TOP, P, 4), 'mid'))

  // The mast at the back, a collar at its foot, the lamp housing and its cap.
  parts.push(solid(cylinder(MAST.x, MAST.y, 7, BASE_Z, 4, P, 24), { tone: 'mid' }))
  parts.push(solid(cylinder(MAST.x, MAST.y, 2.6, BASE_Z + 4, MAST_TOP - BASE_Z - 4, P, 16)))
  parts.push(solid(cylinder(MAST.x, MAST.y, 6.4, MAST_TOP, 11, P, 28)))
  parts.push(solid(cylinder(MAST.x, MAST.y, 7.2, MAST_TOP + 11, 2, P, 28), { tone: 'mid' }))
  parts.push(line(sideRingTop(MAST.x, MAST.y, 6.4, MAST_TOP + 3.5), 'faint'), line(sideRingTop(MAST.x, MAST.y, 6.4, MAST_TOP + 7.5), 'faint'))

  // The coupling beside the laptop that the tube comes out of.
  parts.push(solid(slabOf(PORT, BASE_Z, TUBE.z - BASE_Z + 9, P, 4, 0.8)))
  parts.push(screws([[PORT.x + 6, PORT.y + 4], [PORT.x + 6, PORT.y + PORT.d - 4]], TUBE.z + 9))

  // Two posts with saddles under the tube.
  for (const x of [152, 170]) {
    parts.push(solid(cylinder(x, TUBE.y, 5, BASE_Z, 2, P, 20), { tone: 'mid' }))
    parts.push(solid(cylinder(x, TUBE.y, 2.4, BASE_Z + 2, TUBE.z - TUBE.r - BASE_Z - 2, P, 14)))
  }
  // The tube's glass, behind the capsule.
  const tube = lyingCylinder(TUBE.from, TUBE.to, TUBE.y, TUBE.z, TUBE.r)
  parts.push(fill(tube.body, 'glass', 0.55))
  parts.push(line(tube.farEnd, 'mid'))
  return parts
}

/** The front of a horizontal ring on a cylinder's side (a band round the lamp). */
function sideRingTop(cx: number, cy: number, r: number, z: number): string {
  const ring = circleRing(cx, cy, r, 32)
  const front = ring.filter(([x, y]) => depthOf([x - cx, y - cy, 0], P) > 0)
  return onTop(front, z, P)
}

const CAPSULE = { length: 14, end: TUBE.to - 2 }

/** The capsule (your files), at the phone's end of the tube; it's moved along it. */
export function capsuleParts(): { body: Part[]; band: string } {
  const x1 = CAPSULE.end
  const x0 = x1 - CAPSULE.length
  const c = lyingCylinder(x0, x1, TUBE.y, TUBE.z, TUBE.r - 1.6, 24)
  const band = lyingCylinder(x0 + 5, x0 + 9, TUBE.y, TUBE.z, TUBE.r - 1.5, 24)
  return { body: [fill(c.body, 'face'), line(c.under, 'mid'), line(c.shine, 'lit', { width: 0.8 }), line(c.nearEnd, 'hi'), line(c.body, 'hi', { width: 0.8 })], band: band.body }
}

/** How far the capsule travels (screen px for its whole run, phone end to computer end). */
export const CAPSULE_RUN: Flat = axisVector(P, [-(CAPSULE.end - CAPSULE.length - TUBE.from - 2), 0, 0])

/** In front of the capsule: the tube's front glass and clamps, the gauge, the dock and the phone. */
export function frontParts(): Part[] {
  const parts: Part[] = []
  const tube = lyingCylinder(TUBE.from, TUBE.to, TUBE.y, TUBE.z, TUBE.r)
  parts.push(line(tube.shine, 'lit', { width: 0.9 }))
  parts.push(line(tube.under, 'mid'))
  parts.push(line(tube.body, 'hi'))
  // Clamps round the tube over each post, a screw on each.
  for (const x of [152, 170]) {
    parts.push(line(sideRing([x - 1.2, TUBE.y, TUBE.z], TUBE.r + 0.9, 'x', P, 32), 'mid', { width: 0.8 }))
    parts.push(line(sideRing([x + 1.2, TUBE.y, TUBE.z], TUBE.r + 0.9, 'x', P, 32), 'hi', { width: 0.9 }))
    parts.push({ kind: 'dots', points: [iso([x, TUBE.y, TUBE.z + TUBE.r + 1], P)], r: 0.9, tone: 'hi' })
  }
  // The tube goes into a coupling on the dock's side.
  parts.push(solid(slabOf(DOCK_PORT, BASE_Z, TUBE.z - BASE_Z + 9, P, 4, 0.8)))
  parts.push(screws([[DOCK_PORT.x + 7, DOCK_PORT.y + 4], [DOCK_PORT.x + 7, DOCK_PORT.y + DOCK_PORT.d - 4]], TUBE.z + 9))
  // The gauge: a short drum, its bezel and dial, the ticks.
  parts.push(solid(cylinder(GAUGE.x, GAUGE.y, GAUGE.r + 2, BASE_Z, GAUGE.z - BASE_Z, P, 40, 0.8), { halo: true }))
  parts.push(line(planOutline({ x: GAUGE.x - GAUGE.r, y: GAUGE.y - GAUGE.r, w: GAUGE.r * 2, d: GAUGE.r * 2, r: GAUGE.r }, GAUGE.z, P, 12), 'mid'))
  const ticks = radialTicks(GAUGE.x, GAUGE.y, GAUGE.r - 1.5, 30, 5, GAUGE.z, [1.8, 3.6], P, GAUGE_SCALE.from, GAUGE_SCALE.sweep)
  parts.push(line(ticks.minor, 'lo'), line(ticks.major, 'hi'))
  // The dock, its lip in front of the phone, and the phone standing in it.
  parts.push(solid(slabOf(DOCK, BASE_Z, DOCK_TOP - BASE_Z, P, 8, 1.2), { halo: true }))
  parts.push(solid(slabOf(PHONE, DOCK_TOP, PHONE_TOP - DOCK_TOP, P, 6, 0.8)))
  parts.push(fill(onFace(PHONE_FACE + 0.15, PHONE.x + 3, PHONE.x + PHONE.w - 3, DOCK_TOP + 6, PHONE_TOP - 3.5, 3.5), 'ink'))
  parts.push(line(onFace(PHONE_FACE + 0.2, PHONE.x + 3, PHONE.x + PHONE.w - 3, DOCK_TOP + 6, PHONE_TOP - 3.5, 3.5), 'lo'))
  parts.push(fill(onFace(PHONE_FACE + 0.3, PHONE.x + PHONE.w / 2 - 5, PHONE.x + PHONE.w / 2 + 5, PHONE_TOP - 9, PHONE_TOP - 6.5, 1.2), 'shade0'))
  parts.push(solid(slabOf({ x: PHONE.x - 4, y: PHONE_FACE + 1, w: PHONE.w + 8, d: 7, r: 2.5 }, DOCK_TOP, 5, P, 4, 0.6), { tone: 'mid' }))
  parts.push(line(planOutline({ x: DOCK.x + 6, y: DOCK.y + DOCK.d - 14, w: 14, d: 7, r: 3.5 }, DOCK_TOP, P, 6), 'lo'))
  return parts
}

/** The computer's screen and the phone's, lit (laid over when files arrive on one). */
export const LAPTOP_GLASS = onFace(LID_FACE + 0.4, LID.x + 6, LID.x + LID.w - 6, LAPTOP_TOP + 7, LID_TOP - 6, 3)
export const PHONE_GLASS = onFace(PHONE_FACE + 0.4, PHONE.x + 3, PHONE.x + PHONE.w - 3, DOCK_TOP + 6, PHONE_TOP - 3.5, 3.5)

/** The lamp's lit housing and where its glow sits. */
export const LAMP = {
  body: cylinder(MAST.x, MAST.y, 6.4, MAST_TOP, 11, P, 28),
  center: iso([MAST.x, MAST.y, MAST_TOP + 5.5], P),
  glowR: 26,
}

/** The gauge's pivot and the plane the needle turns in (for drawing it at any angle). */
export const NEEDLE = {
  pivot: iso([GAUGE.x, GAUGE.y, GAUGE.z + 0.2], P),
  /** Screen vectors of one world unit along x and y on the dial. */
  ux: axisVector(P, [1, 0, 0]),
  uy: axisVector(P, [0, 1, 0]),
  length: GAUGE.r - 3,
  tail: 4,
}

/** The needle's angle (radians in the dial's plane) for a round trip of `ms`. Pure. */
export function needleAngle(ms: number): number {
  const k = Math.max(0, Math.min(1, ms / GAUGE_SCALE.max))
  return GAUGE_SCALE.from + GAUGE_SCALE.sweep * k
}

/** The needle as a path, at an angle (a worklet, so it can be drawn on the UI thread). */
export function needlePath(angle: number, pivot: Flat, ux: Flat, uy: Flat, length: number, tail: number): string {
  'worklet'
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const tip = [pivot[0] + (ux[0] * c + uy[0] * s) * length, pivot[1] + (ux[1] * c + uy[1] * s) * length]
  const back = [pivot[0] - (ux[0] * c + uy[0] * s) * tail, pivot[1] - (ux[1] * c + uy[1] * s) * tail]
  return `M${back[0].toFixed(2)} ${back[1].toFixed(2)}L${tip[0].toFixed(2)} ${tip[1].toFixed(2)}`
}

export { dotGrid }
