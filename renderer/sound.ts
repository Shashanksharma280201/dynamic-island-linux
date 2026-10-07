// The island's own little sounds: short synth tones made with Web Audio (no
// sound files). Off unless turned on in Settings → Appearance. Quiet (15%),
// and each kind plays at most once every 400 ms, so a burst of events chimes once.

export type SoundKind = 'peek' | 'open' | 'close' | 'ask' | 'ok' | 'done' | 'error' | 'gulp' | 'boop' | 'dizzy'

/** Notes of each sound: [frequency Hz, start s, length s, wave]. */
export const TONES: Record<SoundKind, [number, number, number, OscillatorType][]> = {
  peek: [[1320, 0, 0.03, 'sine']],
  open: [
    [520, 0, 0.09, 'sine'],
    [780, 0.04, 0.09, 'sine'],
  ],
  close: [
    [780, 0, 0.09, 'sine'],
    [520, 0.04, 0.09, 'sine'],
  ],
  ask: [
    [880, 0, 0.12, 'triangle'],
    [1175, 0.11, 0.16, 'triangle'],
  ],
  ok: [[1568, 0, 0.12, 'triangle']],
  done: [
    [784, 0, 0.16, 'sine'],
    [1047, 0.09, 0.16, 'sine'],
    [1319, 0.18, 0.22, 'sine'],
  ],
  error: [
    [196, 0, 0.1, 'triangle'],
    [165, 0.12, 0.14, 'triangle'],
  ],
  gulp: [[260, 0, 0.12, 'sine']],
  boop: [[990, 0, 0.06, 'sine']],
  dizzy: [
    [640, 0, 0.12, 'sine'],
    [520, 0.1, 0.12, 'sine'],
    [400, 0.2, 0.16, 'sine'],
  ],
}

export const SOUND_GAP_MS = 400
const VOLUME = 0.15

let enabled = false
let ctx: AudioContext | null = null
const last = new Map<SoundKind, number>()

/** Turn the sounds on or off (Settings → Appearance → Sounds). */
export function setSoundsOn(on: boolean): void {
  enabled = on
}

/** Whether a sound may play now, given when that kind last played. Pure. */
export function mayPlay(now: number, lastAt: number | undefined): boolean {
  return lastAt === undefined || now - lastAt >= SOUND_GAP_MS
}

/** Play one of the island's sounds, if they're on. */
export function sound(kind: SoundKind): void {
  if (!enabled || typeof AudioContext === 'undefined') return
  const now = performance.now()
  if (!mayPlay(now, last.get(kind))) return
  last.set(kind, now)
  try {
    ctx ??= new AudioContext()
    const t0 = ctx.currentTime + 0.01
    for (const [freq, at, len, wave] of TONES[kind]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = wave
      osc.frequency.setValueAtTime(freq, t0 + at)
      // A soft attack and a quick exponential tail: no clicks.
      gain.gain.setValueAtTime(0.0001, t0 + at)
      gain.gain.exponentialRampToValueAtTime(VOLUME, t0 + at + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + at)
      osc.stop(t0 + at + len + 0.02)
    }
  } catch {
    // No audio device: stay quiet.
  }
}
