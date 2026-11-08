// The command bar: type, pick with the arrows, Enter to go, Escape to close.
import '@fontsource-variable/inter'
import './command.css'
import type { CommandItem } from '@shared/command'

const q = document.getElementById('q') as HTMLInputElement
const list = document.getElementById('list')!
let items: CommandItem[] = []
let sel = 0
let seq = 0

const GLYPHS: Record<string, string> = { file: '📄', note: '🧠', calc: '=', setting: '⚙', system: '◐', ask: '✦', app: '▢', agent: '✧' }

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
    } else icon.textContent = GLYPHS[it.kind] ?? '•'
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
