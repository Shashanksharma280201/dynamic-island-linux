import { calmFrom } from '../electron/calm'
import { nextCheckMs } from '../electron/interactivity'

vi.mock('electron', () => ({ powerMonitor: { on: () => {}, off: () => {}, getSystemIdleState: () => 'active' } }))
vi.mock('../electron/cursor', () => ({ readCursor: async () => null }))

describe('resting while you are away', () => {
  test('away or locked rests; active or unknown does not', () => {
    expect(calmFrom('idle')).toBe(true)
    expect(calmFrom('locked')).toBe(true)
    expect(calmFrom('active')).toBe(false)
    expect(calmFrom('unknown')).toBe(false)
  })
})

describe('watching the pointer for the island', () => {
  const island = { x: 1000, y: 0, width: 200, height: 60 }
  test('often near the island, less often far from it', () => {
    expect(nextCheckMs({ x: 1100, y: 30 }, island)).toBe(40)
    expect(nextCheckMs({ x: 900, y: 100 }, island)).toBe(40)
    expect(nextCheckMs({ x: 100, y: 900 }, island)).toBe(100)
    expect(nextCheckMs(null, island)).toBe(100)
    expect(nextCheckMs({ x: 1100, y: 30 }, null)).toBe(100)
  })
})

describe('helper windows close when unused', async () => {
  const { EventEmitter } = await import('node:events')
  const { closeWhenIdle } = await import('../electron/idleClose')
  const fake = (visible: boolean) => {
    const w = Object.assign(new EventEmitter(), { visible, destroyed: false, isVisible: () => w.visible, isDestroyed: () => w.destroyed, destroy: () => ((w.destroyed = true), w.emit('closed')) })
    return w
  }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('one made ahead of time and never shown closes after a while', () => {
    const w = fake(false)
    closeWhenIdle(w as never, 1000)
    vi.advanceTimersByTime(999)
    expect(w.destroyed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(w.destroyed).toBe(true)
  })

  test('showing it again keeps it; hiding it starts the wait over', () => {
    const w = fake(true)
    closeWhenIdle(w as never, 1000)
    vi.advanceTimersByTime(5000)
    expect(w.destroyed).toBe(false)
    w.visible = false
    w.emit('hide')
    vi.advanceTimersByTime(600)
    w.visible = true
    w.emit('show')
    vi.advanceTimersByTime(5000)
    expect(w.destroyed).toBe(false)
    w.visible = false
    w.emit('hide')
    vi.advanceTimersByTime(1000)
    expect(w.destroyed).toBe(true)
  })
})
