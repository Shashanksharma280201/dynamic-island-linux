import { prepareAudio } from '../renderer/island/voice/prep'

const tone = (sec: number, amp: number) => Float32Array.from({ length: Math.round(16000 * sec) }, (_, i) => amp * Math.sin(i / 5))
const cat = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) (out.set(p, o), (o += p.length))
  return out
}

test('trims the silence around speech and normalizes the level', () => {
  const audio = cat(tone(1, 0.001), tone(1.5, 0.1), tone(2, 0.001))
  const out = prepareAudio(audio)
  // 1.5 s of speech plus a quarter second either side
  expect(out.length / 16000).toBeGreaterThan(1.9)
  expect(out.length / 16000).toBeLessThan(2.1)
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  expect(peak).toBeCloseTo(0.9, 1)
})

test('silence alone comes back empty', () => {
  expect(prepareAudio(tone(2, 0.001)).length).toBe(0)
  expect(prepareAudio(new Float32Array(0)).length).toBe(0)
})
