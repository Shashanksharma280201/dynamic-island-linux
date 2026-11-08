import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { Egress, PAUSED, addEntry, hostOf, isLocal, places } from '../electron/privacy'
import { describeTurn } from '../electron/agent/providers'
import { whenText } from '../shared/privacy'
import { accentOf, islandLook } from '../shared/theme'

const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m).getTime()

test('isLocal and hostOf', () => {
  expect(isLocal('localhost')).toBe(true)
  expect(isLocal('127.0.0.1:11434')).toBe(true)
  expect(isLocal('[::1]')).toBe(true)
  expect(isLocal('api.anthropic.com')).toBe(false)
  expect(hostOf('https://api.openverse.org/v1/images/?q=x')).toBe('api.openverse.org')
  expect(hostOf('Anthropic, through Claude Code')).toBe('Anthropic, through Claude Code')
})

test('addEntry counts the same send on the same day, and keeps a month', () => {
  let l = addEntry([], { feature: 'assistant', to: 'api.anthropic.com', what: 'your question', at: at(9) })
  l = addEntry(l, { feature: 'wallpaper', to: 'api.openverse.org', what: 'your search words: “fog”', at: at(9, 5) })
  l = addEntry(l, { feature: 'assistant', to: 'api.anthropic.com', what: 'your question', at: at(10) })
  expect(l).toHaveLength(2)
  expect(l[0]).toMatchObject({ feature: 'assistant', count: 2, at: at(10), first: at(9) })
  // The next day is a new row.
  l = addEntry(l, { feature: 'assistant', to: 'api.anthropic.com', what: 'your question', at: at(10) + 86_400_000 })
  expect(l).toHaveLength(3)
  // Older than 30 days goes.
  l = addEntry(l, { feature: 'services', to: 'api.github.com', what: 'x', at: at(10) + 40 * 86_400_000 })
  expect(l.map((e) => e.feature)).toEqual(['services'])
})

test('places sums each destination, newest first', () => {
  let l = addEntry([], { feature: 'assistant', to: 'api.anthropic.com', what: 'your question', at: at(9) })
  l = addEntry(l, { feature: 'brain', to: 'api.anthropic.com', what: 'a summary', at: at(11) })
  l = addEntry(l, { feature: 'wallpaper', to: 'api.openverse.org', what: 'words', at: at(10) })
  expect(places(l)).toEqual([
    { to: 'api.anthropic.com', count: 2, last: at(11), features: ['brain', 'assistant'] },
    { to: 'api.openverse.org', count: 1, last: at(10), features: ['wallpaper'] },
  ])
})

test('Egress: pausing blocks sends away, not to this computer; the log is saved', async () => {
  vi.useFakeTimers()
  const file = join(mkdtempSync(join(tmpdir(), 'egress-')), 'log.json')
  let paused = false
  let changes = 0
  const e = new Egress()
  e.init({ file, paused: () => paused, onChange: () => changes++, now: () => at(12) })
  expect(e.blocked('api.anthropic.com')).toBeNull()
  e.note('assistant', 'api.anthropic.com', 'your question')
  e.note('assistant', '127.0.0.1:11434', 'your question') // Ollama: stays here
  expect(e.view().total).toBe(1)
  expect(changes).toBe(1)
  paused = true
  expect(e.blocked('api.anthropic.com')).toBe(PAUSED)
  expect(e.blocked()).toBe(PAUSED)
  expect(e.blocked('localhost:11434')).toBeNull()
  expect(e.view().paused).toBe(true)
  await vi.advanceTimersByTimeAsync(1100)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1)
  // A fresh start reads it back.
  const again = new Egress()
  again.init({ file, paused: () => false, onChange: () => {} })
  expect(again.view().places[0].to).toBe('api.anthropic.com')
  again.clear()
  expect(again.view().total).toBe(0)
  vi.useRealTimers()
})

test('describeTurn says what a turn sends', () => {
  expect(describeTurn({ history: [] })).toBe('your question')
  expect(describeTurn({ history: [{ user: 'a', assistant: 'b' }] })).toBe('your question and 1 earlier turn')
  expect(describeTurn({ history: [], purpose: 'a summary' })).toBe('a summary')
})

test('whenText', () => {
  const now = at(15)
  expect(whenText(now - 20_000, now)).toBe('just now')
  expect(whenText(now - 5 * 60_000, now)).toBe('5 min ago')
  expect(whenText(at(9), now)).toMatch(/^today /)
  expect(whenText(at(9) - 86_400_000, now)).toMatch(/^yesterday /)
  expect(whenText(at(9) - 5 * 86_400_000, now)).toMatch(/Nov/)
})

test('the island’s look: match or always dark, with the accent', () => {
  expect(islandLook('match', false, 'purple')).toEqual({ theme: 'light', accent: { dark: '#bf5af2', light: '#a550d0' } })
  expect(islandLook('match', true, 'blue').theme).toBe('dark')
  expect(islandLook('dark', false, 'blue').theme).toBe('dark')
  expect(accentOf('nope').id).toBe('blue')
})
