/**
 * Microphone capture at 16 kHz mono (what Whisper expects), with a live level
 * for the UI and automatic stop once you've finished speaking.
 */
export type RecorderEvents = {
  level: (rms: number) => void
  /** Called once: the recorded audio, or null if nothing was said. */
  done: (audio: Float32Array | null, reason: 'silence' | 'stopped' | 'limit' | 'nothing') => void
}

export const SAMPLE_RATE = 16000
const MAX_SECONDS = 45
const SILENCE_MS = 1400
const NOTHING_MS = 8000

/** Decide what to do with the next block, given what we've seen. Pure. */
export function vadStep(
  s: { floor: number; speech: boolean; quietMs: number; elapsedMs: number },
  rms: number,
  blockMs: number,
): { floor: number; speech: boolean; quietMs: number; elapsedMs: number; stop?: 'silence' | 'limit' | 'nothing' } {
  const elapsedMs = s.elapsedMs + blockMs
  // Track the room's noise floor while nobody is talking.
  const floor = s.speech ? s.floor : Math.min(Math.max(s.floor * 0.95 + rms * 0.05, 0.002), 0.05)
  const loud = rms > Math.max(0.012, floor * 3)
  const speech = s.speech || (loud && elapsedMs > 150)
  const quietMs = loud ? 0 : s.quietMs + blockMs
  const next = { floor, speech, quietMs, elapsedMs }
  if (elapsedMs >= MAX_SECONDS * 1000) return { ...next, stop: 'limit' }
  if (speech && quietMs >= SILENCE_MS) return { ...next, stop: 'silence' }
  if (!speech && elapsedMs >= NOTHING_MS) return { ...next, stop: 'nothing' }
  return next
}

export class Recorder {
  private ctx?: AudioContext
  private stream?: MediaStream
  private node?: ScriptProcessorNode
  private chunks: Float32Array[] = []
  private finished = false
  private vad = { floor: 0.01, speech: false, quietMs: 0, elapsedMs: 0 }

  constructor(private ev: RecorderEvents) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    const src = this.ctx.createMediaStreamSource(this.stream)
    // ScriptProcessor keeps this dependency-free; the work per block is tiny.
    this.node = this.ctx.createScriptProcessor(2048, 1, 1)
    const blockMs = (2048 / SAMPLE_RATE) * 1000
    this.node.onaudioprocess = (e) => {
      if (this.finished) return
      const data = new Float32Array(e.inputBuffer.getChannelData(0))
      this.chunks.push(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length)
      this.ev.level(rms)
      const v = vadStep(this.vad, rms, blockMs)
      this.vad = { floor: v.floor, speech: v.speech, quietMs: v.quietMs, elapsedMs: v.elapsedMs }
      if (v.stop) this.finish(v.stop)
    }
    src.connect(this.node)
    this.node.connect(this.ctx.destination)
  }

  /** Stop now and use what was said so far. */
  stop(): void {
    this.finish('stopped')
  }

  /** Throw the recording away. */
  cancel(): void {
    this.finished = true
    this.teardown()
  }

  private finish(reason: 'silence' | 'stopped' | 'limit' | 'nothing'): void {
    if (this.finished) return
    this.finished = true
    this.teardown()
    const len = this.chunks.reduce((n, c) => n + c.length, 0)
    if (reason === 'nothing' || len < SAMPLE_RATE * 0.3) return this.ev.done(null, 'nothing')
    const audio = new Float32Array(len)
    let o = 0
    for (const c of this.chunks) {
      audio.set(c, o)
      o += c.length
    }
    this.ev.done(audio, reason)
  }

  private teardown(): void {
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => {})
  }
}
