/**
 * Talking over the buddy: while it speaks, the microphone listens (with the
 * browser's echo cancellation taking out its own voice) and, when you start
 * talking, it stops to listen to you.
 */
const RATE = 16000
const BLOCK = 1024
/** Its own first words can leak through before echo cancellation settles. */
const SETTLE_MS = 500
/** This much speech within the last window, and it's you. */
const NEED_MS = 280
const WINDOW_MS = 600

export type BargeState = { floor: number; elapsedMs: number; loud: number[] }

/** One block of sound: is it you talking now? Pure. */
export function bargeStep(s: BargeState, rms: number, blockMs: number): BargeState & { you: boolean } {
  const elapsedMs = s.elapsedMs + blockMs
  const quiet = s.loud.length === 0 || elapsedMs - s.loud[s.loud.length - 1] > 200
  // The room's level (and what's left of its voice), followed while it's quiet.
  const floor = quiet ? Math.min(Math.max(s.floor * 0.9 + rms * 0.1, 0.003), 0.08) : s.floor
  const isLoud = elapsedMs > SETTLE_MS && rms > Math.max(0.02, floor * 3.5)
  const loud = [...s.loud.filter((t) => elapsedMs - t < WINDOW_MS), ...(isLoud ? [elapsedMs] : [])]
  return { floor, elapsedMs, loud, you: loud.length * blockMs >= NEED_MS }
}

export class BargeIn {
  private ctx?: AudioContext
  private stream?: MediaStream
  private node?: ScriptProcessorNode
  private done = false
  private s: BargeState = { floor: 0.01, elapsedMs: 0, loud: [] }

  constructor(private onYou: () => void) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } })
    if (this.done) return this.stop()
    this.ctx = new AudioContext({ sampleRate: RATE })
    const src = this.ctx.createMediaStreamSource(this.stream)
    this.node = this.ctx.createScriptProcessor(BLOCK, 1, 1)
    const blockMs = (BLOCK / RATE) * 1000
    this.node.onaudioprocess = (e) => {
      if (this.done) return
      const d = e.inputBuffer.getChannelData(0)
      let sum = 0
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i]
      const next = bargeStep(this.s, Math.sqrt(sum / d.length), blockMs)
      this.s = next
      if (next.you) {
        this.stop()
        this.onYou()
      }
    }
    src.connect(this.node)
    this.node.connect(this.ctx.destination)
  }

  stop(): void {
    this.done = true
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => {})
  }
}
