import { dominantColor, clampLightness } from '../renderer/island/music/color'

const fill = (rgb: number[], n = 64) => {
  const a = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) a.set([...rgb, 255], i * 4)
  return a
}
const lightness = ([r, g, b]: number[]) => (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255

test('the colour of a cover, dark enough for white text', () => {
  const [r, g, b] = dominantColor(fill([230, 40, 40]))
  expect(r).toBeGreaterThan(g * 2)
  expect(lightness([r, g, b])).toBeLessThanOrEqual(0.43)
  // A mostly-black cover with a splash of blue comes out blue, not black
  const mixed = new Uint8ClampedArray([...fill([5, 5, 5], 56), ...fill([30, 90, 220], 8)])
  const m = dominantColor(mixed)
  expect(m[2]).toBeGreaterThan(m[0])
  expect(lightness(m)).toBeGreaterThanOrEqual(0.21)
  // White cover: stays a neutral grey
  const w = dominantColor(fill([250, 250, 250]))
  expect(Math.max(...w) - Math.min(...w)).toBeLessThan(6)
  expect(dominantColor(new Uint8ClampedArray(0))).toEqual([83, 83, 83])
})

test('lightness is kept in a readable range', () => {
  expect(lightness(clampLightness([255, 255, 200]))).toBeLessThanOrEqual(0.43)
  expect(lightness(clampLightness([2, 2, 10]))).toBeGreaterThanOrEqual(0.21)
})
