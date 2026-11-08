import { ANIMATIONS } from '@shared/wallpaper'
import { fallback, startAnimation } from './anims'

/**
 * The live wallpaper: a video, a picture or one of the island's animations,
 * filling the screen behind everything. The island calls window.rest(true)
 * while a window covers the screen, and rest(false) to play again.
 */
const q = new URLSearchParams(location.search)
let rest: (on: boolean) => void = () => {}

const anim = q.get('anim')
if (anim) {
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  let a: ReturnType<typeof startAnimation> = null
  try {
    a = startAnimation(anim, canvas)
  } catch (e) {
    console.error('[wallpaper] animation:', e)
  }
  if (a) rest = a.rest
  else fallback(canvas, [...(ANIMATIONS.find((x) => x.id === anim)?.colors ?? ['#111', '#333'])])
} else if (q.get('kind') === 'video') {
  const v = document.createElement('video')
  v.muted = true
  v.loop = true
  v.autoplay = true
  v.playsInline = true
  v.disablePictureInPicture = true
  v.src = q.get('src') ?? ''
  document.body.append(v)
  void v.play().catch(() => {})
  rest = (on) => (on ? v.pause() : void v.play().catch(() => {}))
} else {
  const img = document.createElement('img')
  img.src = q.get('src') ?? ''
  img.alt = ''
  document.body.append(img)
}

;(window as unknown as { rest: (on: boolean) => void }).rest = rest
