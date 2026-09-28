import { useEffect, useState } from 'react'

/** Spotify's surface colour, used until (or instead of) the artwork's. */
export const SP_BASE = 'rgb(83, 83, 83)'

/**
 * A rich, dark-enough colour from the pixels of an image, like the gradient
 * behind Spotify's headers: saturated pixels count more, then lightness is
 * pulled into a range white text stays readable on. Pure.
 */
export function dominantColor(px: Uint8ClampedArray): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  let w = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    const pr = px[i] / 255
    const pg = px[i + 1] / 255
    const pb = px[i + 2] / 255
    const max = Math.max(pr, pg, pb)
    const min = Math.min(pr, pg, pb)
    const sat = max === 0 ? 0 : (max - min) / max
    // Favour colourful mid-tones over near-black / near-white pixels.
    const weight = 0.08 + sat * sat * 2 * (max > 0.12 && min < 0.92 ? 1 : 0.15)
    r += px[i] * weight
    g += px[i + 1] * weight
    b += px[i + 2] * weight
    w += weight
  }
  if (!w) return [83, 83, 83]
  return clampLightness([r / w, g / w, b / w])
}

/** Keep HSL lightness between 22% and 42% and give greys a little life. Pure. */
export function clampLightness([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    h /= 6
  }
  const L = Math.min(0.42, Math.max(0.22, l))
  const S = s < 0.08 ? s : Math.max(0.35, Math.min(0.75, s))
  const hue2 = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  if (S === 0) return [Math.round(L * 255), Math.round(L * 255), Math.round(L * 255)]
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S
  const p = 2 * L - q
  return [hue2(p, q, h + 1 / 3), hue2(p, q, h), hue2(p, q, h - 1 / 3)].map((v) => Math.round(v * 255)) as [number, number, number]
}

const cache = new Map<string, string>()

/** The artwork's colour as "rgb(r, g, b)" (Spotify grey until it's known). */
export function useArtColor(url: string | undefined): string {
  const [color, setColor] = useState(() => (url && cache.get(url)) || SP_BASE)
  useEffect(() => {
    if (!url) return setColor(SP_BASE)
    const hit = cache.get(url)
    if (hit) return setColor(hit)
    let live = true
    const load = async () => {
      // Remote art goes through the main process so the canvas isn't tainted.
      const src = url.startsWith('data:') ? url : await window.island.imageData(url)
      if (!src) return
      const img = new Image()
      img.src = src
      await img.decode()
      const c = document.createElement('canvas')
      c.width = c.height = 24
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, 24, 24)
      const [r, g, b] = dominantColor(ctx.getImageData(0, 0, 24, 24).data)
      const v = `rgb(${r}, ${g}, ${b})`
      if (cache.size > 100) cache.clear()
      cache.set(url, v)
      if (live) setColor(v)
    }
    load().catch(() => {})
    return () => {
      live = false
    }
  }, [url])
  return color
}
