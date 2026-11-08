// The buddy's pointer: an arrow that flies from the island to the spot it's
// talking about, with a label, and a ring that pulses there.
import '@fontsource-variable/inter'
import './pointer.css'
import type { PointerCmd } from '@shared/pointer'

const arrow = document.getElementById('arrow')!
const ring = document.getElementById('ring')!
const label = document.getElementById('label')!

const place = (el: HTMLElement, x: number, y: number) => {
  el.style.setProperty('--x', `${Math.round(x)}px`)
  el.style.setProperty('--y', `${Math.round(y)}px`)
}

window.island.pointer.onCmd((c: PointerCmd) => {
  if (c.t === 'hide') {
    arrow.classList.remove('on')
    ring.classList.remove('pulse')
    return
  }
  label.textContent = c.step && c.step.of > 1 ? `${c.step.n}/${c.step.of} · ${c.label}` : c.label
  // Keep the label on screen near the right and bottom edges.
  const flip = c.x > innerWidth - 260
  label.style.left = flip ? 'auto' : '26px'
  label.style.right = flip ? '14px' : 'auto'
  label.style.top = c.y > innerHeight - 70 ? '-40px' : '22px'
  if (!arrow.classList.contains('on')) {
    // Start at the island, unseen, then fly.
    arrow.style.transition = 'none'
    place(arrow, c.fromX, c.fromY)
    void arrow.offsetWidth
    arrow.style.transition = ''
    arrow.classList.add('on')
  }
  requestAnimationFrame(() => place(arrow, c.x, c.y))
  ring.classList.remove('pulse')
  place(ring, c.x, c.y)
  setTimeout(() => {
    void ring.offsetWidth
    ring.classList.add('pulse')
  }, 560)
})
window.island.pointer.ready()
