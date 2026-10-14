import { describe, expect, it } from 'vitest'
import { addEntry, clearedText, dismissEntry, groupByApp, markSeen, MAX_ENTRIES, parseEntries, restoreEntries, unseenCount, type CenterEntry } from '../shared/notifCenter'

const base = { source: 'notification' as const, app: 'Slack', title: 'Hi' }

describe('notification center', () => {
  it('keeps the newest first and counts a chat that keeps talking as one entry', () => {
    let l: CenterEntry[] = []
    l = addEntry(l, { ...base, id: 'a', at: 1 })
    l = addEntry(l, { ...base, id: 'wa:1', at: 2, source: 'whatsapp', app: 'WhatsApp', title: 'Alice', body: 'one', thread: '1' })
    l = addEntry(l, { ...base, id: 'b', at: 3 })
    l = addEntry(l, { ...base, id: 'wa:1', at: 4, source: 'whatsapp', app: 'WhatsApp', title: 'Alice', body: 'two', thread: '1' })
    expect(l.map((e) => e.id)).toEqual(['wa:1', 'b', 'a'])
    expect(l[0]).toMatchObject({ body: 'two', count: 2, seen: false })
    expect(unseenCount(l)).toBe(3)
  })

  it('caps the list and drops icons too big to keep', () => {
    let l: CenterEntry[] = []
    for (let i = 0; i < MAX_ENTRIES + 5; i++) l = addEntry(l, { ...base, id: `n${i}`, at: i })
    expect(l).toHaveLength(MAX_ENTRIES)
    expect(l[l.length - 1].id).toBe('n5')
    expect(addEntry([], { ...base, id: 'x', at: 1, icon: 'data:' + 'a'.repeat(70_000) })[0].icon).toBeUndefined()
    expect(addEntry([], { ...base, id: 'x', at: 1, icon: 'data:small' })[0].icon).toBe('data:small')
  })

  it('dismisses one, and Undo puts cleared ones back in order without doubles', () => {
    const l = [3, 2, 1].map((at) => addEntry([], { ...base, id: `n${at}`, at })[0])
    expect(dismissEntry(l, 'n2').map((e) => e.id)).toEqual(['n3', 'n1'])
    const later = addEntry([], { ...base, id: 'n4', at: 4 })
    expect(restoreEntries(later, [...l, later[0]]).map((e) => e.id)).toEqual(['n4', 'n3', 'n2', 'n1'])
  })

  it('marks everything seen, and leaves the list alone when nothing changes', () => {
    const l = addEntry([], { ...base, id: 'a', at: 1 })
    const seen = markSeen(l)
    expect(unseenCount(seen)).toBe(0)
    expect(markSeen(seen)).toBe(seen)
  })

  it('groups by app, the app with the newest first', () => {
    let l: CenterEntry[] = []
    l = addEntry(l, { ...base, id: 'a', at: 1, app: 'Mail' })
    l = addEntry(l, { ...base, id: 'b', at: 2, app: 'Slack' })
    l = addEntry(l, { ...base, id: 'c', at: 3, app: 'Mail' })
    expect(groupByApp(l).map((g) => [g.app, g.entries.map((e) => e.id)])).toEqual([
      ['Mail', ['c', 'a']],
      ['Slack', ['b']],
    ])
  })

  it('reads a saved file entry by entry, skipping what is broken', () => {
    const ok = { id: 'a', at: 5, source: 'mail', app: 'Mail', title: 'Hi', count: 2, seen: true, thread: 'acc:1' }
    const out = parseEntries([ok, null, { id: 'b' }, { ...ok, id: 'c', source: 'fax' }, { ...ok, id: 'd', at: 9, count: -1, urgency: 'weird' }])
    expect(out.map((e) => e.id)).toEqual(['d', 'a'])
    expect(out[0]).toMatchObject({ count: 1, urgency: undefined })
    expect(parseEntries('nope')).toEqual([])
  })

  it('says how many were cleared', () => {
    expect(clearedText(1)).toBe('Cleared 1 notification')
    expect(clearedText(12)).toBe('Cleared 12 notifications')
  })
})
