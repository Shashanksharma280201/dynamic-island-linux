/**
 * Get recorded audio ready for Whisper: drop the silence around the speech
 * (long silence makes Whisper invent repeated words) and bring the level up
 * to a consistent peak. Pure.
 */
export function prepareAudio(audio: Float32Array, rate = 16000): Float32Array {
  if (audio.length === 0) return audio
  const win = Math.round(rate * 0.02) // 20 ms frames
  const frames = Math.floor(audio.length / win)
  const energy = new Float32Array(frames)
  let peakRms = 0
  for (let f = 0; f < frames; f++) {
    let s = 0
    for (let i = f * win; i < (f + 1) * win; i++) s += audio[i] * audio[i]
    energy[f] = Math.sqrt(s / win)
    if (energy[f] > peakRms) peakRms = energy[f]
  }
  const threshold = Math.max(0.004, peakRms * 0.08)
  let first = 0
  while (first < frames && energy[first] < threshold) first++
  let last = frames - 1
  while (last > first && energy[last] < threshold) last--
  if (first >= frames) return new Float32Array(0)
  // Keep a little air around the words so their edges aren't clipped.
  const pad = Math.round(rate * 0.25)
  const start = Math.max(0, first * win - pad)
  const end = Math.min(audio.length, (last + 1) * win + pad)
  const out = audio.slice(start, end)
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  const gain = peak > 0 ? Math.min(0.9 / peak, 20) : 1
  for (let i = 0; i < out.length; i++) out[i] *= gain
  return out
}
