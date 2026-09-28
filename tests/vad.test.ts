import { vadStep } from '../renderer/island/voice/recorder'

const run = (levels: number[], block = 128) => {
  let s = { floor: 0.01, speech: false, quietMs: 0, elapsedMs: 0 } as any
  for (const l of levels) {
    s = vadStep(s, l, block)
    if (s.stop) return s
  }
  return s
}

test('stops after you finish speaking', () => {
  const quiet = Array(5).fill(0.003)
  const talk = Array(15).fill(0.08)
  const pause = Array(12).fill(0.003)
  const r = run([...quiet, ...talk, ...pause])
  expect(r.speech).toBe(true)
  expect(r.stop).toBe('silence')
  // A short pause mid-sentence doesn't end it
  const mid = run([...quiet, ...talk, ...Array(6).fill(0.003), ...talk])
  expect(mid.stop).toBeUndefined()
})

test('gives up when nothing is said, and caps long recordings', () => {
  expect(run(Array(80).fill(0.004)).stop).toBe('nothing')
  expect(run(Array(400).fill(0.08)).stop).toBe('limit')
})

test('a noisy room raises the bar', () => {
  // Steady fan noise at 0.02 never counts as speech once the floor adapts
  const fan = run(Array(40).fill(0.02))
  expect(fan.floor).toBeGreaterThan(0.01)
})
