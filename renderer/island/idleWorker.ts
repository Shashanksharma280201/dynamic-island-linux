/**
 * A worker that holds a model (speech, the voice, search by meaning): made
 * when first asked, and let go once it has had nothing to do for a while, so
 * the model's memory (tens to hundreds of MB) isn't kept for a feature you
 * used once. Asked again, it's made again (the model loads in a second or two).
 */
export const MODEL_IDLE_MS = 3 * 60_000

export class IdleWorker {
  private worker: Worker | null = null
  private busy = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly make: () => Worker,
    private readonly onMessage: (e: MessageEvent) => void,
    /** It crashed: whatever it was doing has failed. */
    private readonly onError: (message: string) => void,
    /** It was let go (after idling, or a crash): forget what it had loaded. */
    private readonly onGone: () => void = () => {},
    private readonly idleMs = MODEL_IDLE_MS,
  ) {}

  /** Whether a worker is alive right now. */
  alive(): boolean {
    return !!this.worker
  }

  private get(): Worker {
    if (this.worker) return this.worker
    const w = this.make()
    w.onmessage = (e) => this.onMessage(e)
    w.onerror = (e) => {
      this.drop()
      this.onError(e.message || 'crashed')
    }
    this.worker = w
    return w
  }

  /** Send it a job that answers (call `done` when it has). */
  ask(msg: unknown, transfer: Transferable[] = []): void {
    this.cancelIdle()
    this.busy++
    this.get().postMessage(msg, transfer)
  }

  /** Send it something that doesn't answer (e.g. load the model ahead of time); it may go if nothing follows. */
  tell(msg: unknown): void {
    this.get().postMessage(msg)
    if (!this.busy) this.idleSoon()
  }

  /** A job it was asked for has answered. */
  done(): void {
    this.busy = Math.max(0, this.busy - 1)
    if (!this.busy) this.idleSoon()
  }

  private idleSoon(): void {
    this.cancelIdle()
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.busy) this.drop()
    }, this.idleMs)
  }

  private cancelIdle(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private drop(): void {
    this.cancelIdle()
    this.busy = 0
    this.worker?.terminate()
    this.worker = null
    this.onGone()
  }
}
