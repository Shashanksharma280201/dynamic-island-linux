// The command bar: type, pick with the arrows, Enter to go, Escape to close.
import '@fontsource-variable/inter'
import './command.css'
import type { CommandItem } from '@shared/command'

const q = document.getElementById('q') as HTMLInputElement
const list = document.getElementById('list')!
let items: CommandItem[] = []
let sel = 0
let seq = 0

const GLYPHS: Record<string, string> = { calc: '=', system: '◐', ask: '✦', app: '▢', agent: '✧' }
/** Drawn icons (in the text colour) where a text glyph would be an emoji. */
const svg = (d: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`
const ICONS: Record<string, string> = {
  file: svg('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5'),
  note: svg('M5 4h14v16H5zM9 9h6M9 13h6M9 17h3'),
  setting: svg('M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4'),
}

function render(): void {
  list.innerHTML = ''
  items.forEach((it, i) => {
    const li = document.createElement('li')
    li.className = i === sel ? 'on' : ''
    li.setAttribute('role', 'option')
    li.dataset.kind = it.kind
    const icon = document.createElement('div')
    icon.className = 'icon'
    if (it.icon && /^data:/.test(it.icon)) {
      const img = document.createElement('img')
      img.src = it.icon
      img.alt = ''
      icon.classList.add('has-img')
      icon.append(img)
    } else if (ICONS[it.kind]) icon.innerHTML = ICONS[it.kind]
    else icon.textContent = GLYPHS[it.kind] ?? '•'
    const text = document.createElement('div')
    text.className = 'text'
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = it.title
    const sub = document.createElement('div')
    sub.className = 'sub'
    sub.textContent = it.sub
    text.append(title, sub)
    li.append(icon, text)
    li.onmousemove = () => {
      if (sel !== i) {
        sel = i
        render()
      }
    }
    li.onclick = () => go(i)
    list.append(li)
  })
  list.children[sel]?.scrollIntoView({ block: 'nearest' })
}

async function search(): Promise<void> {
  const n = ++seq
  const found = await window.island.command.query(q.value)
  if (n !== seq) return
  items = found
  sel = 0
  render()
}

function go(i: number): void {
  const it = items[i]
  if (it) void window.island.command.run(it.id)
}

q.addEventListener('input', () => void search())
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') sel = Math.min(items.length - 1, sel + 1)
  else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
  else if (e.key === 'Enter') return go(sel)
  else if (e.key === 'Escape') return void window.island.command.close()
  else return
  e.preventDefault()
  render()
})
window.island.command.onShown(() => {
  q.value = ''
  items = []
  render()
  q.focus()
})
q.focus()
