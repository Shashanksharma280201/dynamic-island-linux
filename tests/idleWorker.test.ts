import { IdleWorker, MODEL_IDLE_MS } from '../renderer/island/idleWorker'

class FakeWorker {
  static made = 0
  posted: unknown[] = []
  terminated = false
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  constructor() {
    FakeWorker.made++
  }
  postMessage(m: unknown) {
    this.posted.push(m)
  }
  terminate() {
    this.terminated = true
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.made = 0
})
afterEach(() => vi.useRealTimers())

test('a model’s worker is made when asked and let go after a few idle minutes, never mid-job', () => {
  let last: FakeWorker | null = null
  let gone = 0
  const w = new IdleWorker(() => (last = new FakeWorker()) as unknown as Worker, () => {}, () => {}, () => gone++)
  expect(w.alive()).toBe(false)
  w.ask({ id: 1 })
  expect(w.alive()).toBe(true)
  // Still working on it: kept however long that takes.
  vi.advanceTimersByTime(MODEL_IDLE_MS * 2)
  expect(w.alive()).toBe(true)
  w.done()
  vi.advanceTimersByTime(MODEL_IDLE_MS - 1000)
  expect(w.alive()).toBe(true)
  // Asked again before then: the clock starts over.
  w.ask({ id: 2 })
  w.done()
  vi.advanceTimersByTime(MODEL_IDLE_MS - 1000)
  expect(w.alive()).toBe(true)
  vi.advanceTimersByTime(2000)
  expect(w.alive()).toBe(false)
  expect(last!.terminated).toBe(true)
  expect(gone).toBe(1)
  // Asked once more: made again.
  w.ask({ id: 3 })
  expect(FakeWorker.made).toBe(2)
})

test('loaded ahead of time but never used: let go too; a crash fails what it was doing', () => {
  let last: FakeWorker | null = null
  const errors: string[] = []
  const w = new IdleWorker(() => (last = new FakeWorker()) as unknown as Worker, () => {}, (m) => errors.push(m))
  w.tell({ type: 'load' })
  vi.advanceTimersByTime(MODEL_IDLE_MS + 1)
  expect(w.alive()).toBe(false)
  w.ask({ id: 1 })
  last!.onerror!({ message: 'out of memory' } as ErrorEvent)
  expect(errors).toEqual(['out of memory'])
  expect(w.alive()).toBe(false)
})
